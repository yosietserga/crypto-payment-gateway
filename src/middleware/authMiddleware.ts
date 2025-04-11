import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../db/entities/User';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate users using JWT token
 * Verifies the token and attaches the user object to the request
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ApiError(401, 'No token provided', true));
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded: any = jwt.verify(token, config.security.jwtSecret);

    // Check if user exists
    const connection = await getConnection();
    const userRepository = connection.getRepository(User);
    
    const user = await userRepository.findOne({ 
      where: { id: decoded.id }
    });

    if (!user) {
      return next(new ApiError(401, 'User not found', true));
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'JsonWebTokenError') {
        return next(new ApiError(401, 'Invalid token', true));
      }
      if (error.name === 'TokenExpiredError') {
        return next(new ApiError(401, 'Token expired', true));
      }
    }
    
    logger.error('Authentication error:', error);
    return next(new ApiError(500, 'Authentication failed', true));
  }
};

// Import getConnection at the end to avoid circular dependency
import { getConnection } from '../db/connection';