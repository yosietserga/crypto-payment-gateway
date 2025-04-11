import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { PaymentAddress, AddressStatus, AddressType } from '../../db/entities/PaymentAddress';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { idempotencyMiddleware } from '../../middleware/idempotencyMiddleware';
import { BlockchainService } from '../../services/blockchainService';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';

const router = Router();

// Import required services
import { WebhookService } from '../../services/webhookService';
import { QueueService } from '../../services/queueService';

// Initialize services
let blockchainService: BlockchainService;
let webhookService: WebhookService;
let queueService: QueueService;

// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getBlockchainService = () => {
  if (!blockchainService) {
    // Initialize dependent services first
    if (!webhookService) {
      webhookService = new WebhookService(queueService || new QueueService());
    }
    if (!queueService) {
      queueService = new QueueService();
    }
    // Initialize blockchain service with proper dependencies
    blockchainService = new BlockchainService(webhookService, queueService);
  }
  return blockchainService;
};

/**
 * @route POST /api/v1/addresses
 * @desc Generate a new payment address
 * @access Private (Merchant)
 */
router.post(
  '/',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('expectedAmount').optional().isFloat({ min: 0.01 }).toFloat(),
    body('metadata').optional().isObject(),
    body('callbackUrl').optional().isURL(),
    body('expiresIn').optional().isInt({ min: 300, max: 86400 }).toInt() // 5 minutes to 24 hours
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
    const { expectedAmount, metadata, callbackUrl } = req.body;
    
    try {
      // Generate a new payment address
      const blockchainService = getBlockchainService();
      const paymentAddress = await blockchainService.generatePaymentAddress(
        merchantId,
        expectedAmount,
        metadata
      );
      
      // Set callback URL if provided
      if (callbackUrl) {
        paymentAddress.callbackUrl = callbackUrl;
        
        // Save the updated address
        const connection = await getConnection();
        const paymentAddressRepository = connection.getRepository(PaymentAddress);
        await paymentAddressRepository.save(paymentAddress);
      }
      
      // Set custom expiration if provided
      if (req.body.expiresIn) {
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + req.body.expiresIn);
        paymentAddress.expiresAt = expiresAt;
        
        // Save the updated address
        const connection = await getConnection();
        const paymentAddressRepository = connection.getRepository(PaymentAddress);
        await paymentAddressRepository.save(paymentAddress);
      }
      
      res.status(201).json({
        success: true,
        data: {
          id: paymentAddress.id,
          address: paymentAddress.address,
          expectedAmount: paymentAddress.expectedAmount,
          currency: paymentAddress.currency,
          expiresAt: paymentAddress.expiresAt,
          metadata: paymentAddress.metadata
        }
      });
    } catch (error) {
      logger.error('Error generating payment address', { error, merchantId });
      next(new ApiError(500, 'Failed to generate payment address', true));
    }
  })
);

/**
 * @route GET /api/v1/addresses
 * @desc Get all payment addresses for a merchant
 * @access Private (Merchant)
 */
router.get(
  '/',
  merchantAuthMiddleware,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(Object.values(AddressStatus)),
    query('type').optional().isIn(Object.values(AddressType))
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
      const paymentAddressRepository = connection.getRepository(PaymentAddress);

      // Build query
      const queryBuilder = paymentAddressRepository.createQueryBuilder('address')
        .where('address.merchantId = :merchantId', { merchantId })
        .orderBy('address.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      // Apply filters
      if (req.query.status) {
        queryBuilder.andWhere('address.status = :status', { status: req.query.status });
      }

      if (req.query.type) {
        queryBuilder.andWhere('address.type = :type', { type: req.query.type });
      }

      // Execute query
      const [addresses, total] = await queryBuilder.getManyAndCount();

      // Remove sensitive data
      const sanitizedAddresses = addresses.map(address => {
        const { privateKey, ...sanitized } = address;
        return sanitized;
      });

      res.status(200).json({
        success: true,
        data: {
          addresses: sanitizedAddresses,
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
 * @route GET /api/v1/addresses/:id
 * @desc Get a payment address by ID
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
    const addressId = req.params.id;

    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);

      const address = await paymentAddressRepository.findOne({
        where: {
          id: addressId,
          merchantId
        }
      });

      if (!address) {
        return next(new ApiError(404, 'Payment address not found', true));
      }

      // Remove sensitive data
      const { privateKey, ...sanitizedAddress } = address;

      res.status(200).json({
        success: true,
        data: sanitizedAddress
      });
    } catch (error) {
      logger.error('Error fetching payment address', { error, addressId, merchantId });
      next(new ApiError(500, 'Failed to fetch payment address', true));
    }
  })
);

/**
 * @route GET /api/v1/addresses/:address/balance
 * @desc Get the balance of a payment address
 * @access Private (Merchant)
 */
router.get(
  '/:address/balance',
  merchantAuthMiddleware,
  [
    param('address').matches(/^0x[a-fA-F0-9]{40}$/).withMessage('Invalid Ethereum address format')
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
    const address = req.params.address;

    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);

      // Verify the address belongs to the merchant
      const paymentAddress = await paymentAddressRepository.findOne({
        where: {
          address,
          merchantId
        }
      });

      if (!paymentAddress) {
        return next(new ApiError(404, 'Payment address not found', true));
      }

      // Get the balance from the blockchain
      const blockchainService = getBlockchainService();
      const balance = await blockchainService.getUsdtBalance(address);
      
      // Convert to decimal
      const decimals = 18; // USDT on BSC has 18 decimals
      const balanceDecimal = parseFloat(balance.toString()) / Math.pow(10, decimals);

      res.status(200).json({
        success: true,
        data: {
          address,
          balance: balanceDecimal,
          currency: 'USDT'
        }
      });
    } catch (error) {
      logger.error('Error fetching address balance', { error, address, merchantId });
      next(new ApiError(500, 'Failed to fetch address balance', true));
    }
  })
);

export default router;