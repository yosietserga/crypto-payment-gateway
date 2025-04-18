import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/authMiddleware';
import { adminMiddleware } from '../../middleware/adminMiddleware';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';
import { idempotencyMiddleware } from '../../middleware/idempotencyMiddleware';
import { QueueService } from '../../services/queueService';
import { WebhookService } from '../../services/webhookService';
import { WebhookEvent } from '../../db/entities/Webhook';

const router = Router();

/**
 * @route GET /api/v1/transactions
 * @desc Get all transactions for a merchant
 * @access Private (Merchant)
 */
router.get(
  '/',
  merchantAuthMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(Object.values(TransactionStatus)),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
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
    
    const page = req.query.page as any || 1;
    const limit = req.query.limit as any || 20;
    const offset = (page - 1) * limit;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);

      // Build query
      const queryBuilder = transactionRepository.createQueryBuilder('transaction')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .orderBy('transaction.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      // Apply filters
      if (req.query.status) {
        queryBuilder.andWhere('transaction.status = :status', { status: req.query.status });
      }

      if (req.query.startDate) {
        queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: req.query.startDate });
      }

      if (req.query.endDate) {
        queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: req.query.endDate });
      }

      // Execute query
      const [transactions, total] = await queryBuilder.getManyAndCount();

      res.status(200).json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching transactions', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch transactions', true));
    }
  })
);

/**
 * @route GET /api/v1/transactions/:id
 * @desc Get a transaction by ID
 * @access Private (Merchant)
 */
router.get(
  '/:id',
  merchantAuthMiddleware,
  [
    param('id').isUUID()
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
    
    const transactionId = req.params.id;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);

      const transaction = await transactionRepository.findOne({
        where: {
          id: transactionId,
          merchantId
        },
        relations: ['paymentAddress']
      });

      if (!transaction) {
        return next(new ApiError(404, 'Transaction not found', true));
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error('Error fetching transaction', { error, transactionId, merchantId });
      next(new ApiError(500, 'Failed to fetch transaction', true));
    }
  })
);

/**
 * @route GET /api/v1/transactions/stats
 * @desc Get transaction statistics for a merchant
 * @access Private (Merchant)
 */
router.get(
  '/stats',
  merchantAuthMiddleware,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
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
    
    const startDate = req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Default to last 30 days
    const endDate = req.query.endDate as string || new Date().toISOString();

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);

      // Get total transaction count and volume
      const totalStats = await transactionRepository
        .createQueryBuilder('transaction')
        .select('COUNT(transaction.id)', 'count')
        .addSelect('SUM(transaction.amount)', 'volume')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .getRawOne();

      // Get stats by status
      const statsByStatus = await transactionRepository
        .createQueryBuilder('transaction')
        .select('transaction.status', 'status')
        .addSelect('COUNT(transaction.id)', 'count')
        .addSelect('SUM(transaction.amount)', 'volume')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('transaction.status')
        .getRawMany();

      res.status(200).json({
        success: true,
        data: {
          total: {
            count: parseInt(totalStats.count) || 0,
            volume: parseFloat(totalStats.volume) || 0
          },
          byStatus: statsByStatus.map(stat => ({
            status: stat.status,
            count: parseInt(stat.count) || 0,
            volume: parseFloat(stat.volume) || 0
          }))
        }
      });
    } catch (error) {
      logger.error('Error fetching transaction stats', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch transaction statistics', true));
    }
  })
);

/**
 * @route PATCH /api/v1/transactions/:id
 * @desc Update a transaction (admin only)
 * @access Private (Admin)
 */
