# Alternative Workflows Implementation Plan

This document outlines the implementation plan for the alternative payment workflows in the Crypto Payment Gateway, focusing on handling incorrect payment amounts, implementing refund mechanisms, and managing payments to expired addresses.

## 1. Handling Incorrect Payment Amounts

### Code Changes Required

#### 1.1 Update Transaction Entity

Add a new `PARTIAL` status to the `TransactionStatus` enum in `src/db/entities/Transaction.ts`:

```typescript
export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  SETTLED = 'settled',
  PARTIAL = 'partial' // New status for partial payments
}
```

#### 1.2 Update Webhook Entity

Add new webhook event types in `src/db/entities/Webhook.ts`:

```typescript
export enum WebhookEvent {
  // Existing events
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_CONFIRMED = 'payment.confirmed',
  PAYMENT_FAILED = 'payment.failed',
  ADDRESS_CREATED = 'address.created',
  ADDRESS_EXPIRED = 'address.expired',
  SETTLEMENT_COMPLETED = 'settlement.completed',
  TRANSACTION_SETTLED = 'transaction.settled',
  // New events
  PAYMENT_PARTIAL = 'payment.partial',
  PAYMENT_EXCESS = 'payment.excess',
  PAYMENT_TO_EXPIRED_ADDRESS = 'payment.expired_address',
  REFUND_INITIATED = 'refund.initiated',
  REFUND_COMPLETED = 'refund.completed',
  REFUND_FAILED = 'refund.failed'
}
```

#### 1.3 Modify BlockchainService

Update the `processIncomingTransaction` method in `src/services/blockchainService.ts` to validate payment amounts:

```typescript
// Add to processIncomingTransaction method
if (paymentAddress.expectedAmount) {
  // Check for underpayment
  if (amountDecimal < paymentAddress.expectedAmount * 0.99) { // 1% tolerance
    transaction.status = TransactionStatus.PARTIAL;
    // Store the expected amount in metadata for reference
    transaction.metadata = {
      ...transaction.metadata,
      expectedAmount: paymentAddress.expectedAmount,
      amountDifference: paymentAddress.expectedAmount - amountDecimal
    };
    
    // Send webhook notification for partial payment
    await this.webhookService.sendWebhookNotification(
      paymentAddress.merchantId,
      WebhookEvent.PAYMENT_PARTIAL,
      {
        id: savedTx.id,
        txHash,
        amount: amountDecimal,
        expectedAmount: paymentAddress.expectedAmount,
        status: TransactionStatus.PARTIAL
      }
    );
  }
  
  // Check for overpayment
  if (amountDecimal > paymentAddress.expectedAmount * 1.01) { // 1% tolerance
    // Store the excess amount in metadata
    transaction.metadata = {
      ...transaction.metadata,
      expectedAmount: paymentAddress.expectedAmount,
      excessAmount: amountDecimal - paymentAddress.expectedAmount,
      refundPending: true
    };
    
    // Queue a refund task
    await this.queueService.addToQueue('refund.process', {
      transactionId: savedTx.id,
      excessAmount: amountDecimal - paymentAddress.expectedAmount,
      refundAddress: from
    });
    
    // Send webhook notification for excess payment
    await this.webhookService.sendWebhookNotification(
      paymentAddress.merchantId,
      WebhookEvent.PAYMENT_EXCESS,
      {
        id: savedTx.id,
        txHash,
        amount: amountDecimal,
        expectedAmount: paymentAddress.expectedAmount,
        excessAmount: amountDecimal - paymentAddress.expectedAmount,
        status: transaction.status
      }
    );
  }
}
```

## 2. Refund Processing Service

### 2.1 Create RefundService

Create a new service file `src/services/refundService.ts`:

