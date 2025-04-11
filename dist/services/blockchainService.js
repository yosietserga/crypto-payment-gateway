"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainService = void 0;
const ethers_1 = require("ethers");
const connection_1 = require("../db/connection");
const PaymentAddress_1 = require("../db/entities/PaymentAddress");
const Transaction_1 = require("../db/entities/Transaction");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const Webhook_1 = require("../db/entities/Webhook");
const AuditLog_1 = require("../db/entities/AuditLog");
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
class BlockchainService {
    /**
     * Get transaction details from the blockchain
     * @param txHash The transaction hash
     */
    async getTransactionDetails(txHash) {
        try {
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(config_1.config.blockchain.bscMainnet.rpcUrl);
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to get transaction details: ${errorMessage}`, { error, txHash });
            return null;
        }
    }
    constructor(webhookService, queueService) {
        this.isMonitoring = false;
        this.monitoringAddresses = new Set();
        this.webhookService = webhookService;
        this.queueService = queueService;
        // Initialize providers
        this.initializeProviders();
    }
    /**
     * Initialize blockchain providers and contracts
     */
    initializeProviders() {
        try {
            // HTTP provider for general API calls
            this.provider = new ethers_1.ethers.providers.JsonRpcProvider(config_1.config.blockchain.bscMainnet.rpcUrl);
            // WebSocket provider for real-time events
            this.wsProvider = new ethers_1.ethers.providers.WebSocketProvider(config_1.config.blockchain.bscMainnet.wsUrl);
            // Initialize USDT contract
            this.usdtContract = new ethers_1.ethers.Contract(config_1.config.blockchain.bscMainnet.contracts.usdt, ERC20_ABI, this.provider);
            // Set up reconnection for WebSocket provider
            this.setupWebSocketReconnection();
            logger_1.logger.info('Blockchain providers initialized successfully');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to initialize blockchain providers: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Set up automatic reconnection for WebSocket provider
     */
    setupWebSocketReconnection() {
        this.wsProvider._websocket.on('close', () => {
            logger_1.logger.warn('WebSocket connection closed, attempting to reconnect...');
            // Clear the current monitoring state
            this.isMonitoring = false;
            // Attempt to reconnect after a delay
            setTimeout(() => {
                this.wsProvider = new ethers_1.ethers.providers.WebSocketProvider(config_1.config.blockchain.bscMainnet.wsUrl);
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
    async getUsdtBalance(address) {
        try {
            const balance = await this.usdtContract.balanceOf(address);
            return balance;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to get USDT balance for ${address}: ${errorMessage}`, { error, address });
            throw error;
        }
    }
    /**
     * Start monitoring addresses for incoming transactions
     * @param addresses Array of addresses to monitor
     */
    async startMonitoringAddresses(addresses) {
        if (this.isMonitoring) {
            // Add new addresses to the monitoring set
            addresses.forEach(address => this.monitoringAddresses.add(address));
            return;
        }
        try {
            // Add addresses to the monitoring set
            addresses.forEach(address => this.monitoringAddresses.add(address));
            // Create a new USDT contract instance with the WebSocket provider
            const usdtContractWs = new ethers_1.ethers.Contract(config_1.config.blockchain.bscMainnet.contracts.usdt, ERC20_ABI, this.wsProvider);
            // Create a filter for Transfer events to any of our monitored addresses
            const filter = usdtContractWs.filters.Transfer(null, null);
            // Listen for Transfer events
            usdtContractWs.on(filter, async (from, to, amount, event) => {
                // Check if the recipient is one of our monitored addresses
                if (this.monitoringAddresses.has(to)) {
                    logger_1.logger.info(`Detected incoming USDT transfer to ${to} from ${from}`, {
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
            logger_1.logger.info(`Started monitoring ${addresses.length} addresses for incoming transactions`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to start monitoring addresses: ${errorMessage}`, { error });
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
    async processIncomingTransaction(from, to, amount, event) {
        try {
            // Get transaction details
            const txHash = event.transactionHash;
            const txReceipt = await this.provider.getTransactionReceipt(txHash);
            const block = await this.provider.getBlock(txReceipt.blockNumber);
            // Convert amount to decimal
            const decimals = await this.usdtContract.decimals();
            const amountDecimal = parseFloat(ethers_1.ethers.utils.formatUnits(amount, decimals));
            // Find the payment address in our database
            await connection_1.DatabaseCircuitBreaker.executeQuery(async () => {
                const connection = await (0, connection_1.getConnection)();
                const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
                const transactionRepository = connection.getRepository(Transaction_1.Transaction);
                const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
                // Find the payment address
                const paymentAddress = await paymentAddressRepository.findOne({
                    where: { address: to }
                });
                if (!paymentAddress) {
                    logger_1.logger.warn(`Received payment to unknown address ${to}`);
                    return;
                }
                // Check if transaction already exists
                const existingTx = await transactionRepository.findOne({
                    where: { txHash }
                });
                if (existingTx) {
                    logger_1.logger.info(`Transaction ${txHash} already processed`);
                    return;
                }
                // Create new transaction record
                const transaction = new Transaction_1.Transaction();
                transaction.txHash = txHash;
                transaction.status = Transaction_1.TransactionStatus.CONFIRMING;
                transaction.type = Transaction_1.TransactionType.PAYMENT;
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
                const auditLog = AuditLog_1.AuditLog.create({
                    action: AuditLog_1.AuditLogAction.PAYMENT_RECEIVED,
                    entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
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
                if (paymentAddress.status === PaymentAddress_1.AddressStatus.ACTIVE) {
                    paymentAddress.markAsUsed();
                    await paymentAddressRepository.save(paymentAddress);
                }
                // Send webhook notification
                if (paymentAddress.merchantId) {
                    await this.webhookService.sendWebhookNotification(paymentAddress.merchantId, Webhook_1.WebhookEvent.PAYMENT_RECEIVED, {
                        id: savedTx.id,
                        txHash,
                        amount: amountDecimal,
                        currency: 'USDT',
                        status: Transaction_1.TransactionStatus.CONFIRMING,
                        paymentAddressId: paymentAddress.id,
                        confirmations: 1,
                        requiredConfirmations: config_1.config.blockchain.bscMainnet.confirmations,
                        timestamp: new Date().toISOString()
                    });
                }
                // Queue confirmation monitoring
                await this.queueService.addToQueue('transaction.monitor', {
                    transactionId: savedTx.id,
                    txHash,
                    blockNumber: txReceipt.blockNumber,
                    confirmations: 1,
                    requiredConfirmations: config_1.config.blockchain.bscMainnet.confirmations
                });
            });
        }
        catch (error) {
            const err = error;
            logger_1.logger.error(`Error processing incoming transaction ${event.transactionHash}: ${err.message}`, {
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
    async monitorTransactionConfirmations(transactionId, txHash, currentConfirmations, requiredConfirmations) {
        try {
            // Get the current block number
            const currentBlock = await this.provider.getBlockNumber();
            // Get transaction receipt
            const txReceipt = await this.provider.getTransactionReceipt(txHash);
            if (!txReceipt) {
                logger_1.logger.warn(`Transaction receipt not found for ${txHash}`);
                return;
            }
            // Calculate confirmations
            const confirmations = currentBlock - txReceipt.blockNumber + 1;
            // Update transaction if confirmations have increased
            if (confirmations > currentConfirmations) {
                await connection_1.DatabaseCircuitBreaker.executeQuery(async () => {
                    const connection = await (0, connection_1.getConnection)();
                    const transactionRepository = connection.getRepository(Transaction_1.Transaction);
                    const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
                    // Get the transaction
                    const transaction = await transactionRepository.findOne({
                        where: { id: transactionId }
                    });
                    if (!transaction) {
                        logger_1.logger.warn(`Transaction ${transactionId} not found`);
                        return;
                    }
                    // Update confirmations
                    transaction.confirmations = confirmations;
                    // Check if fully confirmed
                    if (confirmations >= requiredConfirmations && transaction.status === Transaction_1.TransactionStatus.CONFIRMING) {
                        transaction.status = Transaction_1.TransactionStatus.CONFIRMED;
                        // Create audit log
                        const auditLog = AuditLog_1.AuditLog.create({
                            action: AuditLog_1.AuditLogAction.PAYMENT_CONFIRMED,
                            entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
                            entityId: transaction.id,
                            description: `Transaction confirmed with ${confirmations} confirmations`,
                            merchantId: transaction.merchantId,
                            previousState: { status: Transaction_1.TransactionStatus.CONFIRMING },
                            newState: { status: Transaction_1.TransactionStatus.CONFIRMED, confirmations }
                        });
                        await auditLogRepository.save(auditLog);
                        // Send webhook notification
                        if (transaction.merchantId) {
                            await this.webhookService.sendWebhookNotification(transaction.merchantId, Webhook_1.WebhookEvent.PAYMENT_CONFIRMED, {
                                id: transaction.id,
                                txHash: transaction.txHash,
                                amount: transaction.amount,
                                currency: transaction.currency,
                                status: Transaction_1.TransactionStatus.CONFIRMED,
                                confirmations,
                                timestamp: new Date().toISOString()
                            });
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
            }
            else {
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
        }
        catch (error) {
            const err = error;
            logger_1.logger.error(`Error monitoring transaction confirmations for ${txHash}: ${err.message}`, {
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
    async generatePaymentAddress(merchantId, expectedAmount, metadata) {
        try {
            // Generate a new HD wallet address
            const wallet = ethers_1.ethers.Wallet.createRandom();
            // Create a new payment address record
            const paymentAddress = new PaymentAddress_1.PaymentAddress();
            paymentAddress.address = wallet.address;
            paymentAddress.privateKey = this.encryptPrivateKey(wallet.privateKey); // Encrypt private key
            paymentAddress.hdPath = wallet.mnemonic.path;
            paymentAddress.status = PaymentAddress_1.AddressStatus.ACTIVE;
            paymentAddress.type = PaymentAddress_1.AddressType.MERCHANT_PAYMENT;
            paymentAddress.expectedAmount = expectedAmount || 0; // Provide default value to satisfy TypeScript
            paymentAddress.currency = 'USDT';
            paymentAddress.merchantId = merchantId;
            paymentAddress.metadata = metadata || {};
            // Set expiration time
            const expiresAt = new Date();
            expiresAt.setTime(expiresAt.getTime() + config_1.config.wallet.addressExpirationTime);
            paymentAddress.expiresAt = expiresAt;
            // Save the payment address
            await connection_1.DatabaseCircuitBreaker.executeQuery(async () => {
                const connection = await (0, connection_1.getConnection)();
                const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
                const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
                const savedAddress = await paymentAddressRepository.save(paymentAddress);
                // Create audit log
                const auditLog = AuditLog_1.AuditLog.create({
                    action: AuditLog_1.AuditLogAction.ADDRESS_GENERATED,
                    entityType: AuditLog_1.AuditLogEntityType.PAYMENT_ADDRESS,
                    entityId: savedAddress.id,
                    description: `Generated payment address ${savedAddress.address}`,
                    merchantId
                });
                await auditLogRepository.save(auditLog);
                // Start monitoring the address
                await this.startMonitoringAddresses([savedAddress.address]);
                // Send webhook notification
                await this.webhookService.sendWebhookNotification(merchantId, Webhook_1.WebhookEvent.ADDRESS_CREATED, {
                    id: savedAddress.id,
                    address: savedAddress.address,
                    expectedAmount,
                    currency: 'USDT',
                    expiresAt: savedAddress.expiresAt.toISOString()
                });
            });
            return paymentAddress;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to generate payment address: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Encrypt a private key for storage
     * @param privateKey The private key to encrypt
     */
    encryptPrivateKey(privateKey) {
        // In a real implementation, this would use a proper encryption method
        // such as AES-256 with a secure key management system or HSM
        // For this example, we'll just add a placeholder
        return `encrypted:${privateKey}`;
    }
    /**
     * Decrypt a stored private key
     * @param encryptedKey The encrypted private key
     */
    decryptPrivateKey(encryptedKey) {
        // In a real implementation, this would use a proper decryption method
        // For this example, we'll just remove the placeholder
        return encryptedKey.replace('encrypted:', '');
    }
    /**
     * Execute a blockchain call with retry logic
     * @param fn The function to execute
     */
    async executeWithRetry(fn) {
        const maxRetries = 3;
        let lastError = new Error('Unknown error occurred');
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn(`Blockchain call failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
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
exports.BlockchainService = BlockchainService;
//# sourceMappingURL=blockchainService.js.map