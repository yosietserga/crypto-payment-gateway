"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionMonitorService = void 0;
const ethers_1 = require("ethers");
const connection_1 = require("../db/connection");
const Transaction_1 = require("../db/entities/Transaction");
const PaymentAddress_1 = require("../db/entities/PaymentAddress");
const Webhook_1 = require("../db/entities/Webhook");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const AuditLog_1 = require("../db/entities/AuditLog");
/**
 * Service for monitoring and processing blockchain transactions
 */
class TransactionMonitorService {
    constructor(blockchainService, webhookService, queueService) {
        this.blockchainService = blockchainService;
        this.webhookService = webhookService;
        this.queueService = queueService;
    }
    /**
     * Initialize the transaction monitor service
     */
    async initialize() {
        try {
            // Start consuming from the transaction monitor queue
            await this.queueService.consumeQueue('transaction.monitor', this.processTransactionMonitorTask.bind(this));
            // Start monitoring active addresses
            await this.startMonitoringActiveAddresses();
            logger_1.logger.info('Transaction monitor service initialized successfully');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to initialize transaction monitor service: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Start monitoring all active payment addresses
     */
    async startMonitoringActiveAddresses() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Find all active addresses that should be monitored
            const activeAddresses = await paymentAddressRepository.find({
                where: {
                    status: PaymentAddress_1.AddressStatus.ACTIVE,
                    isMonitored: true
                }
            });
            if (activeAddresses.length === 0) {
                logger_1.logger.info('No active addresses to monitor');
                return;
            }
            // Extract address strings
            const addressStrings = activeAddresses.map(addr => addr.address);
            // Start monitoring these addresses
            await this.blockchainService.startMonitoringAddresses(addressStrings);
            logger_1.logger.info(`Started monitoring ${addressStrings.length} active addresses`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error starting to monitor active addresses: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Process a transaction monitoring task from the queue
     * @param data The task data
     */
    async processTransactionMonitorTask(data) {
        try {
            const { type, id } = data;
            if (!type || !id) {
                logger_1.logger.error('Invalid transaction monitor task: missing type or id', { data });
                return;
            }
            logger_1.logger.info(`Processing transaction monitor task: ${type} for ${id}`);
            // Process based on task type
            if (type === 'check_confirmations') {
                await this.checkTransactionConfirmations(id);
            }
            else if (type === 'check_address_expiration') {
                await this.checkAddressExpiration(id);
            }
            else {
                logger_1.logger.warn(`Unknown transaction monitor task type: ${type}`, { data });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error processing transaction monitor task: ${errorMessage}`, { error, data });
        }
    }
    /**
     * Check transaction confirmations and update status
     * @param transactionId The transaction ID
     */
    async checkTransactionConfirmations(transactionId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            // Get the transaction
            const transaction = await transactionRepository.findOne({
                where: { id: transactionId },
                relations: ['paymentAddress']
            });
            if (!transaction) {
                logger_1.logger.warn(`Transaction not found: ${transactionId}`);
                return;
            }
            // Skip if transaction is not in a state that needs confirmation checking
            if (transaction.status !== Transaction_1.TransactionStatus.PENDING &&
                transaction.status !== Transaction_1.TransactionStatus.CONFIRMING &&
                transaction.status !== Transaction_1.TransactionStatus.CONFIRMED) {
                return;
            }
            // Get current confirmations from blockchain
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(config_1.config.blockchain.bscMainnet.rpcUrl);
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
            if (confirmations >= config_1.config.blockchain.bscMainnet.confirmations) {
                if (transaction.status !== Transaction_1.TransactionStatus.CONFIRMED) {
                    transaction.status = Transaction_1.TransactionStatus.CONFIRMED;
                    // Send webhook notification for confirmed transaction
                    await this.webhookService.sendWebhookNotification(transaction.merchantId, Webhook_1.WebhookEvent.PAYMENT_CONFIRMED, {
                        id: transaction.id,
                        txHash: transaction.txHash,
                        amount: transaction.amount,
                        currency: transaction.currency,
                        confirmations: transaction.confirmations,
                        status: transaction.status,
                        paymentAddress: transaction.paymentAddress?.address,
                        metadata: transaction.metadata
                    });
                }
            }
            else if (transaction.status === Transaction_1.TransactionStatus.PENDING) {
                transaction.status = Transaction_1.TransactionStatus.CONFIRMING;
            }
            // Save the updated transaction
            await transactionRepository.save(transaction);
            // Create audit log if status changed
            if (previousState.status !== transaction.status) {
                const auditLog = AuditLog_1.AuditLog.create({
                    action: AuditLog_1.AuditLogAction.TRANSACTION_STATUS_UPDATED,
                    entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
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
            if (transaction.status !== Transaction_1.TransactionStatus.CONFIRMED) {
                // Exponential backoff for confirmation checks
                const nextCheckDelay = Math.min(60 * Math.pow(2, Math.floor(confirmations / 2)), 3600); // Max 1 hour
                await this.scheduleConfirmationCheck(transactionId, nextCheckDelay);
            }
            logger_1.logger.info(`Updated transaction ${transactionId} confirmations: ${confirmations}`, {
                transactionId,
                confirmations,
                status: transaction.status
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error checking transaction confirmations: ${errorMessage}`, { error, transactionId });
            // Schedule a retry
            await this.scheduleConfirmationCheck(transactionId, 300); // Retry in 5 minutes on error
        }
    }
    /**
     * Schedule a confirmation check for a transaction
     * @param transactionId The transaction ID
     * @param delaySeconds Delay in seconds before the check
     */
    async scheduleConfirmationCheck(transactionId, delaySeconds) {
        try {
            // Add to queue with delay
            setTimeout(async () => {
                await this.queueService.addToQueue('transaction.monitor', {
                    transactionId,
                    type: 'check_confirmations'
                });
            }, delaySeconds * 1000);
            logger_1.logger.debug(`Scheduled confirmation check for transaction ${transactionId} in ${delaySeconds} seconds`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error scheduling confirmation check: ${errorMessage}`, { error, transactionId });
        }
    }
    /**
     * Check if a payment address has expired
     * @param addressId The payment address ID
     */
    async checkAddressExpiration(addressId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            // Get the payment address
            const address = await paymentAddressRepository.findOne({
                where: { id: addressId }
            });
            if (!address) {
                logger_1.logger.warn(`Payment address not found: ${addressId}`);
                return;
            }
            // Skip if address is not active
            if (address.status !== PaymentAddress_1.AddressStatus.ACTIVE) {
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
                const auditLog = AuditLog_1.AuditLog.create({
                    action: AuditLog_1.AuditLogAction.ADDRESS_EXPIRED,
                    entityType: AuditLog_1.AuditLogEntityType.PAYMENT_ADDRESS,
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
                await this.webhookService.sendWebhookNotification(address.merchantId, Webhook_1.WebhookEvent.ADDRESS_EXPIRED, {
                    id: address.id,
                    address: address.address,
                    status: address.status,
                    expiresAt: address.expiresAt,
                    metadata: address.metadata
                });
                logger_1.logger.info(`Payment address ${addressId} marked as expired`, { addressId });
            }
            else {
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
                        logger_1.logger.debug(`Scheduled expiration check for address ${addressId} at ${expiresAt.toISOString()}`);
                    }
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error checking address expiration: ${errorMessage}`, { error, addressId });
        }
    }
    /**
     * Retry sending a webhook for a transaction
     * @param transactionId The transaction ID
     * @param webhookEvent The webhook event to send
     */
    async retryWebhook(transactionId, webhookEvent) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            // Get the transaction
            const transaction = await transactionRepository.findOne({
                where: { id: transactionId },
                relations: ['paymentAddress']
            });
            if (!transaction) {
                logger_1.logger.warn(`Transaction not found for webhook retry: ${transactionId}`);
                return;
            }
            // Send webhook notification
            await this.webhookService.sendWebhookNotification(transaction.merchantId, webhookEvent, {
                id: transaction.id,
                txHash: transaction.txHash,
                amount: transaction.amount,
                currency: transaction.currency,
                confirmations: transaction.confirmations,
                status: transaction.status,
                paymentAddress: transaction.paymentAddress?.address,
                metadata: transaction.metadata
            });
            logger_1.logger.info(`Retried webhook ${webhookEvent} for transaction ${transactionId}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error retrying webhook: ${errorMessage}`, { error, transactionId, webhookEvent });
        }
    }
}
exports.TransactionMonitorService = TransactionMonitorService;
//# sourceMappingURL=transactionMonitorService.js.map