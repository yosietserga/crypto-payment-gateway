import { ethers } from 'ethers';
import { getConnection, DatabaseCircuitBreaker } from '../db/connection';
import { Transaction, TransactionStatus } from '../db/entities/Transaction';
import { PaymentAddress, AddressStatus } from '../db/entities/PaymentAddress';
import { BlockchainService } from './blockchainService';
import { WebhookService } from './webhookService';
import { QueueService } from './queueService';
import { WebhookEvent } from '../db/entities/Webhook';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';

/**
 * Service for monitoring and processing blockchain transactions
 */
export class TransactionMonitorService {
  private blockchainService: BlockchainService;
  private webhookService: WebhookService;
  private queueService: QueueService;
  
  constructor(
    blockchainService: BlockchainService,
    webhookService: WebhookService,
    queueService: QueueService
  ) {
    this.blockchainService = blockchainService;
    this.webhookService = webhookService;
    this.queueService = queueService;
  }
  
  /**
   * Initialize the transaction monitor service
   */
  async initialize(): Promise<void> {
    try {
      // Start consuming from the transaction monitor queue
      await this.queueService.consumeQueue('transaction.monitor', this.processTransactionMonitorTask.bind(this));
      
      // Start monitoring active addresses
      await this.startMonitoringActiveAddresses();
      
      // If queue service is in fallback mode, set up periodic transaction confirmation checks
      if (this.queueService.isInFallbackMode()) {
        logger.info('Queue service is in fallback mode, setting up direct transaction processing');
        this.setupDirectTransactionProcessing();
      }
      
      logger.info('Transaction monitor service initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize transaction monitor service: ${errorMessage}`, { error });
      logger.warn('Transaction monitor service will continue with limited functionality');
      // Continue execution instead of throwing error
    }
  }
  
  /**
   * Start monitoring all active payment addresses
   */
  private async startMonitoringActiveAddresses(): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find all active addresses that should be monitored
      const activeAddresses = await paymentAddressRepository.find({
        where: {
          status: AddressStatus.ACTIVE,
          isMonitored: true
        }
      });
      
      if (activeAddresses.length === 0) {
        logger.info('No active addresses to monitor');
        return;
      }
      
      // Extract address strings
      const addressStrings = activeAddresses.map(addr => addr.address);
      
      // Start monitoring these addresses
      await this.blockchainService.startMonitoringAddresses(addressStrings);
      
      logger.info(`Started monitoring ${addressStrings.length} active addresses`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error starting to monitor active addresses: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Process a transaction monitoring task from the queue
   * @param data The task data
   */
  private async processTransactionMonitorTask(data: any): Promise<void> {
    try {
      const { type, id } = data;
      
      if (!type || !id) {
        logger.error('Invalid transaction monitor task: missing type or id', { data });
        return;
      }
      
      logger.info(`Processing transaction monitor task: ${type} for ${id}`);
      
      // Process based on task type
      if (type === 'check_confirmations') {
        await this.checkTransactionConfirmations(id);
      } else if (type === 'check_address_expiration') {
        await this.checkAddressExpiration(id);
      } else {
        logger.warn(`Unknown transaction monitor task type: ${type}`, { data });
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing transaction monitor task: ${errorMessage}`, { error, data });
    }
  }
  
  /**
   * Check transaction confirmations and update status
   * @param transactionId The transaction ID
   */
  private async checkTransactionConfirmations(transactionId: string): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Get the transaction
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress']
      });
      
      if (!transaction) {
        logger.warn(`Transaction not found: ${transactionId}`);
        return;
      }
      
      // Skip if transaction is not in a state that needs confirmation checking
      if (transaction.status !== TransactionStatus.PENDING && 
          transaction.status !== TransactionStatus.CONFIRMING &&
          transaction.status !== TransactionStatus.CONFIRMED) {
        return;
      }
      
      // Get current confirmations from blockchain
      const provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      const txReceipt = await provider.getTransactionReceipt(transaction.txHash);
      
      if (!txReceipt) {
        // Transaction not found on blockchain yet, schedule another check
        await this.scheduleConfirmationCheck(transactionId, 60); // Check again in 60 seconds
        return;
      }
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      
      // Calculate confirmations
      const confirmations = currentBlock - txReceipt.blockNumber + 1;
      
      // Store previous state for audit log
      const previousState = {
        status: transaction.status,
        confirmations: transaction.confirmations
      };
      
      // Update transaction confirmations
      transaction.confirmations = confirmations;
      
      // Update status based on confirmations
      if (confirmations >= config.blockchain.bscMainnet.confirmations) {
        if (transaction.status !== TransactionStatus.CONFIRMED) {
          transaction.status = TransactionStatus.CONFIRMED;
          
          // Send webhook notification for confirmed transaction
          await this.webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.PAYMENT_CONFIRMED,
            {
              id: transaction.id,
              txHash: transaction.txHash,
              amount: transaction.amount,
              currency: transaction.currency,
              confirmations: transaction.confirmations,
              status: transaction.status,
              paymentAddress: transaction.paymentAddress?.address,
              metadata: transaction.metadata
            }
          );
        }
      } else if (transaction.status === TransactionStatus.PENDING) {
        transaction.status = TransactionStatus.CONFIRMING;
      }
      
      // Save the updated transaction
      await transactionRepository.save(transaction);
      
      // Create audit log if status changed
      if (previousState.status !== transaction.status) {
        const auditLog = AuditLog.create({
          action: AuditLogAction.TRANSACTION_STATUS_UPDATED,
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: transaction.id,
          description: `Transaction status updated from ${previousState.status} to ${transaction.status}`,
          merchantId: transaction.merchantId,
          previousState,
          newState: {
            status: transaction.status,
            confirmations: transaction.confirmations
          }
        });
        
        await auditLogRepository.save(auditLog);
      }
      
      // Schedule another check if not yet confirmed
      if (transaction.status !== TransactionStatus.CONFIRMED) {
        // Exponential backoff for confirmation checks
        const nextCheckDelay = Math.min(60 * Math.pow(2, Math.floor(confirmations / 2)), 3600); // Max 1 hour
        await this.scheduleConfirmationCheck(transactionId, nextCheckDelay);
      }
      
      logger.info(`Updated transaction ${transactionId} confirmations: ${confirmations}`, {
        transactionId,
        confirmations,
        status: transaction.status
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error checking transaction confirmations: ${errorMessage}`, { error, transactionId });
      // Schedule a retry
      await this.scheduleConfirmationCheck(transactionId, 300); // Retry in 5 minutes on error
    }
  }
  
  /**
   * Schedule a confirmation check for a transaction
   * @param transactionId The transaction ID
   * @param delaySeconds Delay in seconds before the check
   */
  private async scheduleConfirmationCheck(transactionId: string, delaySeconds: number): Promise<void> {
    try {
      // Add to queue with delay
      setTimeout(async () => {
        // If queue service is in fallback mode, process directly
        if (this.queueService.isInFallbackMode()) {
          await this.checkTransactionConfirmations(transactionId);
        } else {
          await this.queueService.addToQueue('transaction.monitor', {
            id: transactionId,
            type: 'check_confirmations'
          });
        }
      }, delaySeconds * 1000);
      
      logger.debug(`Scheduled confirmation check for transaction ${transactionId} in ${delaySeconds} seconds`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error scheduling confirmation check: ${errorMessage}`, { error, transactionId });
    }
  }
  
  /**
   * Check if a payment address has expired
   * @param addressId The payment address ID
   */
  private async checkAddressExpiration(addressId: string): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Get the payment address
      const address = await paymentAddressRepository.findOne({
        where: { id: addressId }
      });
      
      if (!address) {
        logger.warn(`Payment address not found: ${addressId}`);
        return;
      }
      
      // Skip if address is not active
      if (address.status !== AddressStatus.ACTIVE) {
        return;
      }
      
      // Check if address has expired
      if (address.isExpired()) {
        // Store previous state for audit log
        const previousState = {
          status: address.status
        };
        
        // Mark address as expired
        address.markAsExpired();
        
        // Save the updated address
        await paymentAddressRepository.save(address);
        
        // Create audit log
        const auditLog = AuditLog.create({
          action: AuditLogAction.ADDRESS_EXPIRED,
          entityType: AuditLogEntityType.PAYMENT_ADDRESS,
          entityId: address.id,
          description: `Payment address ${address.address} expired`,
          merchantId: address.merchantId,
          previousState,
          newState: {
            status: address.status
          }
        });
        
        await auditLogRepository.save(auditLog);
        
        // Send webhook notification
        await this.webhookService.sendWebhookNotification(
          address.merchantId,
          WebhookEvent.ADDRESS_EXPIRED,
          {
            id: address.id,
            address: address.address,
            status: address.status,
            expiresAt: address.expiresAt,
            metadata: address.metadata
          }
        );
        
        logger.info(`Payment address ${addressId} marked as expired`, { addressId });
      } else {
        // Schedule another check at expiration time
        if (address.expiresAt) {
          const now = new Date();
          const expiresAt = new Date(address.expiresAt);
          const delayMs = Math.max(0, expiresAt.getTime() - now.getTime());
          
          if (delayMs > 0) {
            setTimeout(async () => {
              await this.queueService.addToQueue('transaction.monitor', {
                addressId,
                type: 'check_address_expiration'
              });
            }, delayMs);
            
            logger.debug(`Scheduled expiration check for address ${addressId} at ${expiresAt.toISOString()}`);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error checking address expiration: ${errorMessage}`, { error, addressId });
    }
  }
  
  /**
   * Set up direct transaction processing for fallback mode
   * This method sets up periodic checks for pending transactions and address expirations
   * when the queue service is in fallback mode
   */
  private setupDirectTransactionProcessing(): void {
    // Set up periodic transaction confirmation checks
    setInterval(async () => {
      try {
        await this.processPendingTransactions();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error in direct transaction processing: ${errorMessage}`, { error });
      }
    }, 60000); // Check every minute
    
    // Set up periodic address expiration checks
    setInterval(async () => {
      try {
        await this.processAddressExpirations();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error in direct address expiration processing: ${errorMessage}`, { error });
      }
    }, 300000); // Check every 5 minutes
    
    logger.info('Direct transaction processing set up successfully for fallback mode');
  }
  
  /**
   * Process all pending transactions directly (for fallback mode)
   */
  private async processPendingTransactions(): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Find all transactions that need confirmation checks
      const pendingTransactions = await transactionRepository.find({
        where: [
          { status: TransactionStatus.PENDING },
          { status: TransactionStatus.CONFIRMING }
        ]
      });
      
      if (pendingTransactions.length === 0) {
        return;
      }
      
      logger.info(`Processing ${pendingTransactions.length} pending transactions in fallback mode`);
      
      // Process each transaction
      for (const transaction of pendingTransactions) {
        await this.checkTransactionConfirmations(transaction.id);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing pending transactions: ${errorMessage}`, { error });
    }
  }
  
  /**
   * Process all active addresses for expiration (for fallback mode)
   */
  private async processAddressExpirations(): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find all active addresses
      const activeAddresses = await paymentAddressRepository.find({
        where: {
          status: AddressStatus.ACTIVE
        }
      });
      
      if (activeAddresses.length === 0) {
        return;
      }
      
      logger.info(`Checking ${activeAddresses.length} active addresses for expiration in fallback mode`);
      
      // Check each address for expiration
      for (const address of activeAddresses) {
        await this.checkAddressExpiration(address.id);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing address expirations: ${errorMessage}`, { error });
    }
  }
  
  /**
   * Retry sending a webhook for a transaction
   * @param transactionId The transaction ID
   * @param webhookEvent The webhook event to send
   */
  private async retryWebhook(transactionId: string, webhookEvent: WebhookEvent): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get the transaction
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress']
      });
      
      if (!transaction) {
        logger.warn(`Transaction not found for webhook retry: ${transactionId}`);
        return;
      }
      
      // Send webhook notification
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        webhookEvent,
        {
          id: transaction.id,
          txHash: transaction.txHash,
          amount: transaction.amount,
          currency: transaction.currency,
          confirmations: transaction.confirmations,
          status: transaction.status,
          paymentAddress: transaction.paymentAddress?.address,
          metadata: transaction.metadata
        }
      );
      
      logger.info(`Retried webhook ${webhookEvent} for transaction ${transactionId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error retrying webhook: ${errorMessage}`, { error, transactionId, webhookEvent });
    }
  }
}