```typescript
import { ethers } from 'ethers';
import { getConnection } from '../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../db/entities/Transaction';
import { WebhookEvent } from '../db/entities/Webhook';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BlockchainService } from './blockchainService';
import { WalletService } from './walletService';
import { QueueService } from './queueService';
import { WebhookService } from './webhookService';

/**
 * Service for processing refunds
 */
export class RefundService {
  private blockchainService: BlockchainService;
  private walletService: WalletService;
  private queueService: QueueService;
  private webhookService: WebhookService;
  
  constructor(
    blockchainService: BlockchainService,
    walletService: WalletService,
    queueService: QueueService,
    webhookService: WebhookService
  ) {
    this.blockchainService = blockchainService;
    this.walletService = walletService;
    this.queueService = queueService;
    this.webhookService = webhookService;
  }
  
  /**
   * Initialize the refund service
   */
  async initialize(): Promise<void> {
    // Start consuming from the refund queue
    await this.queueService.consumeQueue('refund.process', this.processRefundTask.bind(this));
    logger.info('RefundService initialized and listening for refund tasks');
  }
  
  /**
   * Process a refund task from the queue
   * @param data The refund task data
   */
  private async processRefundTask(data: any): Promise<void> {
    const { transactionId, excessAmount, refundAddress } = data;
    
    try {
      // Get the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress']
      });
      
      if (!transaction || !transaction.paymentAddress) {
        throw new Error(`Transaction ${transactionId} not found or has no payment address`);
      }
      
      // Create a refund transaction
      const refundTx = new Transaction();
      refundTx.type = TransactionType.REFUND;
      refundTx.status = TransactionStatus.PENDING;
      refundTx.amount = excessAmount;
      refundTx.currency = transaction.currency;
      refundTx.fromAddress = transaction.toAddress;
      refundTx.toAddress = refundAddress;
      refundTx.merchantId = transaction.merchantId;
      refundTx.metadata = {
        originalTransactionId: transaction.id,
        reason: 'overpayment'
      };
      
      // Save the refund transaction
      const savedRefundTx = await transactionRepository.save(refundTx);
      
      // Send webhook notification for refund initiated
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        WebhookEvent.REFUND_INITIATED,
        {
          id: savedRefundTx.id,
          originalTransactionId: transaction.id,
          amount: excessAmount,
          currency: transaction.currency,
          refundAddress,
          status: TransactionStatus.PENDING
        }
      );
      
      // Get wallet for the payment address
      const wallet = await this.walletService.getWalletForAddress(transaction.paymentAddress.id);
      
      // Send the refund
      const refundResult = await this.sendRefund(wallet, refundAddress, excessAmount, transaction.currency);
      
      // Update the refund transaction
      refundTx.txHash = refundResult.hash;
      refundTx.status = TransactionStatus.CONFIRMING;
      await transactionRepository.save(refundTx);
      
      // Update the original transaction metadata
      transaction.metadata = {
        ...transaction.metadata,
        refundPending: false,
        refundCompleted: true,
        refundTransactionId: savedRefundTx.id,
        refundTxHash: refundResult.hash
      };
      await transactionRepository.save(transaction);
      
      // Send webhook notification for refund completed
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        WebhookEvent.REFUND_COMPLETED,
        {
          id: savedRefundTx.id,
          originalTransactionId: transaction.id,
          txHash: refundResult.hash,
          amount: excessAmount,
          currency: transaction.currency,
          status: TransactionStatus.CONFIRMING
        }
      );
      
      // Queue confirmation monitoring for the refund
      await this.queueService.addToQueue('transaction.monitor', {
        id: savedRefundTx.id,
        type: 'check_confirmations'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing refund for transaction ${transactionId}: ${errorMessage}`, { error });
      
      // Retry the refund task with exponential backoff
      const retryCount = data.retryCount || 0;
      if (retryCount < 5) {
        const delay = Math.pow(2, retryCount) * 60000; // Exponential backoff
        setTimeout(async () => {
          await this.queueService.addToQueue('refund.process', {
            ...data,
            retryCount: retryCount + 1
          });
        }, delay);
      } else {
        // After max retries, notify merchant for manual handling
        const connection = await getConnection();
        const transactionRepository = connection.getRepository(Transaction);
        const transaction = await transactionRepository.findOne({
          where: { id: transactionId }
        });
        
        if (transaction) {
          await this.webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.REFUND_FAILED,
            {
              id: transaction.id,
              amount: excessAmount,
              currency: transaction.currency,
              refundAddress,
              error: errorMessage
            }
          );
        }
      }
    }
  }
  
  /**
   * Send a refund transaction
   * @param wallet The wallet to send from
   * @param toAddress The address to send to
   * @param amount The amount to send
   * @param currency The currency to send
   * @returns The transaction response
   */
  private async sendRefund(
    wallet: ethers.Wallet,
    toAddress: string,
    amount: number,
    currency: string
  ): Promise<ethers.providers.TransactionResponse> {
    // For USDT on BSC
    const usdtContract = new ethers.Contract(
      config.blockchain.bscMainnet.contracts.usdt,
      [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      wallet
    );
    
    // Get decimals
    const decimals = await usdtContract.decimals();
    
    // Convert amount to token units
    const amountInTokenUnits = ethers.utils.parseUnits(amount.toString(), decimals);
    
    // Send the transaction
    const tx = await usdtContract.transfer(toAddress, amountInTokenUnits, {
      gasLimit: config.blockchain.bscMainnet.gasLimit,
      gasPrice: ethers.utils.parseUnits(config.blockchain.bscMainnet.gasPrice, 'gwei')
    });
    
    return tx;
  }
  
  /**
   * Manually initiate a refund for a transaction
   * @param transactionId The transaction ID
   * @param amount The amount to refund (optional, defaults to full amount)
   * @param refundAddress The address to refund to (optional, defaults to sender)
   * @param reason The reason for the refund
   * @param userId The ID of the user initiating the refund
   * @returns The created refund transaction
   */
  async initiateManualRefund(
    transactionId: string,
    amount?: number,
    refundAddress?: string,
    reason?: string,
    userId?: string
  ): Promise<Transaction> {
    try {
      // Get the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress']
      });
      
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }
      
      // Validate refund amount
      const refundAmount = amount || transaction.amount;
      if (refundAmount > transaction.amount) {
        throw new Error('Refund amount cannot exceed original payment amount');
      }
      
      // Use the original sender address if refundAddress not provided
      const refundTo = refundAddress || transaction.fromAddress;
      if (!refundTo) {
        throw new Error('Refund address not provided and original sender address not available');
      }
      
      // Create a refund transaction
      const refundTx = new Transaction();
      refundTx.type = TransactionType.REFUND;
      refundTx.status = TransactionStatus.PENDING;
      refundTx.amount = refundAmount;
      refundTx.currency = transaction.currency;
      refundTx.fromAddress = transaction.toAddress;
      refundTx.toAddress = refundTo;
      refundTx.merchantId = transaction.merchantId;
      refundTx.metadata = {
        originalTransactionId: transaction.id,
        reason: reason || 'manual_refund',
        initiatedBy: userId || 'system'
      };
      
      // Save the refund transaction
      const savedRefundTx = await transactionRepository.save(refundTx);
      
      // Queue the refund processing
      await this.queueService.addToQueue('refund.process', {
        transactionId: transaction.id,
        refundTransactionId: savedRefundTx.id,
        excessAmount: refundAmount,
        refundAddress: refundTo
      });
      
      return savedRefundTx;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error initiating manual refund for transaction ${transactionId}: ${errorMessage}`, { error });
      throw error;
    }
  }
}
```

