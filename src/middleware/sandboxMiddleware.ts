import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sandboxConfig } from '../config/sandbox';

// Extend Express Request type to include sandbox properties
declare global {
  namespace Express {
    interface Request {
      sandbox?: boolean;
      sandboxConfig?: typeof sandboxConfig;
    }
  }
}

/**
 * Middleware to handle sandbox environment detection and setup
 * This middleware will modify the request object to indicate sandbox mode
 * and provide access to sandbox-specific functionality
 */
export const sandboxMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check if we're in sandbox mode based on the URL or environment
  const isSandboxRequest = req.path.startsWith('/sandbox/') || config.isSandboxMode;
  
  // Add sandbox flag to request object
  req.sandbox = isSandboxRequest;
  
  // If this is a sandbox request, add sandbox utilities to the request
  if (isSandboxRequest) {
    // Add sandbox config to request for controllers to access
    req.sandboxConfig = sandboxConfig;
    
    // Log sandbox request (debug level to avoid cluttering logs)
    logger.debug(`Sandbox request: ${req.method} ${req.path}`);
    
    // Add sandbox header to response
    res.setHeader('X-Sandbox-Mode', 'true');
  }
  
  next();
};