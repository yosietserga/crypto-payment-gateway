"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminDashboardService = void 0;
const connection_1 = require("../db/connection");
const ethers_1 = require("ethers");
const Transaction_1 = require("../db/entities/Transaction");
const PaymentAddress_1 = require("../db/entities/PaymentAddress");
const Merchant_1 = require("../db/entities/Merchant");
const ApiKey_1 = require("../db/entities/ApiKey");
const Webhook_1 = require("../db/entities/Webhook");
const AuditLog_1 = require("../db/entities/AuditLog");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const typeorm_1 = require("typeorm");
/**
 * Service for admin dashboard functionality
 */
class AdminDashboardService {
    constructor(blockchainService, walletService, settlementService) {
        this.blockchainService = blockchainService;
        this.walletService = walletService;
        this.settlementService = settlementService;
    }
    /**
     * Get system overview statistics
     */
    async getSystemOverview() {
        try {
            const connection = await (0, connection_1.getConnection)();
            // Get transaction statistics
            const transactionStats = await this.getTransactionStatistics();
            // Get merchant count
            const merchantCount = await connection.getRepository(Merchant_1.Merchant).count();
            // Get active address count
            const activeAddressCount = await connection.getRepository(PaymentAddress_1.PaymentAddress).count({
                where: { status: PaymentAddress_1.AddressStatus.ACTIVE }
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting system overview: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get transaction statistics
     */
    async getTransactionStatistics() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            // Get total transaction count
            const totalCount = await transactionRepository.count();
            // Get transaction count by status
            const pendingCount = await transactionRepository.count({
                where: { status: Transaction_1.TransactionStatus.PENDING }
            });
            const confirmingCount = await transactionRepository.count({
                where: { status: Transaction_1.TransactionStatus.CONFIRMING }
            });
            const confirmedCount = await transactionRepository.count({
                where: { status: Transaction_1.TransactionStatus.CONFIRMED }
            });
            const settledCount = await transactionRepository.count({
                where: { status: Transaction_1.TransactionStatus.SETTLED }
            });
            // Get transaction volume for last 24 hours
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const last24HoursTransactions = await transactionRepository.find({
                where: {
                    createdAt: (0, typeorm_1.MoreThan)(oneDayAgo),
                    status: Transaction_1.TransactionStatus.CONFIRMED
                }
            });
            const last24HoursVolume = last24HoursTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
            // Get transaction volume for last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const last7DaysTransactions = await transactionRepository.find({
                where: {
                    createdAt: (0, typeorm_1.MoreThan)(sevenDaysAgo),
                    status: Transaction_1.TransactionStatus.CONFIRMED
                }
            });
            const last7DaysVolume = last7DaysTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting transaction statistics: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get webhook statistics
     */
    async getWebhookStatistics() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const webhookRepository = connection.getRepository(Webhook_1.Webhook);
            // Get total webhook count
            const totalCount = await webhookRepository.count();
            // Get active webhook count
            const activeCount = await webhookRepository.count({
                where: { status: Webhook_1.WebhookStatus.ACTIVE }
            });
            // Get failed webhook count
            const failedCount = await webhookRepository.count({
                where: { status: Webhook_1.WebhookStatus.FAILED }
            });
            return {
                total: totalCount,
                active: activeCount,
                failed: failedCount
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting webhook statistics: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get merchant list with statistics
     * @param page Page number
     * @param limit Items per page
     */
    async getMerchantList(page = 1, limit = 20) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const merchantRepository = connection.getRepository(Merchant_1.Merchant);
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
            const merchantsWithStats = await Promise.all(merchants.map(async (merchant) => {
                const stats = await this.getMerchantStatistics(merchant.id);
                return {
                    ...merchant,
                    statistics: stats
                };
            }));
            return {
                merchants: merchantsWithStats,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting merchant list: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get statistics for a specific merchant
     * @param merchantId The merchant ID
     */
    async getMerchantStatistics(merchantId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Get transaction count
            const transactionCount = await transactionRepository.count({
                where: { merchantId }
            });
            // Get confirmed transaction count
            const confirmedCount = await transactionRepository.count({
                where: {
                    merchantId,
                    status: Transaction_1.TransactionStatus.CONFIRMED
                }
            });
            // Get active address count
            const activeAddressCount = await paymentAddressRepository.count({
                where: {
                    merchantId,
                    status: PaymentAddress_1.AddressStatus.ACTIVE
                }
            });
            // Get total transaction volume
            const transactions = await transactionRepository.find({
                where: {
                    merchantId,
                    status: Transaction_1.TransactionStatus.CONFIRMED
                }
            });
            const totalVolume = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
            // Get last 30 days volume
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const last30DaysTransactions = await transactionRepository.find({
                where: {
                    merchantId,
                    status: Transaction_1.TransactionStatus.CONFIRMED,
                    createdAt: (0, typeorm_1.MoreThan)(thirtyDaysAgo)
                }
            });
            const last30DaysVolume = last30DaysTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
            return {
                transactionCount,
                confirmedCount,
                activeAddressCount,
                totalVolume,
                last30DaysVolume
            };
        }
        catch (error) {
            const err = error;
            logger_1.logger.error(`Error getting merchant statistics: ${err.message}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Get detailed merchant information
     * @param merchantId The merchant ID
     */
    async getMerchantDetails(merchantId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const merchantRepository = connection.getRepository(Merchant_1.Merchant);
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
            const apiKeys = await connection.getRepository(ApiKey_1.ApiKey).find({
                where: { merchantId },
                select: ['id', 'key', 'expiresAt', 'lastUsedAt', 'createdAt']
            });
            // Get webhooks
            const webhooks = await connection.getRepository(Webhook_1.Webhook).find({
                where: { merchantId }
            });
            // Get recent transactions
            const recentTransactions = await connection.getRepository(Transaction_1.Transaction).find({
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting merchant details: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Get transaction list with filtering and pagination
     * @param filters Filter criteria
     * @param page Page number
     * @param limit Items per page
     */
    async getTransactionList(filters = {}, page = 1, limit = 20) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            const skip = (page - 1) * limit;
            // Build where clause based on filters
            const whereClause = {};
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
                whereClause.createdAt = (0, typeorm_1.Between)(new Date(filters.startDate), new Date(filters.endDate));
            }
            else if (filters.startDate) {
                whereClause.createdAt = (0, typeorm_1.MoreThan)(new Date(filters.startDate));
            }
            else if (filters.endDate) {
                whereClause.createdAt = (0, typeorm_1.LessThan)(new Date(filters.endDate));
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting transaction list: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get detailed transaction information
     * @param transactionId The transaction ID
     */
    async getTransactionDetails(transactionId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
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
            const auditLogs = await connection.getRepository(AuditLog_1.AuditLog).find({
                where: {
                    entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting transaction details: ${errorMessage}`, { error, transactionId });
            throw error;
        }
    }
    /**
     * Get wallet overview information
     */
    async getWalletOverview() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Get hot wallet addresses
            const hotWallets = await paymentAddressRepository.find({
                where: {
                    type: PaymentAddress_1.AddressType.HOT_WALLET,
                    status: PaymentAddress_1.AddressStatus.ACTIVE
                }
            });
            // Get hot wallet balances
            const hotWalletBalances = await Promise.all(hotWallets.map(async (wallet) => {
                const balance = await this.blockchainService.getUsdtBalance(wallet.address);
                return {
                    address: wallet.address,
                    balance: balance.toString(),
                    formattedBalance: ethers_1.ethers.utils.formatUnits(balance, 18) // Assuming 18 decimals for USDT
                };
            }));
            // Get cold wallet balance if configured
            let coldWalletBalance = null;
            if (config_1.config.wallet.coldWalletAddress) {
                const balance = await this.blockchainService.getUsdtBalance(config_1.config.wallet.coldWalletAddress);
                coldWalletBalance = {
                    address: config_1.config.wallet.coldWalletAddress,
                    balance: balance.toString(),
                    formattedBalance: ethers_1.ethers.utils.formatUnits(balance, 18) // Assuming 18 decimals for USDT
                };
            }
            // Get active merchant payment addresses count
            const activeMerchantAddressCount = await paymentAddressRepository.count({
                where: {
                    type: PaymentAddress_1.AddressType.MERCHANT_PAYMENT,
                    status: PaymentAddress_1.AddressStatus.ACTIVE
                }
            });
            return {
                hotWallets: hotWalletBalances,
                coldWallet: coldWalletBalance,
                activeMerchantAddressCount,
                hdWalletInfo: {
                    path: config_1.config.wallet.hdPath,
                    addressExpirationTime: config_1.config.wallet.addressExpirationTime,
                    hotWalletThreshold: config_1.config.wallet.hotWalletThreshold
                }
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting wallet overview: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Trigger manual settlement for a merchant
     * @param merchantId The merchant ID
     */
    async triggerMerchantSettlement(merchantId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            // Find confirmed transactions for this merchant that haven't been settled
            const pendingSettlements = await transactionRepository.find({
                where: {
                    merchantId,
                    status: Transaction_1.TransactionStatus.CONFIRMED,
                    type: Transaction_1.TransactionType.PAYMENT,
                    settlementTxHash: (0, typeorm_1.IsNull)()
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
            const auditLog = AuditLog_1.AuditLog.create({
                action: AuditLog_1.AuditLogAction.SETTLEMENT_TRIGGERED,
                entityType: AuditLog_1.AuditLogEntityType.MERCHANT,
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error triggering merchant settlement: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Trigger manual transfer to cold storage
     */
    async triggerColdStorageTransfer() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            // Trigger transfer to cold storage
            await this.settlementService.transferToColdStorage();
            // Create audit log
            const auditLog = AuditLog_1.AuditLog.create({
                action: AuditLog_1.AuditLogAction.COLD_STORAGE_TRANSFER_TRIGGERED,
                entityType: AuditLog_1.AuditLogEntityType.SYSTEM,
                entityId: 'system',
                description: 'Manual cold storage transfer triggered'
                // merchantId is undefined by default, which is now handled correctly in AuditLog.create()
            });
            await auditLogRepository.save(auditLog);
            return {
                success: true,
                message: 'Cold storage transfer initiated'
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error triggering cold storage transfer: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get system audit logs with filtering and pagination
     * @param filters Filter criteria
     * @param page Page number
     * @param limit Items per page
     */
    async getAuditLogs(filters = {}, page = 1, limit = 20) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            const skip = (page - 1) * limit;
            // Build where clause based on filters
            const whereClause = {};
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
                whereClause.createdAt = (0, typeorm_1.Between)(new Date(filters.startDate), new Date(filters.endDate));
            }
            else if (filters.startDate) {
                whereClause.createdAt = (0, typeorm_1.MoreThan)(new Date(filters.startDate));
            }
            else if (filters.endDate) {
                whereClause.createdAt = (0, typeorm_1.LessThan)(new Date(filters.endDate));
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting audit logs: ${errorMessage}`, { error });
            throw error;
        }
    }
}
exports.AdminDashboardService = AdminDashboardService;
//# sourceMappingURL=adminDashboardService.js.map