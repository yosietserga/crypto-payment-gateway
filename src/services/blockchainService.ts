import { ethers } from 'ethers';
import { getConnection, DatabaseCircuitBreaker } from '../db/connection';
import { PaymentAddress, AddressStatus, AddressType } from '../db/entities/PaymentAddress';
import { Transaction, TransactionStatus, TransactionType } from '../db/entities/Transaction';
import { config } from '../config';
import { logger } from '../utils/logger';
import { WebhookService } from './webhookService';
import { WebhookEvent } from '../db/entities/Webhook';
import { QueueService } from './queueService';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';

// ERC20 ABI for token interactions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint amount)'
];

/**
 * Service for interacting with the blockchain
 */
export class BlockchainService {
  /**
   * Get transaction details from the blockchain
   * @param txHash The transaction hash
   */
  async getTransactionDetails(txHash: string): Promise<any> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!tx || !receipt) {
        return null;
      }
      
      return {
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        gasPrice: tx.gasPrice?.toString() || '0',
        gasLimit: tx.gasLimit.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'success' : 'failed',
        confirmations: tx.confirmations
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get transaction details: ${errorMessage}`, { error, txHash });
      return null;
    }
  }
  private provider!: ethers.providers.Provider;
  private wsProvider!: ethers.providers.WebSocketProvider;
  private usdtContract!: ethers.Contract;
  private webhookService: WebhookService;
  private queueService: QueueService;
  private isMonitoring: boolean = false;
  private monitoringAddresses: Set<string> = new Set();
  
  constructor(webhookService: WebhookService, queueService: QueueService) {
    this.webhookService = webhookService;
    this.queueService = queueService;
    
    // Initialize providers
    this.initializeProviders();
  }
  
  /**
   * Initialize blockchain providers and contracts
   */
  private initializeProviders(): void {
    try {
      // HTTP provider for general API calls
      this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      
      // WebSocket provider for real-time events
      this.wsProvider = new ethers.providers.WebSocketProvider(config.blockchain.bscMainnet.wsUrl);
      
      // Initialize USDT contract
      this.usdtContract = new ethers.Contract(
        config.blockchain.bscMainnet.contracts.usdt,
        ERC20_ABI,
        this.provider
      );
      
      // Set up reconnection for WebSocket provider
      this.setupWebSocketReconnection();
      
      logger.info('Blockchain providers initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize blockchain providers: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Set up automatic reconnection for WebSocket provider
   */
  private setupWebSocketReconnection(): void {
    this.wsProvider._websocket.on('close', () => {
      logger.warn('WebSocket connection closed, attempting to reconnect...');
      
      // Clear the current monitoring state
      this.isMonitoring = false;
      
      // Attempt to reconnect after a delay
      setTimeout(() => {
        this.wsProvider = new ethers.providers.WebSocketProvider(config.blockchain.bscMainnet.wsUrl);
        this.setupWebSocketReconnection();
        
        // Restart monitoring if we had active addresses
        if (this.monitoringAddresses.size > 0) {
          this.startMonitoringAddresses(Array.from(this.monitoringAddresses));
        }
      }, 5000); // 5 second delay
    });
  }
  
  /**
   * Get the USDT balance for an address
   * @param address The address to check
   */
  async getUsdtBalance(address: string): Promise<ethers.BigNumber> {
    try {
      const balance = await this.usdtContract.balanceOf(address);
      return balance;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get USDT balance for ${address}: ${errorMessage}`, { error, address });
      throw error;
    }
  }
  
  /**
   * Start monitoring addresses for incoming transactions
   * @param addresses Array of addresses to monitor
   */
  async startMonitoringAddresses(addresses: string[]): Promise<void> {
    if (this.isMonitoring) {
      // Add new addresses to the monitoring set
      addresses.forEach(address => this.monitoringAddresses.add(address));
      return;
    }
    
    try {
      // Add addresses to the monitoring set
      addresses.forEach(address => this.monitoringAddresses.add(address));
      
      // Create a new USDT contract instance with the WebSocket provider
      const usdtContractWs = new ethers.Contract(
        config.blockchain.bscMainnet.contracts.usdt,
        ERC20_ABI,
        this.wsProvider
      );
      
      // Create a filter for Transfer events to any of our monitored addresses
      const filter = usdtContractWs.filters.Transfer(null, null);
      
      // Listen for Transfer events
      usdtContractWs.on(filter, async (from, to, amount, event) => {
        // Check if the recipient is one of our monitored addresses
        if (this.monitoringAddresses.has(to)) {
          logger.info(`Detected incoming USDT transfer to ${to} from ${from}`, {
            from,
            to,
            amount: amount.toString(),
            transactionHash: event.transactionHash
          });
          
          // Process the incoming transaction
          await this.processIncomingTransaction(from, to, amount, event);
        }
      });
      
      this.isMonitoring = true;
      logger.info(`Started monitoring ${addresses.length} addresses for incoming transactions`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to start monitoring addresses: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Process an incoming transaction
   * @param from Sender address
   * @param to Recipient address
   * @param amount Transaction amount
   * @param event The event data
   */
  private async processIncomingTransaction(
    from: string,
    to: string,
    amount: ethers.BigNumber,
    event: ethers.Event
  ): Promise<void> {
    try {
      // Get transaction details
      const txHash = event.transactionHash;
      const txReceipt = await this.provider.getTransactionReceipt(txHash);
      const block = await this.provider.getBlock(txReceipt.blockNumber);
      
      // Convert amount to decimal
      const decimals = await this.usdtContract.decimals();
      const amountDecimal = parseFloat(ethers.utils.formatUnits(amount, decimals));
      
      // Find the payment address in our database
      await DatabaseCircuitBreaker.executeQuery(async () => {
        const connection = await getConnection();
        const paymentAddressRepository = connection.getRepository(PaymentAddress);
        const transactionRepository = connection.getRepository(Transaction);
        const auditLogRepository = connection.getRepository(AuditLog);
        
        // Find the payment address
        const paymentAddress = await paymentAddressRepository.findOne({
          where: { address: to }
        });
        
        if (!paymentAddress) {
          logger.warn(`Received payment to unknown address ${to}`);
          return;
        }
        
        // Check if transaction already exists
        const existingTx = await transactionRepository.findOne({
          where: { txHash }
        });
        
        if (existingTx) {
          logger.info(`Transaction ${txHash} already processed`);
          return;
        }
        
        // Create new transaction record
        const transaction = new Transaction();
        transaction.txHash = txHash;
        transaction.status = TransactionStatus.CONFIRMING;
        transaction.type = TransactionType.PAYMENT;
        transaction.amount = amountDecimal;
        transaction.currency = 'USDT';
        transaction.fromAddress = from;
        transaction.toAddress = to;
        transaction.confirmations = 1; // Initial confirmation
        transaction.blockNumber = txReceipt.blockNumber;
        transaction.blockHash = txReceipt.blockHash;
        transaction.blockTimestamp = new Date(block.timestamp * 1000);
        transaction.paymentAddressId = paymentAddress.id;
        transaction.merchantId = paymentAddress.merchantId;
        
        // Calculate fee if applicable
        if (paymentAddress.merchantId) {
          const merchantRepository = connection.getRepository('Merchant');
          const merchant = await merchantRepository.findOne({
            where: { id: paymentAddress.merchantId }
          });
          
          if (merchant) {
            transaction.feeAmount = merchant.calculateFee(amountDecimal);
          }
        }
        
        // Save the transaction
        const savedTx = await transactionRepository.save(transaction);
        
        // Create audit log
        const auditLog = AuditLog.create({
          action: AuditLogAction.PAYMENT_RECEIVED,
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: savedTx.id,
          description: `Received ${amountDecimal} USDT from ${from}`,
          merchantId: paymentAddress.merchantId,
          newState: {
            amount: amountDecimal,
            txHash,
            blockNumber: txReceipt.blockNumber
          }
        });
        
        await auditLogRepository.save(auditLog);
        
        // Update payment address status if needed
        if (paymentAddress.status === AddressStatus.ACTIVE) {
          paymentAddress.markAsUsed();
          await paymentAddressRepository.save(paymentAddress);
        }
        
        // Send webhook notification
        if (paymentAddress.merchantId) {
          await this.webhookService.sendWebhookNotification(
            paymentAddress.merchantId,
            WebhookEvent.PAYMENT_RECEIVED,
            {
              id: savedTx.id,
              txHash,
              amount: amountDecimal,
              currency: 'USDT',
              status: TransactionStatus.CONFIRMING,
              paymentAddressId: paymentAddress.id,
              confirmations: 1,
              requiredConfirmations: config.blockchain.bscMainnet.confirmations,
              timestamp: new Date().toISOString()
            }
          );
        }
        
        // Queue confirmation monitoring
        await this.queueService.addToQueue('transaction.monitor', {
          transactionId: savedTx.id,
          txHash,
          blockNumber: txReceipt.blockNumber,
          confirmations: 1,
          requiredConfirmations: config.blockchain.bscMainnet.confirmations
        });
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Error processing incoming transaction ${event.transactionHash}: ${err.message}`, {
        error,
        txHash: event.transactionHash,
        from,
        to,
        amount: amount.toString()
      });
    }
  }
  
  /**
   * Monitor a transaction for confirmations
   * @param transactionId The transaction ID
   * @param txHash The transaction hash
   * @param currentConfirmations Current confirmation count
   * @param requiredConfirmations Required confirmation count
   */
  async monitorTransactionConfirmations(
    transactionId: string,
    txHash: string,
    currentConfirmations: number,
    requiredConfirmations: number
  ): Promise<void> {
    try {
      // Get the current block number
      const currentBlock = await this.provider.getBlockNumber();
      
      // Get transaction receipt
      const txReceipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!txReceipt) {
        logger.warn(`Transaction receipt not found for ${txHash}`);
        return;
      }
      
      // Calculate confirmations
      const confirmations = currentBlock - txReceipt.blockNumber + 1;
      
      // Update transaction if confirmations have increased
      if (confirmations > currentConfirmations) {
        await DatabaseCircuitBreaker.executeQuery(async () => {
          const connection = await getConnection();
          const transactionRepository = connection.getRepository(Transaction);
          const auditLogRepository = connection.getRepository(AuditLog);
          
          // Get the transaction
          const transaction = await transactionRepository.findOne({
            where: { id: transactionId }
          });
          
          if (!transaction) {
            logger.warn(`Transaction ${transactionId} not found`);
            return;
          }
          
          // Update confirmations
          transaction.confirmations = confirmations;
          
          // Check if fully confirmed
          if (confirmations >= requiredConfirmations && transaction.status === TransactionStatus.CONFIRMING) {
            transaction.status = TransactionStatus.CONFIRMED;
            
            // Create audit log
            const auditLog = AuditLog.create({
              action: AuditLogAction.PAYMENT_CONFIRMED,
              entityType: AuditLogEntityType.TRANSACTION,
              entityId: transaction.id,
              description: `Transaction confirmed with ${confirmations} confirmations`,
              merchantId: transaction.merchantId,
              previousState: { status: TransactionStatus.CONFIRMING },
              newState: { status: TransactionStatus.CONFIRMED, confirmations }
            });
            
            await auditLogRepository.save(auditLog);
            
            // Send webhook notification
            if (transaction.merchantId) {
              await this.webhookService.sendWebhookNotification(
                transaction.merchantId,
                WebhookEvent.PAYMENT_CONFIRMED,
                {
                  id: transaction.id,
                  txHash: transaction.txHash,
                  amount: transaction.amount,
                  currency: transaction.currency,
                  status: TransactionStatus.CONFIRMED,
                  confirmations,
                  timestamp: new Date().toISOString()
                }
              );
            }
          }
          
          // Save the updated transaction
          await transactionRepository.save(transaction);
          
          // Continue monitoring if not fully confirmed
          if (confirmations < requiredConfirmations) {
            // Queue next check with exponential backoff
            const delay = Math.min(30, Math.pow(2, confirmations)) * 1000; // Max 30 seconds
            
            setTimeout(async () => {
              await this.queueService.addToQueue('transaction.monitor', {
                transactionId,
                txHash,
                blockNumber: txReceipt.blockNumber,
                confirmations,
                requiredConfirmations
              });
            }, delay);
          }
        });
      } else {
        // No new confirmations, check again later
        setTimeout(async () => {
          await this.queueService.addToQueue('transaction.monitor', {
            transactionId,
            txHash,
            blockNumber: txReceipt.blockNumber,
            confirmations: currentConfirmations,
            requiredConfirmations
          });
        }, 15000); // Check again in 15 seconds
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error monitoring transaction confirmations for ${txHash}: ${err.message}`, {
        error,
        txHash,
        transactionId
      });
      
      // Retry after a delay
      setTimeout(async () => {
        await this.queueService.addToQueue('transaction.monitor', {
          transactionId,
          txHash,
          currentConfirmations,
          requiredConfirmations
        });
      }, 30000); // Retry in 30 seconds
    }
  }
  
  /**
   * Generate a new payment address for a merchant
   * @param merchantId The merchant ID
   * @param expectedAmount Expected payment amount
   * @param metadata Additional metadata
   */
  async generatePaymentAddress(
    merchantId: string,
    expectedAmount?: number,
    metadata?: any
  ): Promise<PaymentAddress> {
    try {
      // Generate a new HD wallet address
      const wallet = ethers.Wallet.createRandom();
      
      // Create a new payment address record
      const paymentAddress = new PaymentAddress();
      paymentAddress.address = wallet.address;
      paymentAddress.privateKey = this.encryptPrivateKey(wallet.privateKey); // Encrypt private key
      paymentAddress.hdPath = wallet.mnemonic.path;
      paymentAddress.status = AddressStatus.ACTIVE;
      paymentAddress.type = AddressType.MERCHANT_PAYMENT;
      paymentAddress.expectedAmount = expectedAmount || 0; // Provide default value to satisfy TypeScript
      paymentAddress.currency = 'USDT';
      paymentAddress.merchantId = merchantId;
      paymentAddress.metadata = metadata || {};
      
      // Set expiration time
      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + config.wallet.addressExpirationTime);
      paymentAddress.expiresAt = expiresAt;
      
      // Save the payment address
      await DatabaseCircuitBreaker.executeQuery(async () => {
        const connection = await getConnection();
        const paymentAddressRepository = connection.getRepository(PaymentAddress);
        const auditLogRepository = connection.getRepository(AuditLog);
        
        const savedAddress = await paymentAddressRepository.save(paymentAddress);
        
        // Create audit log
        const auditLog = AuditLog.create({
          action: AuditLogAction.ADDRESS_GENERATED,
          entityType: AuditLogEntityType.PAYMENT_ADDRESS,
          entityId: savedAddress.id,
          description: `Generated payment address ${savedAddress.address}`,
          merchantId
        });
        
        await auditLogRepository.save(auditLog);
        
        // Start monitoring the address
        await this.startMonitoringAddresses([savedAddress.address]);
        
        // Send webhook notification
        await this.webhookService.sendWebhookNotification(
          merchantId,
          WebhookEvent.ADDRESS_CREATED,
          {
            id: savedAddress.id,
            address: savedAddress.address,
            expectedAmount,
            currency: 'USDT',
            expiresAt: savedAddress.expiresAt.toISOString()
          }
        );
      });
      
      return paymentAddress;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to generate payment address: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Encrypt a private key for storage
   * @param privateKey The private key to encrypt
   */
  private encryptPrivateKey(privateKey: string): string {
    // In a real implementation, this would use a proper encryption method
    // such as AES-256 with a secure key management system or HSM
    // For this example, we'll just add a placeholder
    return `encrypted:${privateKey}`;
  }
  
  /**
   * Decrypt a stored private key
   * @param encryptedKey The encrypted private key
   */
  private decryptPrivateKey(encryptedKey: string): string {
    // In a real implementation, this would use a proper decryption method
    // For this example, we'll just remove the placeholder
    return encryptedKey.replace('encrypted:', '');
  }
  
  /**
   * Execute a blockchain call with retry logic
   * @param fn The function to execute
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let lastError: Error = new Error('Unknown error occurred');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Blockchain call failed (attempt ${attempt}/${maxRetries}): ${(error as Error).message}`);
        
        if (attempt < maxRetries) {
          // Wait with exponential backoff before retrying
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}