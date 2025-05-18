import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { PaymentAddress, AddressStatus } from '../../db/entities/PaymentAddress';
import { Merchant, MerchantStatus } from '../../db/entities/Merchant';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { idempotencyMiddleware } from '../../middleware/idempotencyMiddleware';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * @route GET /api/v1/payments/status
 * @desc Check payment webapp connection status
 * @access Public
 */
router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Payment webapp API is operational',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route GET /api/v1/payments
 * @desc Get all payments with optional filtering
 * @access Private - Merchant only
 */
router.get(
  '/',
  merchantAuthMiddleware,
  [
    query('status').optional().isString(),
    query('search').optional().isString(),
    query('dateRange').optional().isString()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const { status, search, dateRange } = req.query;
    // Since merchantAuthMiddleware is used, merchant will be available, but we'll add a check for TypeScript
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID not found', true));
    }

    try {
      const connection = await getConnection();
      const addressRepository = connection.getRepository(PaymentAddress);

      // Build the query
      const queryBuilder = addressRepository.createQueryBuilder('address')
        .leftJoinAndSelect('address.transactions', 'transaction')
        .where('address.merchantId = :merchantId', { merchantId });

      // Add filters if provided
      if (status && status !== 'all') {
        queryBuilder.andWhere('address.status = :status', { status });
      }

      if (search) {
        // Search either in the reference field or address field
        queryBuilder.andWhere(
          '(address.reference LIKE :search OR address.address LIKE :search)', 
          { search: `%${search}%` }
        );
      }

      if (dateRange) {
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
        queryBuilder.andWhere('address.createdAt >= :dateLimit', { dateLimit });
      }

      // Order by created date, newest first
      queryBuilder.orderBy('address.createdAt', 'DESC');

      // Get results
      const addresses = await queryBuilder.getMany();

      // Transform to payment format
      const payments = addresses.map(address => {
        // Get latest transaction if any
        const transaction = address.transactions && address.transactions.length > 0 
          ? address.transactions.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] 
          : null;

        // Determine payment status based on address status and transactions
        let status = address.status;
        if (transaction) {
          if (transaction.status === TransactionStatus.CONFIRMED || 
              transaction.status === TransactionStatus.COMPLETED) {
            status = AddressStatus.USED;
          } else if (transaction.status === TransactionStatus.PENDING) {
            status = AddressStatus.ACTIVE;
          } else if (transaction.status === TransactionStatus.FAILED) {
            status = AddressStatus.BLACKLISTED;
          }
        }

        // Map any metadata from JSON string if stored as string
        let metadata = address.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (e) {
            metadata = {};
          }
        }

        return {
          id: address.id,
          reference: address.id, // Using ID as reference since 'reference' property doesn't exist
          currency: address.currency,
          expectedAmount: address.expectedAmount,
          amount: transaction ? transaction.amount : 0,
          status,
          address: address.address,
          createdAt: address.createdAt,
          updatedAt: address.updatedAt,
          expiresAt: address.expiresAt,
          metadata
        };
      });

      res.status(200).json(payments);
    } catch (error) {
      logger.error('Error fetching payments', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch payments', true));
    }
  })
);

