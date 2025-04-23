import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { PaymentAddress, AddressStatus } from '../../db/entities/PaymentAddress';
import { Merchant } from '../../db/entities/Merchant';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { idempotencyMiddleware } from '../../middleware/idempotencyMiddleware';
import { logger } from '../../utils/logger';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { Webhook, WebhookEvent } from '../../db/entities/Webhook';

// Define interfaces for request parameters
interface PaginationQuery {
  page?: string;
  limit?: string;
  status?: AddressStatus;
}

interface PaymentAddressRequest {
  currency: string;
  expectedAmount: string | number;
  expiresAt?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

interface MerchantProfileUpdate {
  businessName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  [key: string]: string | undefined;
}

const router = Router();

/**
 * @route GET /api/v1/merchant/dashboard
 * @desc Get merchant dashboard data
 * @access Private (Merchant)
 */
router.get(
  '/dashboard',
  merchantAuthMiddleware,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const merchantRepository = connection.getRepository(Merchant);
      
      // Get merchant details
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      // Get transaction statistics
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      
      // Get total transaction count and volume
      const totalStats = await transactionRepository
        .createQueryBuilder('transaction')
        .select('COUNT(transaction.id)', 'count')
        .addSelect('SUM(transaction.amount)', 'volume')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .andWhere('transaction.createdAt >= :startDate', { startDate })
        .getRawOne();
      
      // Get stats by status
      const statsByStatus = await transactionRepository
        .createQueryBuilder('transaction')
        .select('transaction.status', 'status')
        .addSelect('COUNT(transaction.id)', 'count')
        .addSelect('SUM(transaction.amount)', 'volume')
        .where('transaction.merchantId = :merchantId', { merchantId })
        .andWhere('transaction.createdAt >= :startDate', { startDate })
        .groupBy('transaction.status')
        .getRawMany();
      
      // Get active payment addresses
      const activeAddressCount = await paymentAddressRepository.count({
        where: {
          merchantId,
          status: AddressStatus.ACTIVE
        }
      });
      
      // Get recent transactions
      const recentTransactions = await transactionRepository.find({
        where: { merchantId },
        order: { createdAt: 'DESC' },
        take: 5
      });
      
      res.status(200).json({
        success: true,
        data: {
          merchant: {
            id: merchant.id,
            businessName: merchant.businessName,
            status: merchant.status,
            createdAt: merchant.createdAt
          },
          stats: {
            total: {
              count: parseInt(totalStats?.count?.toString() || '0', 10),
              volume: parseFloat(totalStats?.volume?.toString() || '0')
            },
            byStatus: statsByStatus.map(stat => ({
              status: stat.status,
              count: parseInt(stat.count.toString(), 10),
              volume: parseFloat(stat.volume?.toString() || '0')
            })),
            activeAddresses: activeAddressCount
          },
          recentTransactions
        }
      });
    } catch (error) {
      logger.error('Error fetching merchant dashboard data', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch dashboard data', true));
    }
  })
);

/**
 * @route GET /api/v1/merchant/payment-addresses
 * @desc Get merchant payment addresses
 * @access Private (Merchant)
 */
router.get(
  '/payment-addresses',
  merchantAuthMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(Object.values(AddressStatus))
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, `Validation error: ${errors.array().map(err => `${(err as any).path || (err as any).param || 'field'} ${err.msg}`).join(', ')}`, true));
    }

    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    const { page: pageStr = '1', limit: limitStr = '20', status } = req.query as PaginationQuery;
    const page = parseInt(pageStr, 10);
    const limit = parseInt(limitStr, 10);
    const offset = (page - 1) * limit;

    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);

      // Build query
      const queryBuilder = paymentAddressRepository.createQueryBuilder('address')
        .where('address.merchantId = :merchantId', { merchantId })
        .orderBy('address.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      // Apply filters
      if (status) {
        queryBuilder.andWhere('address.status = :status', { status });
      }

      // Execute query
      const [addresses, total] = await queryBuilder.getManyAndCount();

      res.status(200).json({
        success: true,
        data: {
          addresses,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching payment addresses', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch payment addresses', true));
    }
  })
);

/**
 * @route POST /api/v1/merchant/payment-addresses
 * @desc Create a new payment address
 * @access Private (Merchant)
 */
