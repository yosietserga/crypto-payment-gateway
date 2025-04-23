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

const router = Router();

/**
 * @route GET /api/v1/payment-webapp/status
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
 * @route GET /api/v1/payment-webapp/payment/:addressId
 * @desc Get payment details for a specific payment address
 * @access Public
 */
router.get(
  '/payment/:addressId',
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

      // Determine payment status
      let paymentStatus = 'PENDING';
      let transaction = null;

      if (transactions.length > 0) {
        transaction = transactions[0]; // Most recent transaction
        if (transaction.status === TransactionStatus.CONFIRMED || 
            transaction.status === TransactionStatus.COMPLETED) {
          paymentStatus = 'COMPLETED';
        } else if (transaction.status === TransactionStatus.PENDING) {
          paymentStatus = 'PROCESSING';
        } else if (transaction.status === TransactionStatus.FAILED) {
          paymentStatus = 'FAILED';
        }
      } else if (paymentAddress.status === AddressStatus.EXPIRED) {
        paymentStatus = 'EXPIRED';
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
 * @route POST /api/v1/payment-webapp/verify-payment
 * @desc Verify payment status for a transaction
 * @access Public
 */
router.post(
  '/verify-payment',
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
 * @route GET /api/v1/payment-webapp/merchant-info/:merchantId
 * @desc Get public merchant information for payment page
 * @access Public
 */
router.get(
  '/merchant-info/:merchantId',
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