/**
 * @route GET /api/v1/payments/:id
 * @desc Get a payment by ID
 * @access Private - Merchant only
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

    const paymentId = req.params.id;
    // Since merchantAuthMiddleware is used, merchant will be available, but we'll add a check for TypeScript
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID not found', true));
    }

    try {
      const connection = await getConnection();
      const addressRepository = connection.getRepository(PaymentAddress);
      const transactionRepository = connection.getRepository(Transaction);

      // Get payment address
      const paymentAddress = await addressRepository.findOne({
        where: { id: paymentId, merchantId }
      });

      if (!paymentAddress) {
        return next(new ApiError(404, 'Payment not found', true));
      }

      // Get transactions for this address
      const transactions = await transactionRepository.find({
        where: { paymentAddressId: paymentId },
        order: { createdAt: 'DESC' }
      });

      // Determine payment status
      let status = paymentAddress.status;
      if (transactions.length > 0) {
        const latestTransaction = transactions[0];
        if (latestTransaction.status === TransactionStatus.CONFIRMED || 
            latestTransaction.status === TransactionStatus.COMPLETED) {
          status = AddressStatus.USED;
        } else if (latestTransaction.status === TransactionStatus.PENDING) {
          status = AddressStatus.ACTIVE;
        } else if (latestTransaction.status === TransactionStatus.FAILED) {
          status = AddressStatus.BLACKLISTED;
        }
      }

      // Map any metadata from JSON string if stored as string
      let metadata = paymentAddress.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          metadata = {};
        }
      }

      res.status(200).json({
        id: paymentAddress.id,
        reference: paymentAddress.id, // Using ID as reference since reference property doesn't exist
        currency: paymentAddress.currency,
        expectedAmount: paymentAddress.expectedAmount,
        amount: transactions.length > 0 ? transactions[0].amount : 0,
        status,
        address: paymentAddress.address,
        createdAt: paymentAddress.createdAt,
        updatedAt: paymentAddress.updatedAt,
        expiresAt: paymentAddress.expiresAt,
        metadata,
        transactions: transactions.map(tx => ({
          id: tx.id,
          txHash: tx.txHash,
          amount: tx.amount,
          status: tx.status,
          confirmations: tx.confirmations,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt
        }))
      });
    } catch (error) {
      logger.error('Error fetching payment by ID', { error, paymentId, merchantId });
      next(new ApiError(500, 'Failed to fetch payment details', true));
    }
  })
);

/**
 * @route POST /api/v1/payments/payment-addresses
 * @desc Generate a new payment address for receiving cryptocurrency payments
 * @access Private - Merchant only
 */
router.post(
  '/payment-addresses',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('currency').isString().notEmpty(),
    body('expectedAmount').isNumeric(),
    body('reference').isString().notEmpty(),
    body('callbackUrl').optional().isURL(),
    body('metadata').optional().isObject()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error: ' + JSON.stringify(errors.array()), true));
    }

    const { currency, expectedAmount, reference, callbackUrl, metadata } = req.body;
    // Since merchantAuthMiddleware is used, merchant will be available, but we'll add a check for TypeScript
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID not found', true));
    }

    try {
      const connection = await getConnection();
      const addressRepository = connection.getRepository(PaymentAddress);
      const merchantRepository = connection.getRepository(Merchant);

      // Get merchant to verify active status
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });

      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }

      if (merchant.status !== MerchantStatus.ACTIVE) {
        return next(new ApiError(403, 'Merchant account is not active', true));
      }

      // Generate a crypto address (in a real app, this would call a crypto node or service)
      // For demo, we'll use a mock address generation based on currency
      const cryptoAddress = generateMockCryptoAddress(currency);
      
      // Calculate expiry time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Create new payment address
      const newAddress = addressRepository.create({
        merchantId,
        currency,
        expectedAmount,
        reference,
        address: cryptoAddress,
        callbackUrl,
        metadata,
        status: AddressStatus.ACTIVE,
        expiresAt
      });

      await addressRepository.save(newAddress);

      res.status(201).json({
        id: newAddress.id,
        address: newAddress.address,
        currency: newAddress.currency,
        expectedAmount: newAddress.expectedAmount,
        reference: newAddress.reference,
        status: newAddress.status,
        createdAt: newAddress.createdAt,
        expiresAt: newAddress.expiresAt,
        metadata: newAddress.metadata
      });
    } catch (error) {
      logger.error('Error generating payment address', { error, merchantId });
      next(new ApiError(500, 'Failed to generate payment address', true));
    }
  })
);

