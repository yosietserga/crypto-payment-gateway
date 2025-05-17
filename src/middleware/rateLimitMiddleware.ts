/**
 * Rate limiting middleware for protecting authentication endpoints
 * Implements IP-based rate limiting to prevent brute force attacks
 */
import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';
import { logger } from '../utils/logger';

// Simple in-memory store for rate limiting
// In production, use Redis or another distributed storage
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs; // Default: 15 minutes
  }

  check(key: string): boolean {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record) {
      // First attempt
      this.store.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (now > record.resetTime) {
      // Window expired, reset
      this.store.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    // Increment count
    record.count += 1;
    this.store.set(key, record);

    // Check if limit exceeded
    return record.count <= this.maxAttempts;
  }

  getRemainingAttempts(key: string): number {
    const record = this.store.get(key);
    if (!record) return this.maxAttempts;
    
    const now = Date.now();
    if (now > record.resetTime) return this.maxAttempts;
    
    return Math.max(0, this.maxAttempts - record.count);
  }

  getResetTime(key: string): number {
    const record = this.store.get(key);
    if (!record) return 0;
    return Math.max(0, Math.ceil((record.resetTime - Date.now()) / 1000));
  }
}

// Create rate limiter instance
const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes

/**
 * Rate limiting middleware for login attempts
 */
export const loginRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get client IP 
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    // Create a composite key using IP + email to prevent enumeration
    const email = req.body.email || '';
    const key = `login:${ip}:${email}`;
    
    if (!loginRateLimiter.check(key)) {
      // Too many attempts
      const resetSeconds = loginRateLimiter.getResetTime(key);
      logger.warn(`Rate limit exceeded for ${email} from ${ip}`);
      
      // Set headers to indicate rate limit status
      res.set('X-RateLimit-Limit', loginRateLimiter.maxAttempts.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + resetSeconds).toString());
      
      return next(new ApiError(429, `Too many login attempts. Please try again after ${resetSeconds} seconds.`, true));
    }
    
    // Set headers to indicate rate limit status
    res.set('X-RateLimit-Limit', loginRateLimiter.maxAttempts.toString());
    res.set('X-RateLimit-Remaining', loginRateLimiter.getRemainingAttempts(key).toString());
    
    next();
  } catch (error) {
    // In case of error, allow the request to proceed
    logger.error('Rate limit middleware error:', error);
    next();
  }
};

export default loginRateLimitMiddleware;
