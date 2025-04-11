"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotencyMiddleware = void 0;
const uuid_1 = require("uuid");
const IdempotencyKey_1 = require("../db/entities/IdempotencyKey");
const errorHandler_1 = require("./errorHandler");
const logger_1 = require("../utils/logger");
const connection_1 = require("../db/connection");
/**
 * Middleware to handle idempotency for API requests
 * Uses idempotency keys to prevent duplicate operations
 */
const idempotencyMiddleware = async (req, res, next) => {
    try {
        // Get idempotency key from header
        const idempotencyKey = req.headers['x-idempotency-key'];
        // If no idempotency key is provided, generate one and continue
        if (!idempotencyKey) {
            req.headers['x-idempotency-key'] = (0, uuid_1.v4)();
            return next();
        }
        // Check if this idempotency key has been used before
        const connection = await (0, connection_1.getConnection)();
        const idempotencyKeyRepository = connection.getRepository(IdempotencyKey_1.IdempotencyKey);
        const existingKey = await idempotencyKeyRepository.findOne({ where: { key: idempotencyKey } });
        if (existingKey) {
            // If the key exists and has a response, return the cached response
            if (existingKey.response) {
                logger_1.logger.info(`Using cached response for idempotency key: ${idempotencyKey}`);
                return res.status(existingKey.statusCode).json(JSON.parse(existingKey.response));
            }
            // If the key exists but has no response (request is in progress)
            return next(new errorHandler_1.ApiError(409, 'Request with this idempotency key is already in progress', true));
        }
        // Create a new idempotency key record
        const newKey = new IdempotencyKey_1.IdempotencyKey();
        newKey.key = idempotencyKey;
        newKey.method = req.method;
        newKey.path = req.path;
        newKey.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await idempotencyKeyRepository.save(newKey);
        // Store the original response methods
        const originalJson = res.json;
        const originalSend = res.send;
        // Override response methods to capture the response
        res.json = function (body) {
            captureResponse(res.statusCode, body);
            return originalJson.call(this, body);
        };
        res.send = function (body) {
            captureResponse(res.statusCode, body);
            return originalSend.call(this, body);
        };
        // Function to capture and store the response
        const captureResponse = async (statusCode, body) => {
            try {
                // Update the idempotency key with the response
                await idempotencyKeyRepository.update({ key: idempotencyKey }, {
                    statusCode,
                    response: JSON.stringify(body),
                    completedAt: new Date()
                });
            }
            catch (error) {
                logger_1.logger.error(`Failed to update idempotency key: ${idempotencyKey}`, error);
            }
        };
        next();
    }
    catch (error) {
        logger_1.logger.error('Idempotency middleware error:', error);
        next(new errorHandler_1.ApiError(500, 'Idempotency check failed', true));
    }
};
exports.idempotencyMiddleware = idempotencyMiddleware;
//# sourceMappingURL=idempotencyMiddleware.js.map