router.patch(
  '/:id',
  authMiddleware,
  adminMiddleware,
  [
    param('id').isUUID(),
    body('status').optional().isIn(Object.values(TransactionStatus)),
    body('confirmations').optional().isInt({ min: 0 }).toInt(),
    body('metadata').optional().isObject()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const transactionId = req.params.id;
    const { status, confirmations, metadata } = req.body;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);

      // Get the transaction
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId }
      });

      if (!transaction) {
        return next(new ApiError(404, 'Transaction not found', true));
      }

      // Store previous state for audit log
      const previousState = {
        status: transaction.status,
        confirmations: transaction.confirmations,
        metadata: transaction.metadata
      };

      // Update fields
      if (status) transaction.status = status;
      if (confirmations !== undefined) transaction.confirmations = confirmations;
      if (metadata) transaction.metadata = { ...transaction.metadata, ...metadata };

      // Save the updated transaction
      await transactionRepository.save(transaction);

      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.MANUAL_TRANSACTION_OVERRIDE,
        entityType: AuditLogEntityType.TRANSACTION,
        entityId: transaction.id,
        description: `Manual update of transaction by admin ${req.user?.id || 'unknown'}`,
        userId: req.user?.id,
        merchantId: transaction.merchantId,
        previousState,
        newState: {
          status: transaction.status,
          confirmations: transaction.confirmations,
          metadata: transaction.metadata
        }
      });

      await auditLogRepository.save(auditLog);

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error('Error updating transaction', { error, transactionId });
      next(new ApiError(500, 'Failed to update transaction', true));
    }
  })
);

/**
 * @route POST /api/v1/transactions/payout
 * @desc Create a new payout to a customer
 * @access Private (Merchant)
 */
router.post(
  '/payout',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('amount').isFloat({ min: 0.01 }).toFloat(),
    body('recipientAddress').isString().isLength({ min: 42, max: 42 }),
    body('currency').isString().equals('USDT'),
    body('network').isString().equals('BSC'),
    body('callbackUrl').optional().isURL(),
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
    
    const { amount, recipientAddress, currency, network, callbackUrl, webhookUrl, metadata } = req.body;
    
    try {
      // Create a new payout transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Check if Binance wallet should be used
      const useBinanceWallet = process.env.USE_BINANCE_WALLET === 'true';
      
      // Create transaction record
      const transaction = new Transaction();
      transaction.merchantId = merchantId;
      transaction.type = TransactionType.PAYOUT;
      transaction.status = TransactionStatus.PENDING;
      transaction.amount = amount;
      transaction.currency = currency;
      transaction.network = network;
      transaction.recipientAddress = recipientAddress;
      transaction.callbackUrl = callbackUrl;
      transaction.webhookUrl = webhookUrl;
      transaction.metadata = metadata || {};
      
      // Save the transaction
      const savedTransaction = await transactionRepository.save(transaction);
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.CREATE,
        entityType: AuditLogEntityType.TRANSACTION,
        entityId: savedTransaction.id,
        description: `Payout transaction created for ${amount} ${currency} to ${recipientAddress}`,
        merchantId: merchantId
      });
      
      await auditLogRepository.save(auditLog);
      
      // Process the payout
      let payoutResult;
      
      if (useBinanceWallet) {
        // Use Binance wallet for payout
        const { BinanceService } = await import('../../services/binanceService');
        const binanceService = new BinanceService();
        
        // Queue the payout to be processed
        await QueueService.getInstance().addToQueue('binance.payout', {
          transactionId: savedTransaction.id,
          amount,
          recipientAddress,
          currency,
          network
        });
        
        logger.info(`Queued Binance payout for transaction ${savedTransaction.id}`);
      } else {
        // Use local wallet for payout
        const { BlockchainService } = await import('../../services/blockchainService');
        const queueService = QueueService.getInstance();
        const webhookService = new WebhookService(queueService);
        const blockchainService = new BlockchainService(webhookService, queueService);
        
        // Queue the payout to be processed
        await queueService.addToQueue('transaction.payout', {
          transactionId: savedTransaction.id
        });
        
        logger.info(`Queued blockchain payout for transaction ${savedTransaction.id}`);
      }
      
      // Send initial webhook notification
      if (webhookUrl) {
        const { WebhookService } = await import('../../services/webhookService');
        const queueService = QueueService.getInstance();
        const webhookService = new WebhookService(queueService);
        
        await webhookService.sendWebhookNotification(
          merchantId,
          WebhookEvent.PAYOUT_INITIATED,
          {
            id: savedTransaction.id,
            status: savedTransaction.status,
            amount,
            currency,
            recipientAddress,
            createdAt: savedTransaction.createdAt
          }
        );
      }
      
      // Return the transaction details
      res.status(201).json({
        success: true,
        data: {
          id: savedTransaction.id,
          status: savedTransaction.status,
          amount,
          currency,
          recipientAddress,
          createdAt: savedTransaction.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating payout transaction', { error, merchantId });
      next(new ApiError(500, 'Failed to create payout transaction', true));
    }
  })
);

export default router;