router.post(
  '/payment-addresses',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('currency').isString().isIn(['USDT']),
    body('expectedAmount').isNumeric(),
    body('expiresAt').optional().isISO8601(),
    body('callbackUrl').optional().isURL(),
    body('metadata').optional().isObject()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, `Validation error: ${errors.array().map(err => `${(err as any).path || (err as any).param || 'field'} ${err.msg}`).join(', ')}`, true));
    }

    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    const { currency, expectedAmount, expiresAt, callbackUrl, metadata } = req.body as PaymentAddressRequest;

    try {
      // Import services dynamically to avoid circular dependencies
      const { BlockchainService } = await import('../../services/blockchainService');
      const { WebhookService } = await import('../../services/webhookService');
      const { QueueService } = await import('../../services/queueService');
      
      // Initialize services
      const queueService = QueueService.getInstance();
      const webhookService = new WebhookService(queueService);
      const blockchainService = new BlockchainService(webhookService, queueService);
      
      // Generate payment address
      const paymentAddress = await blockchainService.generatePaymentAddress(
        merchantId,
        parseFloat(expectedAmount.toString()),
        {
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          callbackUrl,
          ...metadata
        }
      );

      // Log the action
      const connection = await getConnection();
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.CREATE;
      auditLog.entityType = AuditLogEntityType.PAYMENT_ADDRESS;
      auditLog.entityId = paymentAddress.id;
      auditLog.description = `Payment address created: ${paymentAddress.address}`;
      auditLog.previousState = null;
      auditLog.newState = { address: paymentAddress.address, expectedAmount };
      auditLog.userId = req.user?.id || null;
      auditLog.merchantId = merchantId;
      await auditLogRepository.save(auditLog);

      res.status(201).json({
        success: true,
        data: paymentAddress
      });
    } catch (error) {
      logger.error('Error creating payment address', { error, merchantId });
      next(new ApiError(500, 'Failed to create payment address', true));
    }
  })
);

/**
 * @route GET /api/v1/merchant/profile
 * @desc Get merchant profile
 * @access Private (Merchant)
 */
router.get(
  '/profile',
  merchantAuthMiddleware,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);
      
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId },
        relations: ['createdBy']
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      // Remove sensitive information
      const { createdBy, ...merchantData } = merchant;
      const contactInfo = {
        contactName: createdBy ? `${createdBy.firstName} ${createdBy.lastName}`.trim() : '',
        contactEmail: merchant.email,
        contactPhone: merchant.phone
      };
      
      res.status(200).json({
        success: true,
        data: {
          ...merchantData,
          contactInfo
        }
      });
    } catch (error) {
      logger.error('Error fetching merchant profile', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch merchant profile', true));
    }
  })
);

/**
 * @route PUT /api/v1/merchant/profile
 * @desc Update merchant profile
 * @access Private (Merchant)
 */
router.put(
  '/profile',
  merchantAuthMiddleware,
  [
    body('businessName').optional().isString().trim().isLength({ min: 2 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone('any'),
    body('address').optional().isString(),
    body('city').optional().isString(),
    body('state').optional().isString(),
    body('country').optional().isString(),
    body('zipCode').optional().isString()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, `Validation error: ${errors.array().map(err => `${(err as any).path || (err as any).param || 'field'} ${err.msg}`).join(', ')}`, true));
    }

    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }
      
      // Store previous state for audit log
      const previousState = { ...merchant };
      
      // Update merchant fields
      const updatableFields = [
        'businessName', 'email', 'phone', 'address',
        'city', 'state', 'country', 'zipCode'
      ];
      
      const updateData = req.body as MerchantProfileUpdate;
      
      updatableFields.forEach(field => {
        if (updateData[field] !== undefined) {
          // Type-safe assignment using keyof
          const key = field as keyof Merchant;
          if (typeof merchant[key] === 'string') {
            (merchant[key] as string) = updateData[field] as string;
          }
        }
      });
      
      // Save updated merchant
      const updatedMerchant = await merchantRepository.save(merchant);
      
      // Log the update
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.UPDATE;
      auditLog.entityType = AuditLogEntityType.MERCHANT;
      auditLog.entityId = merchantId;
      auditLog.description = `Merchant profile updated`;
      auditLog.previousState = previousState;
      auditLog.newState = updatedMerchant;
      auditLog.userId = req.user?.id || null;
      auditLog.merchantId = merchantId;
      await auditLogRepository.save(auditLog);
      
      res.status(200).json({
        success: true,
        data: updatedMerchant
      });
    } catch (error) {
      logger.error('Error updating merchant profile', { error, merchantId });
      next(new ApiError(500, 'Failed to update merchant profile', true));
    }
  })
);

/**
 * @route GET /api/v1/merchant/webhooks
 * @desc Get merchant webhooks
 * @access Private (Merchant)
 */
router.get(
  '/webhooks',
  merchantAuthMiddleware,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);
      
      const webhooks = await webhookRepository.find({
        where: { merchantId },
        order: { createdAt: 'DESC' }
      });
      
      res.status(200).json({
        success: true,
        data: webhooks
      });
    } catch (error) {
      logger.error('Error fetching merchant webhooks', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch webhooks', true));
    }
  })
);

export default router;