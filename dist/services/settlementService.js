"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementService = void 0;
const ethers_1 = require("ethers");
const connection_1 = require("../db/connection");
const Transaction_1 = require("../db/entities/Transaction");
const PaymentAddress_1 = require("../db/entities/PaymentAddress");
const typeorm_1 = require("typeorm");
const Webhook_1 = require("../db/entities/Webhook");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const AuditLog_1 = require("../db/entities/AuditLog");
/**
 * Service for handling settlement of funds from merchant payment addresses to hot wallets and cold storage
 */
class SettlementService {
    constructor(walletService, blockchainService, queueService, webhookService) {
        this.walletService = walletService;
        this.blockchainService = blockchainService;
        this.queueService = queueService;
        this.webhookService = webhookService;
    }
    /**
     * Initialize the settlement service
     */
    async initialize() {
        try {
            // Start consuming from the settlement queue
            await this.queueService.consumeQueue('settlement.process', this.processSettlementTask.bind(this));
            logger_1.logger.info('Settlement service initialized successfully');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to initialize settlement service: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Schedule settlement of confirmed transactions to hot wallet
     */
    async scheduleSettlements() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            // Find confirmed transactions that haven't been settled yet
            const pendingSettlements = await transactionRepository.find({
                where: {
                    status: Transaction_1.TransactionStatus.CONFIRMED,
                    type: Transaction_1.TransactionType.PAYMENT,
                    settlementTxHash: (0, typeorm_1.IsNull)()
                },
                relations: ['paymentAddress']
            });
            if (pendingSettlements.length === 0) {
                logger_1.logger.info('No pending settlements found');
                return;
            }
            logger_1.logger.info(`Found ${pendingSettlements.length} transactions pending settlement`);
            // Group transactions by merchant for batch processing
            const merchantTransactions = this.groupTransactionsByMerchant(pendingSettlements);
            // Schedule settlement for each merchant
            for (const [merchantId, transactions] of Object.entries(merchantTransactions)) {
                await this.queueService.addToQueue('settlement.process', {
                    merchantId,
                    transactionIds: transactions.map(tx => tx.id)
                });
                logger_1.logger.info(`Scheduled settlement for merchant ${merchantId} with ${transactions.length} transactions`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error scheduling settlements: ${errorMessage}`, { error });
        }
    }
    /**
     * Group transactions by merchant ID
     * @param transactions The transactions to group
     */
    groupTransactionsByMerchant(transactions) {
        const result = {};
        for (const transaction of transactions) {
            if (!transaction.merchantId)
                continue;
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
    async processSettlementTask(data) {
        try {
            const { merchantId } = data;
            if (!merchantId) {
                logger_1.logger.error('Invalid settlement task: missing merchantId', { data });
                return;
            }
            logger_1.logger.info(`Processing settlement for merchant ${merchantId}`);
            // Process the settlement
            await this.processMerchantSettlement(merchantId);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error processing settlement: ${errorMessage}`, { error, merchantId: data?.merchantId });
        }
    }
    /**
     * Process settlements for a specific merchant
     * @param merchantId The merchant ID to process settlements for
     */
    async processMerchantSettlement(merchantId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const transactionRepository = connection.getRepository(Transaction_1.Transaction);
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Find confirmed transactions for this merchant that haven't been settled yet
            const pendingTransactions = await transactionRepository.find({
                where: {
                    merchantId,
                    status: Transaction_1.TransactionStatus.CONFIRMED,
                    type: Transaction_1.TransactionType.PAYMENT,
                    settlementTxHash: (0, typeorm_1.IsNull)()
                },
                relations: ['paymentAddress']
            });
            if (pendingTransactions.length === 0) {
                logger_1.logger.info(`No pending settlements found for merchant ${merchantId}`);
                return;
            }
            logger_1.logger.info(`Found ${pendingTransactions.length} transactions pending settlement for merchant ${merchantId}`);
            // Get or create a hot wallet for this merchant
            const hotWallets = await paymentAddressRepository.find({
                where: {
                    merchantId,
                    type: PaymentAddress_1.AddressType.HOT_WALLET,
                    status: PaymentAddress_1.AddressStatus.ACTIVE
                }
            });
            let hotWallet;
            if (hotWallets.length === 0) {
                // Create a new hot wallet for this merchant
                hotWallet = await this.walletService.createHotWallet(merchantId);
                logger_1.logger.info(`Created new hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
            }
            else {
                // Use the first active hot wallet
                hotWallet = hotWallets[0];
                logger_1.logger.info(`Using existing hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
            }
            // Process each transaction
            for (const transaction of pendingTransactions) {
                try {
                    await this.settleTransaction(transaction, hotWallet);
                    // Send webhook notification for settlement
                    await this.webhookService.sendWebhookNotification(merchantId, Webhook_1.WebhookEvent.TRANSACTION_SETTLED, {
                        id: transaction.id,
                        txHash: transaction.txHash,
                        settlementTxHash: transaction.settlementTxHash,
                        amount: transaction.amount,
                        currency: transaction.currency
                    });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    logger_1.logger.error(`Error settling transaction ${transaction.id}: ${errorMessage}`, {
                        error,
                        transactionId: transaction.id
                    });
                    // Continue with next transaction
                    continue;
                }
            }
            logger_1.logger.info(`Completed settlement processing for merchant ${merchantId}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error processing merchant settlement: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Settle a single transaction by transferring funds to the hot wallet
     * @param transaction The transaction to settle
     * @param hotWallet The hot wallet to transfer funds to
     */
    async settleTransaction(transaction, hotWallet) {
        try {
            if (!transaction.paymentAddress) {
                throw new Error(`Transaction ${transaction.id} has no associated payment address`);
            }
            // Get wallet for the payment address
            const wallet = await this.walletService.getWalletForAddress(transaction.paymentAddress.id);
            // Get USDT contract
            const usdtContract = new ethers_1.ethers.Contract(config_1.config.blockchain.bscMainnet.contracts.usdt, [
                'function transfer(address to, uint256 amount) returns (bool)',
                'function balanceOf(address owner) view returns (uint256)',
                'function decimals() view returns (uint8)'
            ], wallet);
            // Get USDT decimals
            const decimals = await usdtContract.decimals();
            // Get current balance
            const balance = await usdtContract.balanceOf(transaction.paymentAddress.address);
            if (balance.isZero()) {
                logger_1.logger.warn(`Payment address ${transaction.paymentAddress.address} has zero balance, skipping settlement`);
                return;
            }
            // Calculate gas price with a slight increase for faster confirmation
            const gasPrice = ethers_1.ethers.utils.parseUnits(config_1.config.blockchain.bscMainnet.gasPrice, 'gwei').mul(120).div(100); // 20% higher than base gas price
            // Transfer USDT to hot wallet
            const tx = await usdtContract.transfer(hotWallet.address, balance, {
                gasLimit: config_1.config.blockchain.bscMainnet.gasLimit,
                gasPrice
            });
            logger_1.logger.info(`Settlement transaction submitted: ${tx.hash}`, {
                transactionId: transaction.id,
                settlementTxHash: tx.hash,
                amount: ethers_1.ethers.utils.formatUnits(balance, decimals),
                from: transaction.paymentAddress.address,
                to: hotWallet.address
            });
            // Wait for transaction confirmation
            const receipt = await tx.wait(config_1.config.blockchain.bscMainnet.confirmations);
            if (receipt.status === 1) {
                // Update transaction status
                const connection = await (0, connection_1.getConnection)();
                const transactionRepository = connection.getRepository(Transaction_1.Transaction);
                transaction.status = Transaction_1.TransactionStatus.SETTLED;
                transaction.settlementTxHash = tx.hash;
                await transactionRepository.save(transaction);
                // Mark payment address as used
                const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
                transaction.paymentAddress.markAsUsed();
                await paymentAddressRepository.save(transaction.paymentAddress);
                logger_1.logger.info(`Settlement completed for transaction ${transaction.id}`, {
                    transactionId: transaction.id,
                    settlementTxHash: tx.hash
                });
            }
            else {
                logger_1.logger.error(`Settlement transaction failed for transaction ${transaction.id}`, {
                    transactionId: transaction.id,
                    settlementTxHash: tx.hash
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error settling transaction ${transaction.id}: ${errorMessage}`, {
                error,
                transactionId: transaction.id
            });
            throw error;
        }
    }
    /**
     * Transfer funds from hot wallet to cold storage
     */
    async transferToColdStorage() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Find active hot wallet addresses
            const hotWallets = await paymentAddressRepository.find({
                where: {
                    type: PaymentAddress_1.AddressType.HOT_WALLET,
                    status: PaymentAddress_1.AddressStatus.ACTIVE
                }
            });
            if (hotWallets.length === 0) {
                logger_1.logger.info('No active hot wallet addresses found');
                return;
            }
            // Get cold wallet address from config
            const coldWalletAddress = config_1.config.wallet.coldWalletAddress;
            if (!coldWalletAddress) {
                logger_1.logger.error('Cold wallet address not configured');
                return;
            }
            // Process each hot wallet
            for (const hotWallet of hotWallets) {
                await this.processHotWalletTransfer(hotWallet, coldWalletAddress);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error transferring to cold storage: ${errorMessage}`, { error });
        }
    }
    /**
     * Process transfer from a hot wallet to cold storage
     * @param hotWallet The hot wallet to transfer from
     * @param coldWalletAddress The cold wallet address to transfer to
     */
    async processHotWalletTransfer(hotWallet, coldWalletAddress) {
        try {
            // Get wallet for the hot wallet address
            const wallet = await this.walletService.getWalletForAddress(hotWallet.id);
            // Get USDT contract
            const usdtContract = new ethers_1.ethers.Contract(config_1.config.blockchain.bscMainnet.contracts.usdt, [
                'function transfer(address to, uint256 amount) returns (bool)',
                'function balanceOf(address owner) view returns (uint256)',
                'function decimals() view returns (uint8)'
            ], wallet);
            // Get USDT decimals
            const decimals = await usdtContract.decimals();
            // Get current balance
            const balance = await usdtContract.balanceOf(hotWallet.address);
            const balanceDecimal = parseFloat(ethers_1.ethers.utils.formatUnits(balance, decimals));
            // Get threshold for moving to cold storage
            const threshold = parseFloat(config_1.config.wallet.hotWalletThreshold);
            logger_1.logger.info(`Hot wallet ${hotWallet.address} balance: ${balanceDecimal} USDT`, {
                address: hotWallet.address,
                balance: balanceDecimal
            });
            // If balance exceeds threshold, transfer to cold storage
            if (balanceDecimal > threshold) {
                logger_1.logger.info(`Hot wallet balance exceeds threshold (${threshold} USDT), transferring to cold storage`, {
                    address: hotWallet.address,
                    balance: balanceDecimal,
                    threshold,
                    coldWalletAddress
                });
                // Calculate gas cost and determine amount to transfer
                // Leave some funds for gas
                const gasReserve = ethers_1.ethers.utils.parseUnits('0.01', 'ether'); // 0.01 BNB for gas
                const bnbBalance = await wallet.getBalance();
                if (bnbBalance.lt(gasReserve)) {
                    logger_1.logger.warn(`Hot wallet ${hotWallet.address} has insufficient BNB for gas, skipping transfer`, {
                        address: hotWallet.address,
                        bnbBalance: ethers_1.ethers.utils.formatEther(bnbBalance)
                    });
                    return;
                }
                // Calculate gas price with a slight increase for faster confirmation
                const gasPrice = ethers_1.ethers.utils.parseUnits(config_1.config.blockchain.bscMainnet.gasPrice, 'gwei').mul(120).div(100); // 20% higher than base gas price
                // Transfer USDT to cold wallet
                const tx = await usdtContract.transfer(coldWalletAddress, balance, {
                    gasLimit: config_1.config.blockchain.bscMainnet.gasLimit,
                    gasPrice
                });
                logger_1.logger.info(`Cold storage transfer transaction submitted: ${tx.hash}`, {
                    txHash: tx.hash,
                    amount: ethers_1.ethers.utils.formatUnits(balance, decimals),
                    from: hotWallet.address,
                    to: coldWalletAddress
                });
                // Wait for transaction confirmation
                const receipt = await tx.wait(config_1.config.blockchain.bscMainnet.confirmations);
                if (receipt.status === 1) {
                    logger_1.logger.info(`Cold storage transfer completed: ${tx.hash}`, {
                        txHash: tx.hash,
                        amount: ethers_1.ethers.utils.formatUnits(balance, decimals)
                    });
                    // Create transaction record
                    const connection = await (0, connection_1.getConnection)();
                    const transactionRepository = connection.getRepository(Transaction_1.Transaction);
                    const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
                    const transaction = new Transaction_1.Transaction();
                    transaction.txHash = tx.hash;
                    transaction.status = Transaction_1.TransactionStatus.CONFIRMED;
                    transaction.type = Transaction_1.TransactionType.TRANSFER;
                    transaction.amount = balanceDecimal;
                    transaction.currency = 'USDT';
                    transaction.fromAddress = hotWallet.address;
                    transaction.toAddress = coldWalletAddress;
                    transaction.confirmations = config_1.config.blockchain.bscMainnet.confirmations;
                    transaction.blockNumber = receipt.blockNumber;
                    transaction.blockHash = receipt.blockHash;
                    transaction.blockTimestamp = new Date();
                    await transactionRepository.save(transaction);
                    // Create audit log
                    const auditLog = AuditLog_1.AuditLog.create({
                        action: AuditLog_1.AuditLogAction.COLD_STORAGE_TRANSFER,
                        entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
                        entityId: transaction.id,
                        description: `Transferred ${balanceDecimal} USDT from hot wallet to cold storage`,
                        merchantId: undefined
                    });
                    await auditLogRepository.save(auditLog);
                }
                else {
                    logger_1.logger.error(`Cold storage transfer failed: ${tx.hash}`, {
                        txHash: tx.hash
                    });
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error processing hot wallet transfer: ${errorMessage}`, {
                error,
                hotWalletAddress: hotWallet.address
            });
        }
    }
}
exports.SettlementService = SettlementService;
//# sourceMappingURL=settlementService.js.map