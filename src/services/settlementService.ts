import { ethers } from 'ethers';
import { getConnection, DatabaseCircuitBreaker } from '../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../db/entities/Transaction';
import { PaymentAddress, AddressStatus, AddressType } from '../db/entities/PaymentAddress';
import { IsNull, In } from 'typeorm';
import { WalletService } from './walletService';
import { BlockchainService } from './blockchainService';
import { QueueService } from './queueService';
import { WebhookService } from './webhookService';
import { WebhookEvent } from '../db/entities/Webhook';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';

/**
 * Service for handling settlement of funds from merchant payment addresses to hot wallets and cold storage
 */
export class SettlementService {
  private walletService: WalletService;
  private blockchainService: BlockchainService;
  private queueService: QueueService;
  private webhookService: WebhookService;
  
  constructor(
    walletService: WalletService,
    blockchainService: BlockchainService,
    queueService: QueueService,
    webhookService: WebhookService
  ) {
    this.walletService = walletService;
    this.blockchainService = blockchainService;
    this.queueService = queueService;
    this.webhookService = webhookService;
  }
  
  /**
   * Initialize the settlement service
   */
  async initialize(): Promise<void> {
    try {
      // Start consuming from the settlement queue
      await this.queueService.consumeQueue('settlement.process', this.processSettlementTask.bind(this));
      
      logger.info('Settlement service initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize settlement service: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Schedule settlement of confirmed transactions to hot wallet
   */
  async scheduleSettlements(): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Find confirmed transactions that haven't been settled yet
      const pendingSettlements = await transactionRepository.find({
        where: {
          status: TransactionStatus.CONFIRMED,
          type: TransactionType.PAYMENT,
          settlementTxHash: IsNull()
        },
        relations: ['paymentAddress']
      });
      
      if (pendingSettlements.length === 0) {
        logger.info('No pending settlements found');
        return;
      }
      
      logger.info(`Found ${pendingSettlements.length} transactions pending settlement`);
      
      // Group transactions by merchant for batch processing
      const merchantTransactions = this.groupTransactionsByMerchant(pendingSettlements);
      
      // Schedule settlement for each merchant
      for (const [merchantId, transactions] of Object.entries(merchantTransactions)) {
        await this.queueService.addToQueue('settlement.process', {
          merchantId,
          transactionIds: transactions.map(tx => tx.id)
        });
        
        logger.info(`Scheduled settlement for merchant ${merchantId} with ${transactions.length} transactions`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error scheduling settlements: ${errorMessage}`, { error });
    }
  }
  
  /**
   * Group transactions by merchant ID
   * @param transactions The transactions to group
   */
  private groupTransactionsByMerchant(transactions: Transaction[]): Record<string, Transaction[]> {
    const result: Record<string, Transaction[]> = {};
    
    for (const transaction of transactions) {
      if (!transaction.merchantId) continue;
      
      if (!result[transaction.merchantId]) {
        result[transaction.merchantId] = [];
      }
      
      result[transaction.merchantId].push(transaction);
    }
    
    return result;
  }
  
  /**
   * Process a settlement task from the queue
   * @param data The settlement task data
   */
  private async processSettlementTask(data: any): Promise<void> {
    try {
      const { merchantId } = data;
      
      if (!merchantId) {
        logger.error('Invalid settlement task: missing merchantId', { data });
        return;
      }
      
      logger.info(`Processing settlement for merchant ${merchantId}`);
      
      // Process the settlement
      await this.processMerchantSettlement(merchantId);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing settlement: ${errorMessage}`, { error, merchantId: data?.merchantId });
    }
  }
  
  /**
   * Process settlements for a specific merchant
   * @param merchantId The merchant ID to process settlements for
   */
  private async processMerchantSettlement(merchantId: string): Promise<void> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find confirmed transactions for this merchant that haven't been settled yet
      const pendingTransactions = await transactionRepository.find({
        where: {
          merchantId,
          status: TransactionStatus.CONFIRMED,
          type: TransactionType.PAYMENT,
          settlementTxHash: IsNull()
        },
        relations: ['paymentAddress']
      });
      
      if (pendingTransactions.length === 0) {
        logger.info(`No pending settlements found for merchant ${merchantId}`);
        return;
      }
      
      logger.info(`Found ${pendingTransactions.length} transactions pending settlement for merchant ${merchantId}`);
      
      // Get or create a hot wallet for this merchant
      const hotWallets = await paymentAddressRepository.find({
        where: {
          merchantId,
          type: AddressType.HOT_WALLET,
          status: AddressStatus.ACTIVE
        }
      });
      
      let hotWallet: PaymentAddress;
      
      if (hotWallets.length === 0) {
        // Create a new hot wallet for this merchant
        hotWallet = await this.walletService.createHotWallet(merchantId);
        logger.info(`Created new hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
      } else {
        // Use the first active hot wallet
        hotWallet = hotWallets[0];
        logger.info(`Using existing hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
      }
      
      // Process each transaction
      for (const transaction of pendingTransactions) {
        try {
          await this.settleTransaction(transaction, hotWallet);
          
          // Send webhook notification for settlement
          await this.webhookService.sendWebhookNotification(
            merchantId,
            WebhookEvent.TRANSACTION_SETTLED,
            {
              id: transaction.id,
              txHash: transaction.txHash,
              settlementTxHash: transaction.settlementTxHash,
              amount: transaction.amount,
              currency: transaction.currency
            }
          );
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error settling transaction ${transaction.id}: ${errorMessage}`, {
            error,
            transactionId: transaction.id
          });
          // Continue with next transaction
          continue;
        }
      }
      
      logger.info(`Completed settlement processing for merchant ${merchantId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing merchant settlement: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Settle a single transaction by transferring funds to the hot wallet
   * @param transaction The transaction to settle
   * @param hotWallet The hot wallet to transfer funds to
   */
  private async settleTransaction(transaction: Transaction, hotWallet: PaymentAddress): Promise<void> {
    try {
      if (!transaction.paymentAddress) {
        throw new Error(`Transaction ${transaction.id} has no associated payment address`);
      }
      
      // Get wallet for the payment address
      const wallet = await this.walletService.getWalletForAddress(transaction.paymentAddress.id);
      
      // Get USDT contract
      const usdtContract = new ethers.Contract(
        config.blockchain.bscMainnet.contracts.usdt,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ],
        wallet
      );
      
      // Get USDT decimals
      const decimals = await usdtContract.decimals();
      
      // Get current balance
      const balance = await usdtContract.balanceOf(transaction.paymentAddress.address);
      
      if (balance.isZero()) {
        logger.warn(`Payment address ${transaction.paymentAddress.address} has zero balance, skipping settlement`);
        return;
      }
      
      // Calculate gas price with a slight increase for faster confirmation
      const gasPrice = ethers.utils.parseUnits(
        config.blockchain.bscMainnet.gasPrice,
        'gwei'
      ).mul(120).div(100); // 20% higher than base gas price
      
      // Transfer USDT to hot wallet
      const tx = await usdtContract.transfer(hotWallet.address, balance, {
        gasLimit: config.blockchain.bscMainnet.gasLimit,
        gasPrice
      });
      
      logger.info(`Settlement transaction submitted: ${tx.hash}`, {
        transactionId: transaction.id,
        settlementTxHash: tx.hash,
        amount: ethers.utils.formatUnits(balance, decimals),
        from: transaction.paymentAddress.address,
        to: hotWallet.address
      });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait(config.blockchain.bscMainnet.confirmations);
      
      if (receipt.status === 1) {
        // Update transaction status
        const connection = await getConnection();
        const transactionRepository = connection.getRepository(Transaction);
        
        transaction.status = TransactionStatus.SETTLED;
        transaction.settlementTxHash = tx.hash;
        await transactionRepository.save(transaction);
        
        // Mark payment address as used
        const paymentAddressRepository = connection.getRepository(PaymentAddress);
        transaction.paymentAddress.markAsUsed();
        await paymentAddressRepository.save(transaction.paymentAddress);
        
        logger.info(`Settlement completed for transaction ${transaction.id}`, {
          transactionId: transaction.id,
          settlementTxHash: tx.hash
        });
      } else {
        logger.error(`Settlement transaction failed for transaction ${transaction.id}`, {
          transactionId: transaction.id,
          settlementTxHash: tx.hash
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error settling transaction ${transaction.id}: ${errorMessage}`, {
        error,
        transactionId: transaction.id
      });
      throw error;
    }
  }
  
  /**
   * Transfer funds from hot wallet to cold storage
   */
  async transferToColdStorage(): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find active hot wallet addresses
      const hotWallets = await paymentAddressRepository.find({
        where: {
          type: AddressType.HOT_WALLET,
          status: AddressStatus.ACTIVE
        }
      });
      
      if (hotWallets.length === 0) {
        logger.info('No active hot wallet addresses found');
        return;
      }
      
      // Get cold wallet address from config
      const coldWalletAddress = config.wallet.coldWalletAddress;
      
      if (!coldWalletAddress) {
        logger.error('Cold wallet address not configured');
        return;
      }
      
      // Process each hot wallet
      for (const hotWallet of hotWallets) {
        await this.processHotWalletTransfer(hotWallet, coldWalletAddress);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error transferring to cold storage: ${errorMessage}`, { error });
    }
  }
  
  /**
   * Process transfer from a hot wallet to cold storage
   * @param hotWallet The hot wallet to transfer from
   * @param coldWalletAddress The cold wallet address to transfer to
   */
  private async processHotWalletTransfer(hotWallet: PaymentAddress, coldWalletAddress: string): Promise<void> {
    try {
      // Get wallet for the hot wallet address
      const wallet = await this.walletService.getWalletForAddress(hotWallet.id);
      
      // Get USDT contract
      const usdtContract = new ethers.Contract(
        config.blockchain.bscMainnet.contracts.usdt,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ],
        wallet
      );
      
      // Get USDT decimals
      const decimals = await usdtContract.decimals();
      
      // Get current balance
      const balance = await usdtContract.balanceOf(hotWallet.address);
      const balanceDecimal = parseFloat(ethers.utils.formatUnits(balance, decimals));
      
      // Get threshold for moving to cold storage
      const threshold = parseFloat(config.wallet.hotWalletThreshold);
      
      logger.info(`Hot wallet ${hotWallet.address} balance: ${balanceDecimal} USDT`, {
        address: hotWallet.address,
        balance: balanceDecimal
      });
      
      // If balance exceeds threshold, transfer to cold storage
      if (balanceDecimal > threshold) {
        logger.info(`Hot wallet balance exceeds threshold (${threshold} USDT), transferring to cold storage`, {
          address: hotWallet.address,
          balance: balanceDecimal,
          threshold,
          coldWalletAddress
        });
        
        // Calculate gas cost and determine amount to transfer
        // Leave some funds for gas
        const gasReserve = ethers.utils.parseUnits('0.01', 'ether'); // 0.01 BNB for gas
        const bnbBalance = await wallet.getBalance();
        
        if (bnbBalance.lt(gasReserve)) {
          logger.warn(`Hot wallet ${hotWallet.address} has insufficient BNB for gas, skipping transfer`, {
            address: hotWallet.address,
            bnbBalance: ethers.utils.formatEther(bnbBalance)
          });
          return;
        }
        
        // Calculate gas price with a slight increase for faster confirmation
        const gasPrice = ethers.utils.parseUnits(
          config.blockchain.bscMainnet.gasPrice,
          'gwei'
        ).mul(120).div(100); // 20% higher than base gas price
        
        // Transfer USDT to cold wallet
        const tx = await usdtContract.transfer(coldWalletAddress, balance, {
          gasLimit: config.blockchain.bscMainnet.gasLimit,
          gasPrice
        });
        
        logger.info(`Cold storage transfer transaction submitted: ${tx.hash}`, {
          txHash: tx.hash,
          amount: ethers.utils.formatUnits(balance, decimals),
          from: hotWallet.address,
          to: coldWalletAddress
        });
        
        // Wait for transaction confirmation
        const receipt = await tx.wait(config.blockchain.bscMainnet.confirmations);
        
        if (receipt.status === 1) {
          logger.info(`Cold storage transfer completed: ${tx.hash}`, {
            txHash: tx.hash,
            amount: ethers.utils.formatUnits(balance, decimals)
          });
          
          // Create transaction record
          const connection = await getConnection();
          const transactionRepository = connection.getRepository(Transaction);
          const auditLogRepository = connection.getRepository(AuditLog);
          
          const transaction = new Transaction();
          transaction.txHash = tx.hash;
          transaction.status = TransactionStatus.CONFIRMED;
          transaction.type = TransactionType.TRANSFER;
          transaction.amount = balanceDecimal;
          transaction.currency = 'USDT';
          transaction.fromAddress = hotWallet.address;
          transaction.toAddress = coldWalletAddress;
          transaction.confirmations = config.blockchain.bscMainnet.confirmations;
          transaction.blockNumber = receipt.blockNumber;
          transaction.blockHash = receipt.blockHash;
          transaction.blockTimestamp = new Date();
          
          await transactionRepository.save(transaction);
          
          // Create audit log
          const auditLog = AuditLog.create({
            action: AuditLogAction.COLD_STORAGE_TRANSFER,
            entityType: AuditLogEntityType.TRANSACTION,
            entityId: transaction.id,
            description: `Transferred ${balanceDecimal} USDT from hot wallet to cold storage`,
            merchantId: undefined
          });
          
          await auditLogRepository.save(auditLog);
        } else {
          logger.error(`Cold storage transfer failed: ${tx.hash}`, {
            txHash: tx.hash
          });
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing hot wallet transfer: ${errorMessage}`, {
        error,
        hotWalletAddress: hotWallet.address
      });
    }
  }
}