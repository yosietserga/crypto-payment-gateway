import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { Merchant, MerchantStatus } from '../../db/entities/Merchant';
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
      const merchantRepository = connection.getRepository(Merchant);
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Get merchant and check status
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      if (merchant.status !== MerchantStatus.ACTIVE) {
        return next(new ApiError(403, 'Merchant account is not active', true));
      }

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
      
      // Extract meaningful error message
      let errorMessage = 'Failed to create payout';
      let statusCode = 500;
      let errorDetails = '';
      
      // Type guard to check if error is an object with a message property
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        errorDetails = error.message;
        
        // Handle specific error types
        if (error.message.includes('Binance API authentication')) {
          errorMessage = 'Binance API authentication failed - please check your API keys and permissions';
          statusCode = 400; // Bad request is more appropriate than 500 for auth issues
        } else if (error.message.includes('Invalid API-key')) {
          errorMessage = 'Invalid Binance API key - please check your API configuration';
          statusCode = 400;
        } else if (error.message.includes('insufficient balance')) {
          errorMessage = 'Insufficient balance to complete this payout';
          statusCode = 400;
        }
      }
      
      // Provide detailed error response
      return res.status(statusCode).json({
        success: false,
        error: {
          message: errorMessage,
          code: statusCode,
          details: process.env.NODE_ENV === 'production' ? undefined : errorDetails
        }
      });
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
      const merchantRepository = connection.getRepository(Merchant);
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get merchant and check status
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      if (merchant.status !== MerchantStatus.ACTIVE) {
        return next(new ApiError(403, 'Merchant account is not active', true));
      }

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

/**
 * @route GET /payouts
 * @desc Get list of payouts with optional filtering
 * @access Private (Merchant)
 */
router.get(
  '/',
  merchantAuthMiddleware,
  [
    query('status').optional().isString(),
    query('currency').optional().isString(),
    query('dateRange').optional().isString(),
    query('search').optional().isString(),
    query('minAmount').optional().isFloat(),
    query('maxAmount').optional().isFloat()
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

    const { status, currency, dateRange, search, minAmount, maxAmount } = req.query;

    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get merchant and check status
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      if (merchant.status !== MerchantStatus.ACTIVE) {
        return next(new ApiError(403, 'Merchant account is not active', true));
      }

      // Build the query
      const queryBuilder = transactionRepository.createQueryBuilder('transaction')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .andWhere('transaction.type = :type', { type: TransactionType.PAYOUT });

      // Add filters if provided
      if (status && typeof status === 'string' && status !== 'all') {
        queryBuilder.andWhere('transaction.status = :status', { status: status.toUpperCase() });
      }

      if (currency && typeof currency === 'string') {
        queryBuilder.andWhere('transaction.currency = :currency', { currency });
      }

      if (search && typeof search === 'string') {
        // Search in transaction hash or recipient address
        queryBuilder.andWhere(
          '(transaction.transactionHash LIKE :search OR transaction.recipientAddress LIKE :search OR transaction.metadata LIKE :search)', 
          { search: `%${search}%` }
        );
      }

      if (minAmount && !isNaN(Number(minAmount))) {
        const minAmountValue = Number(minAmount);
        queryBuilder.andWhere('transaction.amount >= :minAmount', { minAmount: minAmountValue });
      }

      if (maxAmount && !isNaN(Number(maxAmount))) {
        const maxAmountValue = Number(maxAmount);
        queryBuilder.andWhere('transaction.amount <= :maxAmount', { maxAmount: maxAmountValue });
      }

      if (dateRange && typeof dateRange === 'string') {
        let daysAgo = 7;
        switch (dateRange) {
          case '1d': daysAgo = 1; break;
          case '7d': daysAgo = 7; break;
          case '30d': daysAgo = 30; break;
          case '90d': daysAgo = 90; break;
          default: daysAgo = 7;
        }

        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - daysAgo);
        queryBuilder.andWhere('transaction.createdAt >= :dateLimit', { dateLimit });
      }

      // Order by created date, newest first
      queryBuilder.orderBy('transaction.createdAt', 'DESC');

      // Get results
      const payouts = await queryBuilder.getMany();

      // Format payouts with any additional required data
      const formattedPayouts = payouts.map(payout => {
        // Parse metadata if stored as string
        let metadata = payout.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (e) {
            metadata = {};
          }
        }

        return {
          ...payout,
          metadata
        };
      });

      res.status(200).json({
        success: true,
        data: formattedPayouts
      });
    } catch (error) {
      logger.error('Error fetching payouts', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch payouts', true));
    }
  })
);

export default router;