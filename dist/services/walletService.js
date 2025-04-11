"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const ethers_1 = require("ethers");
const crypto_1 = __importDefault(require("crypto"));
const connection_1 = require("../db/connection");
const typeorm_1 = require("typeorm");
const PaymentAddress_1 = require("../db/entities/PaymentAddress");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const AuditLog_1 = require("../db/entities/AuditLog");
/**
 * Service for managing crypto wallets and addresses
 */
class WalletService {
    constructor() {
        this.addressIndex = 0;
        // Initialize encryption key from environment
        this.encryptionKey = Buffer.from(config_1.config.security.webhookSignatureSecret, 'utf8');
        // Load or create HD wallet
        this.initializeHDWallet();
    }
    /**
     * Initialize HD wallet from mnemonic or create a new one
     */
    initializeHDWallet() {
        try {
            // In a production environment, the mnemonic would be securely stored
            // and loaded from a secure location, not hardcoded or in environment variables
            let mnemonic = process.env.HD_WALLET_MNEMONIC;
            if (!mnemonic) {
                // Generate a new mnemonic if one doesn't exist
                // In production, this would be a one-time setup process with proper key ceremony
                mnemonic = ethers_1.ethers.utils.entropyToMnemonic(ethers_1.ethers.utils.randomBytes(16));
                logger_1.logger.info('Generated new HD wallet mnemonic');
                // In production, you would save this securely and not log it
                logger_1.logger.warn('New mnemonic generated. This should be securely stored.');
            }
            // Create HD node from mnemonic
            this.hdNode = ethers_1.ethers.utils.HDNode.fromMnemonic(mnemonic);
            logger_1.logger.info('HD wallet initialized successfully');
            // Load the last used address index from database
            this.loadAddressIndex();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to initialize HD wallet: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Load the last used address index from database
     */
    async loadAddressIndex() {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Find the payment address with the highest HD path index
            const lastAddress = await paymentAddressRepository.findOne({
                where: {
                    hdPath: (0, typeorm_1.Like)(`${config_1.config.wallet.hdPath}%`)
                },
                order: {
                    hdPath: 'DESC'
                }
            });
            if (lastAddress && lastAddress.hdPath) {
                // Extract index from HD path
                const match = lastAddress.hdPath.match(/\/([0-9]+)$/);
                if (match && match[1]) {
                    this.addressIndex = parseInt(match[1], 10) + 1;
                    logger_1.logger.info(`Loaded address index: ${this.addressIndex}`);
                }
            }
            else {
                this.addressIndex = 0;
                logger_1.logger.info('Starting with address index 0');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error loading address index: ${errorMessage}`, { error });
            // Default to 0 if there's an error
            this.addressIndex = 0;
        }
    }
    /**
     * Generate a new payment address for a merchant
     * @param merchantId The merchant ID
     * @param expectedAmount The expected payment amount
     * @param metadata Additional metadata
     */
    async generatePaymentAddress(merchantId, expectedAmount, metadata) {
        try {
            // Generate a new address from the HD wallet
            const hdPath = `${config_1.config.wallet.hdPath}/${this.addressIndex}`;
            const addressNode = this.hdNode.derivePath(hdPath);
            const wallet = new ethers_1.ethers.Wallet(addressNode.privateKey);
            // Encrypt the private key for storage
            const encryptedPrivateKey = this.encryptPrivateKey(addressNode.privateKey);
            // Create a new payment address record
            const paymentAddress = new PaymentAddress_1.PaymentAddress();
            paymentAddress.address = wallet.address;
            paymentAddress.privateKey = encryptedPrivateKey;
            paymentAddress.hdPath = hdPath;
            paymentAddress.status = PaymentAddress_1.AddressStatus.ACTIVE;
            paymentAddress.type = PaymentAddress_1.AddressType.MERCHANT_PAYMENT;
            paymentAddress.merchantId = merchantId;
            paymentAddress.currency = 'USDT';
            paymentAddress.isMonitored = true;
            // Set expected amount if provided
            if (expectedAmount) {
                paymentAddress.expectedAmount = expectedAmount;
            }
            // Set metadata if provided
            if (metadata) {
                paymentAddress.metadata = metadata;
            }
            // Set expiration time
            const expiresAt = new Date();
            expiresAt.setTime(expiresAt.getTime() + config_1.config.wallet.addressExpirationTime);
            paymentAddress.expiresAt = expiresAt;
            // Save the payment address
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            const savedAddress = await paymentAddressRepository.save(paymentAddress);
            // Create audit log
            const auditLog = AuditLog_1.AuditLog.create({
                action: AuditLog_1.AuditLogAction.ADDRESS_GENERATED,
                entityType: AuditLog_1.AuditLogEntityType.PAYMENT_ADDRESS,
                entityId: savedAddress.id,
                description: `Payment address ${savedAddress.address} created for merchant ${merchantId}`,
                merchantId: merchantId
            });
            await auditLogRepository.save(auditLog);
            // Increment address index for next time
            this.addressIndex++;
            logger_1.logger.info(`Generated new payment address ${wallet.address} for merchant ${merchantId}`, {
                merchantId,
                addressIndex: this.addressIndex - 1,
                hdPath
            });
            return savedAddress;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error generating payment address: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Generate a new hot wallet address
     */
    async generateHotWalletAddress() {
        try {
            // Generate a new address from the HD wallet
            const hdPath = `${config_1.config.wallet.hdPath}/hot/${this.addressIndex}`;
            const addressNode = this.hdNode.derivePath(hdPath);
            const wallet = new ethers_1.ethers.Wallet(addressNode.privateKey);
            // Encrypt the private key for storage
            const encryptedPrivateKey = this.encryptPrivateKey(addressNode.privateKey);
            // Create a new payment address record
            const hotWalletAddress = new PaymentAddress_1.PaymentAddress();
            hotWalletAddress.address = wallet.address;
            hotWalletAddress.privateKey = encryptedPrivateKey;
            hotWalletAddress.hdPath = hdPath;
            hotWalletAddress.status = PaymentAddress_1.AddressStatus.ACTIVE;
            hotWalletAddress.type = PaymentAddress_1.AddressType.HOT_WALLET;
            hotWalletAddress.currency = 'USDT';
            hotWalletAddress.isMonitored = true;
            // Save the hot wallet address
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
            const savedAddress = await paymentAddressRepository.save(hotWalletAddress);
            // Create audit log
            const auditLog = AuditLog_1.AuditLog.create({
                action: AuditLog_1.AuditLogAction.ADDRESS_GENERATED,
                entityType: AuditLog_1.AuditLogEntityType.PAYMENT_ADDRESS,
                entityId: savedAddress.id,
                description: `Hot wallet address ${savedAddress.address} created`,
                merchantId: undefined
            });
            await auditLogRepository.save(auditLog);
            // Increment address index for next time
            this.addressIndex++;
            logger_1.logger.info(`Generated new hot wallet address ${wallet.address}`, {
                addressIndex: this.addressIndex - 1,
                hdPath
            });
            return savedAddress;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error generating hot wallet address: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Encrypt a private key for storage
     * @param privateKey The private key to encrypt
     */
    encryptPrivateKey(privateKey) {
        try {
            // Generate a random IV
            const iv = crypto_1.default.randomBytes(16);
            // Create cipher
            const cipher = crypto_1.default.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
            // Encrypt the private key
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            // Return IV + encrypted data
            return iv.toString('hex') + ':' + encrypted;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error encrypting private key: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Decrypt a stored private key
     * @param encryptedPrivateKey The encrypted private key
     */
    decryptPrivateKey(encryptedPrivateKey) {
        try {
            // Split IV and encrypted data
            const parts = encryptedPrivateKey.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted private key format');
            }
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            // Create decipher
            const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
            // Decrypt the private key
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error decrypting private key: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Get a wallet instance for a payment address
     * @param addressId The payment address ID
     */
    async getWalletForAddress(addressId) {
        try {
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            // Find the payment address
            const paymentAddress = await paymentAddressRepository.findOne({
                where: { id: addressId }
            });
            if (!paymentAddress) {
                throw new Error(`Payment address not found: ${addressId}`);
            }
            if (!paymentAddress.privateKey) {
                throw new Error(`Private key not available for address: ${paymentAddress.address}`);
            }
            // Decrypt the private key
            const privateKey = this.decryptPrivateKey(paymentAddress.privateKey);
            // Create a wallet instance
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(config_1.config.blockchain.bscMainnet.rpcUrl);
            const wallet = new ethers_1.ethers.Wallet(privateKey, provider);
            return wallet;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error getting wallet for address: ${errorMessage}`, { error, addressId });
            throw error;
        }
    }
    /**
     * Create a hot wallet for a merchant
     * @param merchantId The merchant ID
     */
    async createHotWallet(merchantId) {
        try {
            // Generate a new hot wallet address
            const hotWallet = await this.generateHotWalletAddress();
            // Update the merchant ID
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            hotWallet.merchantId = merchantId;
            await paymentAddressRepository.save(hotWallet);
            logger_1.logger.info(`Created hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
            return hotWallet;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error creating hot wallet for merchant: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Check if funds need to be moved from hot wallet to cold storage
     */
    async checkHotWalletBalance() {
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
            // Initialize blockchain provider
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(config_1.config.blockchain.bscMainnet.rpcUrl);
            // Initialize USDT contract
            const usdtContract = new ethers_1.ethers.Contract(config_1.config.blockchain.bscMainnet.contracts.usdt, [
                'function balanceOf(address owner) view returns (uint256)',
                'function decimals() view returns (uint8)'
            ], provider);
            // Get USDT decimals
            const decimals = await usdtContract.decimals();
            // Check balance of each hot wallet
            for (const hotWallet of hotWallets) {
                // Get USDT balance
                const balance = await usdtContract.balanceOf(hotWallet.address);
                const balanceDecimal = parseFloat(ethers_1.ethers.utils.formatUnits(balance, decimals));
                // Get threshold for moving to cold storage
                const threshold = parseFloat(config_1.config.wallet.hotWalletThreshold);
                logger_1.logger.info(`Hot wallet ${hotWallet.address} balance: ${balanceDecimal} USDT`, {
                    address: hotWallet.address,
                    balance: balanceDecimal
                });
                // If balance exceeds threshold, schedule transfer to cold storage
                if (balanceDecimal > threshold) {
                    logger_1.logger.info(`Hot wallet balance exceeds threshold (${threshold} USDT), scheduling transfer to cold storage`, {
                        address: hotWallet.address,
                        balance: balanceDecimal,
                        threshold
                    });
                    // In a real implementation, this would queue a job to transfer funds
                    // to cold storage after proper approval and potentially manual review
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error checking hot wallet balance: ${errorMessage}`, { error });
        }
    }
}
exports.WalletService = WalletService;
//# sourceMappingURL=walletService.js.map