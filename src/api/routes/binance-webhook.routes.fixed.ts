import { Router, Request, Response, NextFunction } from 'express';
import { body, header } from 'express-validator';
import * as crypto from 'crypto'; // Changed to import * as crypto
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { validateRequest } from '../../middleware/validator';

const router = Router();

/**
 * Middleware to verify Binance webhook signature
 */
const verifyBinanceWebhookSignature = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['binance-signature'] as string;
    const timestamp = req.headers['binance-timestamp'] as string;
    
    // No signature check in development mode if configured
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_WEBHOOK_VERIFICATION === 'true') {
      logger.warn('Skipping Binance webhook signature verification in development mode');
      return next();
    }
    
    if (!signature || !timestamp) {
      res.status(401).json({ 
        message: 'Missing signature or timestamp',
        details: {
          hasSignature: !!signature,
          hasTimestamp: !!timestamp
        }
      });
      return;
    }
    
    // Check if timestamp is recent (within 5 minutes)
    const timestampNum = Number(timestamp);
    const now = Date.now();
    if (now - timestampNum > 5 * 60 * 1000) {
      res.status(401).json({ 
        message: 'Timestamp is too old',
        details: {
          timestamp: timestampNum,
          now,
          diff: now - timestampNum
        }
      });
      return;
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', config.binance.webhookSecret)
      .update(payload)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      res.status(401).json({ 
        message: 'Invalid signature'
      });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Error verifying Binance webhook signature', { error });
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle deposit notifications from Binance
 */
router.post(
  '/deposit',
  [
    header('binance-signature').notEmpty().withMessage('Binance signature is required'),
    header('binance-timestamp').notEmpty().withMessage('Binance timestamp is required'),
    body('txId').notEmpty().withMessage('Transaction ID is required'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('coin').notEmpty().withMessage('Coin is required'),
    body('status').notEmpty().withMessage('Status is required'),
    body('address').notEmpty().withMessage('Address is required'),
    validateRequest
  ],
  verifyBinanceWebhookSignature,
  async (req: Request, res: Response) => {
    try {
      const { txId, amount, coin, status, address, network } = req.body;
      
      logger.info(`Received Binance deposit notification for ${amount} ${coin}`, {
        txId,
        amount,
        coin,
        status,
        addressPartial: address.substring(0, 8) + '...' + address.substring(address.length - 6),
        network
      });
      
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const transaction = await transactionRepository.findOne({
        where: { 
          recipientAddress: address,
          type: TransactionType.PAYMENT,
          currency: coin
        }
      });
      
      if (!transaction) {
        logger.warn(`No matching transaction found for deposit to ${address}`, {
          txId,
          amount,
          coin,
          address
        });
        
        // Create audit log for unmatched deposit
        await auditLogRepository.save({
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: 'UNMATCHED',
          action: AuditLogAction.BINANCE_DEPOSIT, // Using the correct enum value
          data: {
            txId,
            amount,
            coin,
            status,
            address,
            network,
            matched: false
          },
          timestamp: new Date()
        });
        
        // We still return success to Binance
        return res.status(200).json({ message: 'Notification received' });
      }
      
      // Map Binance status to our status
      // Binance uses: 0: pending, 1: success, others: various failure states
      let newStatus = transaction.status;
      if (status === 0) {
        newStatus = TransactionStatus.PENDING;
      } else if (status === 1) {
        newStatus = TransactionStatus.COMPLETED;
      } else {
        newStatus = TransactionStatus.FAILED;
      }
      
      // Update transaction with deposit info
      transaction.status = newStatus;
      transaction.externalId = txId;
      transaction.confirmations = status === 1 ? 6 : 0; // If completed, consider fully confirmed
      transaction.metadata = {
        ...transaction.metadata,
        binanceDeposit: {
          txId,
          amount,
          coin,
          status,
          network,
          timestamp: new Date().toISOString()
        }
      };
      
      await transactionRepository.save(transaction);
      
      // Create audit log
      await auditLogRepository.save({
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: transaction.id,
          action: AuditLogAction.BINANCE_DEPOSIT, // Using the correct enum value
          data: {
            txId,
            amount,
            coin,
            status,
            address,
            network,
            matched: true,
            newStatus
          },
          timestamp: new Date()
        });
      
      logger.info(`Updated transaction status for deposit`, {
        transactionId: transaction.id,
        previousStatus: transaction.status,
        newStatus,
        txId
      });
      
      return res.status(200).json({ 
        message: 'Deposit notification processed',
        transactionId: transaction.id
      });
    } catch (error) {
      logger.error('Error processing deposit notification', { error });
      // Still return 200 to Binance to avoid retries
      return res.status(200).json({ 
        message: 'Error processing notification, but received',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Handle withdrawal notifications from Binance
 */
router.post(
  '/withdrawal',
  [
    header('binance-signature').notEmpty().withMessage('Binance signature is required'),
    header('binance-timestamp').notEmpty().withMessage('Binance timestamp is required'),
    body('txId').notEmpty().withMessage('Transaction ID is required'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('coin').notEmpty().withMessage('Coin is required'),
    body('status').notEmpty().withMessage('Status is required'),
    body('address').notEmpty().withMessage('Address is required'),
    body('withdrawalId').notEmpty().withMessage('Withdrawal ID is required'),
    validateRequest
  ],
  verifyBinanceWebhookSignature,
  async (req: Request, res: Response) => {
    try {
      const { txId, amount, coin, status, address, withdrawalId, network } = req.body;
      
      logger.info(`Received Binance withdrawal notification for ${amount} ${coin}`, {
        txId,
        withdrawalId,
        amount,
        coin,
        status,
        addressPartial: address.substring(0, 8) + '...' + address.substring(address.length - 6),
        network
      });
      
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // First try to find by withdrawalId in external_id, as this is the most reliable
      let transaction = await transactionRepository.findOne({
        where: { externalId: withdrawalId }
      });
      
      // If not found, try to find by address and amount
      if (!transaction) {
        transaction = await transactionRepository.findOne({
          where: { 
            recipientAddress: address,
            currency: coin,
            type: TransactionType.PAYOUT
          }
        });
      }
      
      if (!transaction) {
        logger.warn(`No matching transaction found for withdrawal ${withdrawalId}`, {
          txId,
          withdrawalId,
          amount,
          coin,
          address
        });
        
        // Create audit log for unmatched withdrawal
        await auditLogRepository.save({
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: 'UNMATCHED',
          action: AuditLogAction.BINANCE_WITHDRAWAL,
          data: {
            txId,
            withdrawalId,
            amount,
            coin,
            status,
            address,
            network,
            matched: false
          },
          timestamp: new Date()
        });
        
        // Still return success to Binance
        return res.status(200).json({ message: 'Notification received' });
      }
      
      // Map Binance status to our status
      // Binance uses: 0: email sent, 1: cancelled, 2: awaiting approval, 3: rejected,
      // 4: processing, 5: failure, 6: completed
      let newStatus = transaction.status;
      
      if (status === 6) {
        newStatus = TransactionStatus.COMPLETED;
      } else if (status === 5 || status === 1 || status === 3) {
        newStatus = TransactionStatus.FAILED;
      } else if (status === 4 || status === 0 || status === 2) {
        newStatus = TransactionStatus.PENDING;
      }
      
      // Update transaction with withdrawal info
      transaction.status = newStatus;
      transaction.externalId = withdrawalId;
      transaction.metadata = {
        ...transaction.metadata,
        binanceWithdrawal: {
          txId,
          withdrawalId,
          amount,
          coin,
          status,
          statusDescription: getBinanceWithdrawalStatus(status),
          network,
          timestamp: new Date().toISOString()
        }
      };
      
      await transactionRepository.save(transaction);
      
      // Create audit log
      await auditLogRepository.save({
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: transaction.id,
          action: AuditLogAction.BINANCE_WITHDRAWAL,
          data: {
            txId,
            withdrawalId,
            amount,
            coin,
            status,
            statusDescription: getBinanceWithdrawalStatus(status),
            address,
            network,
            matched: true,
            newStatus
          },
          timestamp: new Date()
        });
      
      logger.info(`Updated transaction status for withdrawal`, {
        transactionId: transaction.id,
        previousStatus: transaction.status,
        newStatus,
        withdrawalId,
        txId
      });
      
      return res.status(200).json({ 
        message: 'Withdrawal notification processed',
        transactionId: transaction.id
      });
    } catch (error) {
      logger.error('Error processing withdrawal notification', { error });
      // Still return 200 to Binance to avoid retries
      return res.status(200).json({ 
        message: 'Error processing notification, but received',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Helper function to get withdrawal status descriptions
 */
function getBinanceWithdrawalStatus(status: number): string {
  switch (status) {
    case 0: return 'Email sent';
    case 1: return 'Cancelled';
    case 2: return 'Awaiting approval';
    case 3: return 'Rejected';
    case 4: return 'Processing';
    case 5: return 'Failure';
    case 6: return 'Completed';
    default: return 'Unknown';
  }
}

export default router;
