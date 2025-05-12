import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import { config } from '../../config';

const router = Router();

// Import the internal routes we'll forward to
import addressRoutes from './address.routes';
import transactionRoutes from './transaction.routes';
import payoutRoutes from './payout.routes';

/**
 * This router provides compatibility between the documented API endpoints
 * and the internal API structure. It forwards requests from the documented
 * endpoints to the corresponding internal endpoints.
 */

// Forward /payment-addresses to /api/v1/addresses
router.all('/payment-addresses/*', (req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Forwarding request from /payment-addresses to /api/v1/addresses`);
  // Adjust the URL to point to the internal endpoint
  req.url = req.url.replace('/payment-addresses', '');
  // Forward to address routes
  return addressRoutes(req, res, next);
});

// Forward /transactions to /api/v1/transactions
router.all('/transactions/*', (req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Forwarding request from /transactions to /api/v1/transactions`);
  // Adjust the URL to point to the internal endpoint
  req.url = req.url.replace('/transactions', '');
  // Forward to transaction routes
  return transactionRoutes(req, res, next);
});

// Forward /payouts to /api/v1/payouts
router.all('/payouts/*', (req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Forwarding request from /payouts to /api/v1/payouts`);
  // Adjust the URL to point to the internal endpoint
  req.url = req.url.replace('/payouts', '');
  // Forward to payout routes
  return payoutRoutes(req, res, next);
});

export default router;