### 2.2 Update app.ts to Initialize RefundService

Add the following to `src/app.ts` to initialize the RefundService:

```typescript
// Import the RefundService
import { RefundService } from './services/refundService';

// Initialize RefundService
const refundService = new RefundService(
  blockchainService,
  walletService,
  queueService,
  webhookService
);

// Start the RefundService
refundService.initialize().catch(err => {
  logger.error('Failed to initialize RefundService', { error: err });
});
```

## 3. Handling Payments to Expired Addresses

### 3.1 Update BlockchainService

Modify the `processIncomingTransaction` method in `src/services/blockchainService.ts` to check for expired addresses:

```typescript
// Add to processIncomingTransaction method
if (paymentAddress.status === AddressStatus.EXPIRED) {
  // Mark transaction as late payment
  transaction.metadata = {
    ...transaction.metadata,
    latePayment: true,
    addressExpiredAt: paymentAddress.expiresAt
  };
  
  // Send urgent webhook notification
  await this.webhookService.sendWebhookNotification(
    paymentAddress.merchantId,
    WebhookEvent.PAYMENT_TO_EXPIRED_ADDRESS,
    {
      id: savedTx.id,
      txHash,
      amount: amountDecimal,
      currency: 'USDT',
      status: TransactionStatus.CONFIRMING,
      paymentAddressId: paymentAddress.id,
      addressExpiredAt: paymentAddress.expiresAt,
      timestamp: new Date().toISOString()
    },
    { priority: 'high' } // Add priority flag for urgent notifications
  );
}
```