// Helper function to generate mock crypto address
function generateMockCryptoAddress(currency: string): string {
  const addressPrefixes: Record<string, string> = {
    BTC: '1',
    ETH: '0x',
    USDT: '0x',
    BNB: 'bnb',
    BUSD: '0x',
    XRP: 'r',
    ADA: 'addr',
    SOL: 'sol',
    DOT: '1'
  };

  const prefix = addressPrefixes[currency.toUpperCase()] || '0x';
  const randomChars = '0123456789abcdef';
  let address = prefix;
  
  // Generate random address of appropriate length based on currency
  const length = currency.toUpperCase() === 'ETH' || 
    currency.toUpperCase() === 'USDT' || 
    currency.toUpperCase() === 'BUSD' ? 40 : 34;
  
  for (let i = 0; i < length; i++) {
    address += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  
  return address;
}

/**
 * @route GET /api/v1/payment/info/:addressId
 * @desc Get payment details for a specific payment address
 * @access Public
 */
router.get(
  '/info/:addressId',
  [
    param('addressId').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const addressId = req.params.addressId;

    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const transactionRepository = connection.getRepository(Transaction);

      // Get payment address
      const paymentAddress = await paymentAddressRepository.findOne({
        where: { id: addressId }
      });

      if (!paymentAddress) {
        return next(new ApiError(404, 'Payment address not found', true));
      }

      // Check if there are any transactions for this address
      const transactions = await transactionRepository.find({
        where: { paymentAddressId: addressId },
        order: { createdAt: 'DESC' }
      });

      // Determine address status based on transaction status, then convert to a string representation for API response
      let addressStatus = paymentAddress.status;
      let transaction = null;

      if (transactions.length > 0) {
        transaction = transactions[0]; // Most recent transaction
        if (transaction.status === TransactionStatus.CONFIRMED || 
            transaction.status === TransactionStatus.COMPLETED) {
          addressStatus = AddressStatus.USED;
        } else if (transaction.status === TransactionStatus.PENDING) {
          addressStatus = AddressStatus.ACTIVE;
        } else if (transaction.status === TransactionStatus.FAILED) {
          addressStatus = AddressStatus.BLACKLISTED;
        }
      }
      
      // Convert address status enum to a client-friendly string representation
      let paymentStatus: string;
      switch (addressStatus) {
        case AddressStatus.USED:
          paymentStatus = 'COMPLETED';
          break;
        case AddressStatus.ACTIVE:
          paymentStatus = 'PROCESSING';
          break;
        case AddressStatus.BLACKLISTED:
          paymentStatus = 'FAILED';
          break;
        case AddressStatus.EXPIRED:
          paymentStatus = 'EXPIRED';
          break;
        default:
          paymentStatus = 'PENDING';
      }

      // Return payment details
      res.status(200).json({
        success: true,
        data: {
          id: paymentAddress.id,
          address: paymentAddress.address,
          currency: paymentAddress.currency,
          expectedAmount: paymentAddress.expectedAmount,
          status: paymentStatus,
          expiresAt: paymentAddress.expiresAt,
          createdAt: paymentAddress.createdAt,
          transaction: transaction ? {
            id: transaction.id,
            txHash: transaction.txHash,
            amount: transaction.amount,
            status: transaction.status,
            confirmations: transaction.confirmations,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt
          } : null
        }
      });
    } catch (error) {
      logger.error('Error fetching payment details', { error, addressId });
      next(new ApiError(500, 'Failed to fetch payment details', true));
    }
  })
);

/**
 * @route POST /api/v1/payment/verify
 * @desc Verify payment status for a transaction
 * @access Public
 */
router.post(
  '/verify',
  [
    body('transactionId').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const { transactionId } = req.body;

    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);

      // Get transaction
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress']
      });

      if (!transaction) {
        return next(new ApiError(404, 'Transaction not found', true));
      }

      // Return verification result
      res.status(200).json({
        success: true,
        data: {
          transactionId: transaction.id,
          verified: transaction.status === TransactionStatus.CONFIRMED || 
                   transaction.status === TransactionStatus.COMPLETED,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          confirmations: transaction.confirmations,
          paymentAddress: transaction.paymentAddress ? transaction.paymentAddress.address : null,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt
        }
      });
    } catch (error) {
      logger.error('Error verifying payment', { error, transactionId });
      next(new ApiError(500, 'Failed to verify payment', true));
    }
  })
);

/**
 * @route GET /api/v1/payment/merchant/:merchantId
 * @desc Get public merchant information for payment page
 * @access Public
 */
router.get(
  '/merchant/:merchantId',
  [
    param('merchantId').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.params.merchantId;

    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);

      // Get merchant with limited public information
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });

      if (!merchant) {
        return next(new ApiError(404, 'Merchant not found', true));
      }

      // Return only public information
      res.status(200).json({
        success: true,
        data: {
          id: merchant.id,
          businessName: merchant.businessName,
          logoUrl: merchant.logoUrl || null
        }
      });
    } catch (error) {
      logger.error('Error fetching merchant info', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch merchant info', true));
    }
  })
);

export default router;