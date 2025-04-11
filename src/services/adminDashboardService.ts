import { getConnection, DatabaseCircuitBreaker } from '../db/connection';
import { ethers } from 'ethers';
import { Transaction, TransactionStatus, TransactionType } from '../db/entities/Transaction';
import { PaymentAddress, AddressStatus, AddressType } from '../db/entities/PaymentAddress';
import { Merchant } from '../db/entities/Merchant';
import { User } from '../db/entities/User';
import { ApiKey } from '../db/entities/ApiKey';
import { Webhook, WebhookStatus } from '../db/entities/Webhook';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';
import { BlockchainService } from './blockchainService';
import { WalletService } from './walletService';
import { SettlementService } from './settlementService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Between, LessThan, MoreThan, IsNull } from 'typeorm';

/**
 * Service for admin dashboard functionality
 */
export class AdminDashboardService {
  private blockchainService: BlockchainService;
  private walletService: WalletService;
  private settlementService: SettlementService;
  
  constructor(
    blockchainService: BlockchainService,
    walletService: WalletService,
    settlementService: SettlementService
  ) {
    this.blockchainService = blockchainService;
    this.walletService = walletService;
    this.settlementService = settlementService;
  }
  
  /**
   * Get system overview statistics
   */
  async getSystemOverview(): Promise<any> {
    try {
      const connection = await getConnection();
      
      // Get transaction statistics
      const transactionStats = await this.getTransactionStatistics();
      
      // Get merchant count
      const merchantCount = await connection.getRepository(Merchant).count();
      
      // Get active address count
      const activeAddressCount = await connection.getRepository(PaymentAddress).count({
        where: { status: AddressStatus.ACTIVE }
      });
      
      // Get webhook statistics
      const webhookStats = await this.getWebhookStatistics();
      
      return {
        transactions: transactionStats,
        merchants: {
          total: merchantCount
        },
        addresses: {
          active: activeAddressCount
        },
        webhooks: webhookStats
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting system overview: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get transaction statistics
   */
  private async getTransactionStatistics(): Promise<any> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get total transaction count
      const totalCount = await transactionRepository.count();
      
      // Get transaction count by status
      const pendingCount = await transactionRepository.count({
        where: { status: TransactionStatus.PENDING }
      });
      
      const confirmingCount = await transactionRepository.count({
        where: { status: TransactionStatus.CONFIRMING }
      });
      
      const confirmedCount = await transactionRepository.count({
        where: { status: TransactionStatus.CONFIRMED }
      });
      
      const settledCount = await transactionRepository.count({
        where: { status: TransactionStatus.SETTLED }
      });
      
      // Get transaction volume for last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const last24HoursTransactions = await transactionRepository.find({
        where: {
          createdAt: MoreThan(oneDayAgo),
          status: TransactionStatus.CONFIRMED
        }
      });
      
      const last24HoursVolume = last24HoursTransactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );
      
