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