import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User, UserRole } from '../db/entities/User';
import { Merchant } from '../db/entities/Merchant';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';
import { getConnection } from '../db/connection';

// Extend Express Request interface to include merchant property
declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate merchants using JWT token
 * Verifies the token and attaches the merchant object to the request
 */
export const merchantAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ApiError(401, 'No token provided', true));
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded: any = jwt.verify(token, config.security.jwtSecret);

    // Check if user exists and has merchant role
    const connection = await getConnection();
    const userRepository = connection.getRepository(User);
    const merchantRepository = connection.getRepository(Merchant);
    
    const user = await userRepository.findOne({ 
      where: { id: decoded.id },
      relations: ['merchant']
    });

    if (!user) {
      return next(new ApiError(401, 'User not found', true));
    }

    // Check if user has merchant access
    // Since we don't have a specific merchant role in the enum, we'll check if they're not an admin
    // In a real application, you might want to add a MERCHANT role to the UserRole enum
    if (user.role === UserRole.ADMIN) {
      // Admins can access merchant routes
    } else if (user.role !== UserRole.OPERATOR && user.role !== UserRole.VIEWER) {
      return next(new ApiError(403, 'Not authorized as merchant', true));
    }

    if (!user.merchant) {
      return next(new ApiError(403, 'Merchant profile not found', true));
    }

    // Attach user and merchant to request
    req.user = user;
    req.merchant = user.merchant;

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