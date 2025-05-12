import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { idempotencyMiddleware } from '../../middleware/idempotencyMiddleware';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';
import { QueueService } from '../../services/queueService';
import { WebhookService } from '../../services/webhookService';
import { WebhookEvent } from '../../db/entities/Webhook';
import { BinanceService } from '../../services/binanceService';

const router = Router();

/**
 * @route POST /payouts
 * @desc Create a new payout
 * @access Private (Merchant)
 */
router.post(
  '/',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('amount').isFloat({ min: 0.01 }).toFloat(),
    body('currency').isString().isLength({ min: 2, max: 10 }),
    body('network').isString().isLength({ min: 2, max: 10 }),
    body('recipientAddress').isString().isLength({ min: 10, max: 100 }),
    body('webhookUrl').optional().isURL(),
    body('metadata').optional().isObject()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }

    const { amount, currency, network, recipientAddress, webhookUrl, metadata } = req.body;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);

      // Create audit log entry
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.CREATE;
      auditLog.entityType = AuditLogEntityType.TRANSACTION;
      auditLog.userId = merchantId;
      auditLog.timestamp = new Date();

      // Initialize Binance service
      const binanceService = new BinanceService();
      
      // Create payout
      const payout = await binanceService.createPayout({
        amount,
        currency,
        network,
        recipientAddress,
        merchantId,
        webhookUrl,
        metadata
      });

      // Update audit log
      auditLog.entityId = payout.id;
      auditLog.description = `Payout created for ${amount} ${currency}`;
      await auditLogRepository.save(auditLog);

      // Queue the payout to be processed
      await QueueService.getInstance().addToQueue('binance.payout', {
        transactionId: payout.id
      });

      logger.info(`Payout created and queued for processing`, { payoutId: payout.id, merchantId });

      return res.status(201).json({
        success: true,
        data: payout
      });
    } catch (error) {
      logger.error('Error creating payout', { error, merchantId });
      next(new ApiError(500, 'Failed to create payout', true));
    }
  })
);

/**
 * @route GET /payouts/:payoutId
 * @desc Get payout status
 * @access Private (Merchant)
 */
router.get(
  '/:payoutId',
  merchantAuthMiddleware,
  [
    param('payoutId').isString()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }

    const { payoutId } = req.params;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);

      // Find payout transaction
      const payout = await transactionRepository.findOne({
        where: {
          id: payoutId,
          merchantId,
          type: TransactionType.PAYOUT
        }
      });

      if (!payout) {
        return next(new ApiError(404, 'Payout not found', true));
      }

      return res.status(200).json({
        success: true,
        data: payout
      });
    } catch (error) {
      logger.error('Error fetching payout', { error, merchantId, payoutId });
      next(new ApiError(500, 'Failed to fetch payout', true));
    }
  })
);

export default router;