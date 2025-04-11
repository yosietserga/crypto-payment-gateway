import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';
import { getConnection } from '../db/connection';

/**
 * Middleware to handle idempotency for API requests
 * Uses idempotency keys to prevent duplicate operations
 */
export const idempotencyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get idempotency key from header
    const idempotencyKey = req.headers['x-idempotency-key'] as string;

    // If no idempotency key is provided, generate one and continue
    if (!idempotencyKey) {
      req.headers['x-idempotency-key'] = uuidv4();
      return next();
    }

    // Check if this idempotency key has been used before
    const connection = await getConnection();
    const idempotencyKeyRepository = connection.getRepository(IdempotencyKey);
    const existingKey = await idempotencyKeyRepository.findOne({ where: { key: idempotencyKey } });

    if (existingKey) {
      // If the key exists and has a response, return the cached response
      if (existingKey.response) {
        logger.info(`Using cached response for idempotency key: ${idempotencyKey}`);
        return res.status(existingKey.statusCode).json(JSON.parse(existingKey.response));
      }

      // If the key exists but has no response (request is in progress)
      return next(new ApiError(409, 'Request with this idempotency key is already in progress', true));
    }

    // Create a new idempotency key record
    const newKey = new IdempotencyKey();
    newKey.key = idempotencyKey;
    newKey.method = req.method;
    newKey.path = req.path;
    newKey.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await idempotencyKeyRepository.save(newKey);

    // Store the original response methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to capture the response
    res.json = function (body: any): Response {
      captureResponse(res.statusCode, body);
      return originalJson.call(this, body);
    };

    res.send = function (body: any): Response {
      captureResponse(res.statusCode, body);
      return originalSend.call(this, body);
    };

    // Function to capture and store the response
    const captureResponse = async (statusCode: number, body: any) => {
      try {
        // Update the idempotency key with the response
        await idempotencyKeyRepository.update(
          { key: idempotencyKey },
          {
            statusCode,
            response: JSON.stringify(body),
            completedAt: new Date()
          }
        );
      } catch (error) {
        logger.error(`Failed to update idempotency key: ${idempotencyKey}`, error);
      }
    };

    next();
  } catch (error) {
    logger.error('Idempotency middleware error:', error);
    next(new ApiError(500, 'Idempotency check failed', true));
  }
};