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
import { LessThan } from 'typeorm';

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
  
  // Flag to track if direct processing is set up
  private _directProcessingSetup: boolean = false;
  private _directProcessingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the transaction monitor service
   */
  async initialize(): Promise<void> {
    try {
      // Start consuming from the transaction monitor queue with prefetch option
      try {
        await this.queueService.consumeQueue('transaction.monitor', this.processTransactionMonitorTask.bind(this), {
          prefetch: 10 // Process up to 10 messages at a time
        });
      } catch (queueError) {
        const errorMessage = queueError instanceof Error ? queueError.message : 'Unknown error';
        logger.warn(`Failed to start consuming from transaction monitor queue: ${errorMessage}. Will use direct processing.`);
        // Don't throw - continue with direct processing
      }
      
      // Start monitoring active addresses
      try {
        await this.startMonitoringActiveAddresses();
      } catch (monitorError) {
        const errorMessage = monitorError instanceof Error ? monitorError.message : 'Unknown error';
        logger.warn(`Failed to start monitoring active addresses: ${errorMessage}. Address monitoring will be limited.`);
        // Don't throw - continue with limited functionality
      }
      
      // If queue service is in fallback mode, set up periodic transaction confirmation checks
      if (this.queueService.isInFallbackMode()) {
        logger.info('Queue service is in fallback mode, setting up direct transaction processing');
        this.setupDirectTransactionProcessing();
      }
      
      // Set up a listener for queue service fallback mode changes
      this.setupQueueServiceListener();
      
      logger.info('Transaction monitor service initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize transaction monitor service: ${errorMessage}`, { error });
      logger.warn('Transaction monitor service will continue with limited functionality');
      
      // If error is related to queue service, set up direct processing
      try {
        this.setupDirectTransactionProcessing();
      } catch (directProcessingError) {
        logger.error(`Failed to set up direct transaction processing: ${directProcessingError instanceof Error ? directProcessingError.message : 'Unknown error'}`);
        // Continue with severely limited functionality, but don't crash the application
      }
      // Continue execution instead of throwing error
    }
  }
  
  /**
   * Set up a listener to detect changes in queue service mode
   */
  private setupQueueServiceListener(): void {
    // Check queue service status periodically
    setInterval(() => {
      const isInFallbackMode = this.queueService.isInFallbackMode();
      
      // If queue service has entered fallback mode, set up direct processing
      if (isInFallbackMode && !this._directProcessingSetup) {
        logger.info('Queue service entered fallback mode, setting up direct transaction processing');
        this.setupDirectTransactionProcessing();
      }
      
      // If queue service has exited fallback mode, retry failed messages
      if (!isInFallbackMode && this._directProcessingSetup) {
        logger.info('Queue service exited fallback mode, retrying failed messages');
        this.queueService.retryFailedMessages('transaction.monitor');
        this.stopDirectTransactionProcessing();
      }
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Set up direct transaction processing when queue service is unavailable
   */
  private setupDirectTransactionProcessing(): void {
    if (this._directProcessingSetup) {
      return; // Already set up
    }
    
    logger.info('Setting up direct transaction processing');
    this._directProcessingSetup = true;
    
    // Clear any existing interval
    if (this._directProcessingInterval) {
      clearInterval(this._directProcessingInterval);
    }
    
    // Set up periodic transaction confirmation checks
    this._directProcessingInterval = setInterval(async () => {
      try {
        await this.processDirectTransactions();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error in direct transaction processing: ${errorMessage}`, { error });
      }
    }, 60000); // Check every minute
    
    // Run immediately
    this.processDirectTransactions().catch(error => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error in initial direct transaction processing: ${errorMessage}`, { error });
    });
  }
  
  /**
   * Stop direct transaction processing
   */
  private stopDirectTransactionProcessing(): void {
    if (!this._directProcessingSetup) {
      return; // Not set up
    }
    
    logger.info('Stopping direct transaction processing');
    this._directProcessingSetup = false;
    
    // Clear interval
    if (this._directProcessingInterval) {
      clearInterval(this._directProcessingInterval);
      this._directProcessingInterval = null;
    }
  }
  
  /**
   * Process transactions directly without using the queue
   */
  private async processDirectTransactions(): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Find transactions that need confirmation checks
      const pendingTransactions = await transactionRepository.find({
        where: [
          { status: TransactionStatus.PENDING },
          { status: TransactionStatus.CONFIRMING }
        ],
        relations: ['paymentAddress'],
        take: 50 // Process in batches to avoid memory issues
      });
      
      logger.info(`Processing ${pendingTransactions.length} pending transactions directly`);
      
      // Process each transaction
      for (const transaction of pendingTransactions) {
        await this.checkTransactionConfirmations(transaction.id);
      }
      
      // Check for expired addresses
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const activeAddresses = await paymentAddressRepository.find({
        where: {
          status: AddressStatus.ACTIVE,
          expiresAt: LessThan(new Date(Date.now() + 3600000)) // Expiring in the next hour
        },
        take: 50
      });
      
      logger.info(`Checking ${activeAddresses.length} addresses for expiration directly`);
      
      // Process each address
      for (const address of activeAddresses) {
        await this.checkAddressExpiration(address.id);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing direct transactions: ${errorMessage}`, { error });
      throw error;
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
          transaction.status !== TransactionStatus.CONFIRMING) {
        logger.debug(`Transaction ${transactionId} status is ${transaction.status}, skipping confirmation check`);
        return;
      }
      
      // Get current confirmations from blockchain
      const provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      
      // Check if txHash exists before attempting to get transaction receipt
      if (!transaction.txHash) {
        logger.warn(`Transaction ${transactionId} has no txHash, skipping confirmation check`);
        // Schedule another check in case txHash gets added later
        await this.scheduleConfirmationCheck(transactionId, 300); // Check again in 5 minutes
        return;
      }
      
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
        // Check if transaction is not already confirmed using a type assertion to avoid TypeScript errors
        if ((transaction.status as string) !== TransactionStatus.CONFIRMED) {
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
      } else if ((transaction.status as string) === TransactionStatus.PENDING) {
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
      if ((transaction.status as string) !== TransactionStatus.CONFIRMED) {
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
   * Process address expirations directly (for fallback mode)
   */
  private async processAddressExpirations(): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find addresses that are about to expire
      const expiringAddresses = await paymentAddressRepository.find({
        where: {
          status: AddressStatus.ACTIVE,
          expiresAt: LessThan(new Date(Date.now() + 3600000)) // Expiring in the next hour
        },
        take: 50
      });
      
      if (expiringAddresses.length === 0) {
        return;
      }
      
      logger.info(`Processing ${expiringAddresses.length} expiring addresses in fallback mode`);
      
      // Process each address
      for (const address of expiringAddresses) {
        await this.checkAddressExpiration(address.id);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing address expirations: ${errorMessage}`, { error });
    }
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
  
  // The processAddressExpirations method is already implemented above
  
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