      // Get transaction volume for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const last7DaysTransactions = await transactionRepository.find({
        where: {
          createdAt: MoreThan(sevenDaysAgo),
          status: TransactionStatus.CONFIRMED
        }
      });
      
      const last7DaysVolume = last7DaysTransactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );
      
      return {
        total: totalCount,
        pending: pendingCount,
        confirming: confirmingCount,
        confirmed: confirmedCount,
        settled: settledCount,
        volume: {
          last24Hours: last24HoursVolume,
          last7Days: last7DaysVolume
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting transaction statistics: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get webhook statistics
   */
  private async getWebhookStatistics(): Promise<any> {
    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);
      
      // Get total webhook count
      const totalCount = await webhookRepository.count();
      
      // Get active webhook count
      const activeCount = await webhookRepository.count({
        where: { status: WebhookStatus.ACTIVE }
      });
      
      // Get failed webhook count
      const failedCount = await webhookRepository.count({
        where: { status: WebhookStatus.FAILED }
      });
      
      return {
        total: totalCount,
        active: activeCount,
        failed: failedCount
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting webhook statistics: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get merchant list with statistics
   * @param page Page number
   * @param limit Items per page
   */
  async getMerchantList(page: number = 1, limit: number = 20): Promise<any> {
    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);
      
      const skip = (page - 1) * limit;
      
      // Get merchants with pagination
      const [merchants, total] = await merchantRepository.findAndCount({
        skip,
        take: limit,
        order: {
          createdAt: 'DESC'
        }
      });
      
      // Get transaction statistics for each merchant
      const merchantsWithStats = await Promise.all(
        merchants.map(async (merchant) => {
          const stats = await this.getMerchantStatistics(merchant.id);
          return {
            ...merchant,
            statistics: stats
          };
        })
      );
      
      return {
        merchants: merchantsWithStats,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting merchant list: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get statistics for a specific merchant
   * @param merchantId The merchant ID
   */
  async getMerchantStatistics(merchantId: string): Promise<any> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Get transaction count
      const transactionCount = await transactionRepository.count({
        where: { merchantId }
      });
      
      // Get confirmed transaction count
      const confirmedCount = await transactionRepository.count({
        where: {
          merchantId,
          status: TransactionStatus.CONFIRMED
        }
      });
      
      // Get active address count
      const activeAddressCount = await paymentAddressRepository.count({
        where: {
          merchantId,
          status: AddressStatus.ACTIVE
        }
      });
      
      // Get total transaction volume
      const transactions = await transactionRepository.find({
        where: {
          merchantId,
          status: TransactionStatus.CONFIRMED
        }
      });
      
      const totalVolume = transactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );
      
      // Get last 30 days volume
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const last30DaysTransactions = await transactionRepository.find({
        where: {
          merchantId,
          status: TransactionStatus.CONFIRMED,
          createdAt: MoreThan(thirtyDaysAgo)
        }
      });
      
      const last30DaysVolume = last30DaysTransactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );
      
      return {
        transactionCount,
        confirmedCount,
        activeAddressCount,
        totalVolume,
        last30DaysVolume
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Error getting merchant statistics: ${err.message}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Get detailed merchant information
   * @param merchantId The merchant ID
   */
  async getMerchantDetails(merchantId: string): Promise<any> {
    try {
      const connection = await getConnection();
      const merchantRepository = connection.getRepository(Merchant);
      
      // Get merchant
      const merchant = await merchantRepository.findOne({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        throw new Error(`Merchant not found: ${merchantId}`);
      }
      
      // Get merchant statistics
      const statistics = await this.getMerchantStatistics(merchantId);
      
      // Get API keys
      const apiKeys = await connection.getRepository(ApiKey).find({
        where: { merchantId },
        select: ['id', 'key', 'expiresAt', 'lastUsedAt', 'createdAt']
      });
      
      // Get webhooks
      const webhooks = await connection.getRepository(Webhook).find({
        where: { merchantId }
      });
      
      // Get recent transactions
      const recentTransactions = await connection.getRepository(Transaction).find({
        where: { merchantId },
        order: { createdAt: 'DESC' },
        take: 10
      });
      
      return {
        merchant,
        statistics,
        apiKeys,
        webhooks,
        recentTransactions
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting merchant details: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Get transaction list with filtering and pagination
   * @param filters Filter criteria
   * @param page Page number
   * @param limit Items per page
   */
  async getTransactionList(filters: any = {}, page: number = 1, limit: number = 20): Promise<any> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      const skip = (page - 1) * limit;
      
      // Build where clause based on filters
      const whereClause: any = {};
      
      if (filters.status) {
        whereClause.status = filters.status;
      }
      
      if (filters.type) {
        whereClause.type = filters.type;
      }
      
      if (filters.merchantId) {
        whereClause.merchantId = filters.merchantId;
      }
      
      if (filters.fromAddress) {
        whereClause.fromAddress = filters.fromAddress;
      }
      
      if (filters.toAddress) {
        whereClause.toAddress = filters.toAddress;
      }
      
      if (filters.startDate && filters.endDate) {
        whereClause.createdAt = Between(
          new Date(filters.startDate),
          new Date(filters.endDate)
        );
      } else if (filters.startDate) {
        whereClause.createdAt = MoreThan(new Date(filters.startDate));
      } else if (filters.endDate) {
        whereClause.createdAt = LessThan(new Date(filters.endDate));
      }
      
      // Get transactions with pagination
      const [transactions, total] = await transactionRepository.findAndCount({
        where: whereClause,
        skip,
        take: limit,
        order: {
          createdAt: 'DESC'
        },
        relations: ['paymentAddress']
      });
      
      return {
        transactions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting transaction list: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get detailed transaction information
   * @param transactionId The transaction ID
   */
  async getTransactionDetails(transactionId: string): Promise<any> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get transaction
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId },
        relations: ['paymentAddress', 'merchant']
      });
      
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      // Get blockchain transaction details if available
      let blockchainDetails = null;
      if (transaction.txHash) {
        blockchainDetails = await this.blockchainService.getTransactionDetails(transaction.txHash);
      }
      
      // Get related settlement transaction if available
      let settlementTransaction = null;
      if (transaction.settlementTxHash) {
        settlementTransaction = await this.blockchainService.getTransactionDetails(transaction.settlementTxHash);
      }
      
      // Get audit logs related to this transaction
      const auditLogs = await connection.getRepository(AuditLog).find({
        where: {
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: transactionId
        },
        order: { createdAt: 'DESC' }
      });
      
      return {
        transaction,
        blockchainDetails,
        settlementTransaction,
        auditLogs
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting transaction details: ${errorMessage}`, { error, transactionId });
      throw error;
    }
  }
  
  /**
   * Get wallet overview information
   */
  async getWalletOverview(): Promise<any> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Get hot wallet addresses
      const hotWallets = await paymentAddressRepository.find({
        where: {
          type: AddressType.HOT_WALLET,
          status: AddressStatus.ACTIVE
        }
      });
      
      // Get hot wallet balances
      const hotWalletBalances = await Promise.all(
        hotWallets.map(async (wallet) => {
          const balance = await this.blockchainService.getUsdtBalance(wallet.address);
          return {
            address: wallet.address,
            balance: balance.toString(),
            formattedBalance: ethers.utils.formatUnits(balance, 18) // Assuming 18 decimals for USDT
          };
        })
      );
      
      // Get cold wallet balance if configured
      let coldWalletBalance = null;
      if (config.wallet.coldWalletAddress) {
        const balance = await this.blockchainService.getUsdtBalance(config.wallet.coldWalletAddress);
        coldWalletBalance = {
          address: config.wallet.coldWalletAddress,
          balance: balance.toString(),
          formattedBalance: ethers.utils.formatUnits(balance, 18) // Assuming 18 decimals for USDT
        };
      }
      
      // Get active merchant payment addresses count
      const activeMerchantAddressCount = await paymentAddressRepository.count({
        where: {
          type: AddressType.MERCHANT_PAYMENT,
          status: AddressStatus.ACTIVE
        }
      });
      
      return {
        hotWallets: hotWalletBalances,
        coldWallet: coldWalletBalance,
        activeMerchantAddressCount,
        hdWalletInfo: {
          path: config.wallet.hdPath,
          addressExpirationTime: config.wallet.addressExpirationTime,
          hotWalletThreshold: config.wallet.hotWalletThreshold
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting wallet overview: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Trigger manual settlement for a merchant
   * @param merchantId The merchant ID
   */
  async triggerMerchantSettlement(merchantId: string): Promise<any> {
    try {
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Find confirmed transactions for this merchant that haven't been settled
      const pendingSettlements = await transactionRepository.find({
        where: {
          merchantId,
          status: TransactionStatus.CONFIRMED,
          type: TransactionType.PAYMENT,
          settlementTxHash: IsNull()
        }
      });
      
      if (pendingSettlements.length === 0) {
        return {
          success: false,
          message: 'No pending settlements found for this merchant'
        };
      }
      
      // Schedule settlement
      await this.settlementService.scheduleSettlements();
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.SETTLEMENT_TRIGGERED,
        entityType: AuditLogEntityType.MERCHANT,
        entityId: merchantId,
        description: `Manual settlement triggered for ${pendingSettlements.length} transactions`,
        merchantId: merchantId
      });
      
      await auditLogRepository.save(auditLog);
      
      return {
        success: true,
        message: `Settlement scheduled for ${pendingSettlements.length} transactions`,
        transactionCount: pendingSettlements.length
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error triggering merchant settlement: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Trigger manual transfer to cold storage
   */
  async triggerColdStorageTransfer(): Promise<any> {
    try {
      const connection = await getConnection();
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Trigger transfer to cold storage
      await this.settlementService.transferToColdStorage();
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.COLD_STORAGE_TRANSFER_TRIGGERED,
        entityType: AuditLogEntityType.SYSTEM,
        entityId: 'system',
        description: 'Manual cold storage transfer triggered'
        // merchantId is undefined by default, which is now handled correctly in AuditLog.create()
      });
      
      await auditLogRepository.save(auditLog);
      
      return {
        success: true,
        message: 'Cold storage transfer initiated'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error triggering cold storage transfer: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get system audit logs with filtering and pagination
   * @param filters Filter criteria
   * @param page Page number
   * @param limit Items per page
   */
  async getAuditLogs(filters: any = {}, page: number = 1, limit: number = 20): Promise<any> {
    try {
      const connection = await getConnection();
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const skip = (page - 1) * limit;
      
      // Build where clause based on filters
      const whereClause: any = {};
      
      if (filters.action) {
        whereClause.action = filters.action;
      }
      
      if (filters.entityType) {
        whereClause.entityType = filters.entityType;
      }
      
      if (filters.entityId) {
        whereClause.entityId = filters.entityId;
      }
      
      if (filters.merchantId) {
        whereClause.merchantId = filters.merchantId;
      }
      
      if (filters.startDate && filters.endDate) {
        whereClause.createdAt = Between(
          new Date(filters.startDate),
          new Date(filters.endDate)
        );
      } else if (filters.startDate) {
        whereClause.createdAt = MoreThan(new Date(filters.startDate));
      } else if (filters.endDate) {
        whereClause.createdAt = LessThan(new Date(filters.endDate));
      }
      
      // Get audit logs with pagination
      const [auditLogs, total] = await auditLogRepository.findAndCount({
        where: whereClause,
        skip,
        take: limit,
        order: {
          createdAt: 'DESC'
        }
      });
      
      return {
        auditLogs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting audit logs: ${errorMessage}`, { error });
      throw error;
    }
  }
}