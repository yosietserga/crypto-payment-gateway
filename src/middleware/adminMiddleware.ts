import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';
import { UserRole } from '../db/entities/User';

/**
 * Middleware to check if the authenticated user has admin role
 * Must be used after authMiddleware
 */
export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user exists in request (should be attached by authMiddleware)
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required', true));
    }

    // Check if user has admin role
    if (req.user.role !== UserRole.ADMIN) {
      return next(new ApiError(403, 'Admin access required', true));
    }

    // User is admin, proceed
    next();
  } catch (error) {
    return next(new ApiError(500, 'Admin authorization failed', true));
  }
};