## 4. Manual Refund API Endpoint

### 4.1 Add Refund Endpoint to Transaction Routes

Add a new endpoint to `src/api/routes/transaction.routes.ts`:

```typescript
/**
 * @route POST /api/v1/transactions/:id/refund
 * @desc Initiate a refund for a transaction
 * @access Private (Merchant)
 */
router.post(
  '/:id/refund',
  merchantAuthMiddleware,
  idempotencyMiddleware,
  [
    body('amount').optional().isFloat({ min: 0.01 }).toFloat(),
    body('refundAddress').optional().isString(),
    body('reason').optional().isString()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }
    
    const { id } = req.params;
    const { amount, refundAddress, reason } = req.body;
    const merchantId = req.merchant?.id;
    
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant ID is required', true));
    }
    
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Find the transaction
      const transaction = await transactionRepository.findOne({
        where: { id, merchantId }
      });
      
      if (!transaction) {
        return next(new ApiError(404, 'Transaction not found', true));
      }
      
      // Check if transaction can be refunded
      if (transaction.type !== TransactionType.PAYMENT) {
        return next(new ApiError(400, 'Only payment transactions can be refunded', true));
      }
      
      if (![TransactionStatus.CONFIRMED, TransactionStatus.SETTLED].includes(transaction.status)) {
        return next(new ApiError(400, 'Only confirmed or settled transactions can be refunded', true));
      }
      
      // Get the RefundService
      const { RefundService } = await import('../../services/refundService');
      const { BlockchainService } = await import('../../services/blockchainService');
      const { WalletService } = await import('../../services/walletService');
      const { QueueService } = await import('../../services/queueService');
      const { WebhookService } = await import('../../services/webhookService');
      
      const blockchainService = new BlockchainService(
        new WebhookService(new QueueService()),
        new QueueService()
      );
      
      const refundService = new RefundService(
        blockchainService,
        new WalletService(),
        new QueueService(),
        new WebhookService(new QueueService())
      );
      
      // Initiate the refund
      const refundTx = await refundService.initiateManualRefund(
        id,
        amount,
        refundAddress,
        reason,
        req.user?.id
      );
      
      // Create audit log
      const auditLogRepository = connection.getRepository(AuditLog);
      await auditLogRepository.save({
        action: AuditLogAction.REFUND_INITIATED,
        entityType: AuditLogEntityType.TRANSACTION,
        entityId: id,
        userId: req.user?.id,
        merchantId,
        metadata: {
          refundTransactionId: refundTx.id,
          amount: refundTx.amount,
          refundAddress: refundTx.toAddress,
          reason
        }
      });
      
      // Return the refund transaction
      return res.status(201).json({
        success: true,
        data: {
          id: refundTx.id,
          originalTransactionId: id,
          amount: refundTx.amount,
          status: refundTx.status,
          refundAddress: refundTx.toAddress
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error initiating refund for transaction ${id}: ${errorMessage}`, { error });
      return next(new ApiError(500, errorMessage, true));
    }
  })
);
```

## 5. Testing Plan

### 5.1 Unit Tests

Create unit tests for the new functionality:

1. Test the `PARTIAL` transaction status handling
2. Test the RefundService's refund processing
3. Test handling of payments to expired addresses
4. Test the manual refund API endpoint

### 5.2 Integration Tests

1. Test the full flow of underpayment detection and handling
2. Test the full flow of overpayment detection and automatic refund
3. Test the full flow of payment to expired address
4. Test the full flow of manual refund initiation

## 6. Deployment Plan

1. Update database schema to include new transaction status
2. Deploy code changes
3. Initialize the RefundService
4. Update webhook documentation for merchants to include new event types
5. Monitor system for any issues with the new workflows

## 7. Documentation Updates

1. Update API documentation to include the new refund endpoint
2. Update webhook documentation to include new event types
3. Update merchant documentation to explain the handling of incorrect payment amounts and payments to expired addresses