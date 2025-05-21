import { ethers } from 'ethers';
import crypto from 'crypto';
import { getConnection, DatabaseCircuitBreaker } from '../db/connection';
import { Like } from 'typeorm';
import { PaymentAddress, AddressStatus, AddressType } from '../db/entities/PaymentAddress';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';

/**
 * Service for managing crypto wallets and addresses
 */
export class WalletService {
  private hdNode: ethers.utils.HDNode;
  private addressIndex: number = 0;
  private encryptionKey: Buffer;
  private static instance: WalletService | null = null;
  private initialized = false;
  
  private constructor() {
    // Initialize encryption key from environment
    this.encryptionKey = Buffer.from(config.security.webhookSignatureSecret, 'utf8');
  }
  
  /**
   * Singleton getInstance that ensures proper async initialization
   */
  public static async getInstance(): Promise<WalletService> {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
      await WalletService.instance.initializeHDWallet();
    } else if (!WalletService.instance.initialized) {
      // If instance exists but not yet initialized, wait for initialization
      await WalletService.instance.initializeHDWallet();
    }
    return WalletService.instance;
  }
  
  /**
   * Initialize HD wallet from mnemonic or create a new one
   */
  private async initializeHDWallet(): Promise<void> {
    try {
      // In a production environment, the mnemonic would be securely stored
      // and loaded from a secure location, not hardcoded or in environment variables
      let mnemonic = process.env.HD_WALLET_MNEMONIC;
      
      if (!mnemonic) {
        // Generate a new mnemonic if one doesn't exist
        // In production, this would be a one-time setup process with proper key ceremony
        mnemonic = ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(16));
        logger.info('Generated new HD wallet mnemonic');
        
        // In production, you would save this securely and not log it
        logger.warn('New mnemonic generated. This should be securely stored.');
      }
      
      // Create HD node from mnemonic
      this.hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
      logger.info('HD wallet initialized successfully');
      
      // Load the last used address index from database
      this.loadAddressIndex();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize HD wallet: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Load the last used address index from database
   */
  // Mutex to prevent multiple address generation calls from using the same index
  private addressGenerationLock = false;
  private lockTimeout: NodeJS.Timeout | null = null;
  
  private async loadAddressIndex(): Promise<void> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      // Find the payment address with the highest HD path index
      const lastAddress = await paymentAddressRepository.findOne({
        where: {
          hdPath: Like(`${config.wallet.hdPath}%`)
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
          logger.info(`Loaded address index: ${this.addressIndex}`);
        }
      } else {
        this.addressIndex = 0;
        logger.info('Starting with address index 0');
      }
      
      // Mark initialization as complete
      this.initialized = true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error loading address index: ${errorMessage}`, { error });
      // Default to 0 if there's an error
      this.addressIndex = 0;
      // Even with an error, we've tried initialization
      this.initialized = true;
    }
  }
  
  /**
   * Generate a new payment address for a merchant
   * @param merchantId The merchant ID
   * @param expectedAmount The expected payment amount
   * @param metadata Additional metadata
   */
  /**
   * Wait for lock to release with a timeout
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns A promise that resolves when the lock is released or rejects on timeout
   */
  private async waitForLock(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkLock = () => {
        if (!this.addressGenerationLock) {
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Timeout waiting for address generation lock'));
        } else {
          setTimeout(checkLock, 100);
        }
      };
      checkLock();
    });
  }
  
  /**
   * Set the lock with auto-release after timeout
   */
  private setLock(timeoutMs = 30000): void {
    this.addressGenerationLock = true;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
    this.lockTimeout = setTimeout(() => {
      this.addressGenerationLock = false;
      this.lockTimeout = null;
    }, timeoutMs);
  }

  /**
   * Release the lock
   */
  private releaseLock(): void {
    this.addressGenerationLock = false;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
  }

  async generatePaymentAddress(
    merchantId: string,
    expectedAmount?: number,
    metadata?: any
  ): Promise<PaymentAddress> {
    try {
      // Wait for any other address generation to complete
      await this.waitForLock();
      // Set lock to prevent concurrent address generation
      this.setLock();
      
      // Double-check the latest address index from DB to handle multi-instance scenarios
      await this.loadAddressIndex();
      
      // Generate a new address from the HD wallet
      const hdPath = `${config.wallet.hdPath}/${this.addressIndex}`;
      const addressNode = this.hdNode.derivePath(hdPath);
      const wallet = new ethers.Wallet(addressNode.privateKey);
      
      // Encrypt the private key for storage
      const encryptedPrivateKey = this.encryptPrivateKey(addressNode.privateKey);
      
      // Create a new payment address record
      const paymentAddress = new PaymentAddress();
      paymentAddress.address = wallet.address;
      paymentAddress.privateKey = encryptedPrivateKey;
      paymentAddress.hdPath = hdPath;
      paymentAddress.status = AddressStatus.ACTIVE;
      paymentAddress.type = AddressType.MERCHANT_PAYMENT;
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
      expiresAt.setTime(expiresAt.getTime() + config.wallet.addressExpirationTime);
      paymentAddress.expiresAt = expiresAt;
      
      // Save the payment address
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const savedAddress = await paymentAddressRepository.save(paymentAddress);
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.ADDRESS_GENERATED,
        entityType: AuditLogEntityType.PAYMENT_ADDRESS,
        entityId: savedAddress.id,
        description: `Payment address ${savedAddress.address} created for merchant ${merchantId}`,
        merchantId: merchantId
      });
      
      await auditLogRepository.save(auditLog);
      
      // Increment address index for next time
      this.addressIndex++;
      
      logger.info(`Generated new payment address ${wallet.address} for merchant ${merchantId}`, {
        merchantId,
        addressIndex: this.addressIndex - 1,
        hdPath
      });
      
      // Release the lock once we're done
      this.releaseLock();
      
      return savedAddress;
    } catch (error: unknown) {
      // Make sure to release the lock even if there's an error
      this.releaseLock();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error generating payment address: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Generate a new hot wallet address
   */
  async generateHotWalletAddress(): Promise<PaymentAddress> {
    try {
      // Generate a new address from the HD wallet
      const hdPath = `${config.wallet.hdPath}/hot/${this.addressIndex}`;
      const addressNode = this.hdNode.derivePath(hdPath);
      const wallet = new ethers.Wallet(addressNode.privateKey);
      
      // Encrypt the private key for storage
      const encryptedPrivateKey = this.encryptPrivateKey(addressNode.privateKey);
      
      // Create a new payment address record
      const hotWalletAddress = new PaymentAddress();
      hotWalletAddress.address = wallet.address;
      hotWalletAddress.privateKey = encryptedPrivateKey;
      hotWalletAddress.hdPath = hdPath;
      hotWalletAddress.status = AddressStatus.ACTIVE;
      hotWalletAddress.type = AddressType.HOT_WALLET;
      hotWalletAddress.currency = 'USDT';
      hotWalletAddress.isMonitored = true;
      
      // Save the hot wallet address
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      const savedAddress = await paymentAddressRepository.save(hotWalletAddress);
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.ADDRESS_GENERATED,
        entityType: AuditLogEntityType.PAYMENT_ADDRESS,
        entityId: savedAddress.id,
        description: `Hot wallet address ${savedAddress.address} created`,
        merchantId: undefined
      });
      
      await auditLogRepository.save(auditLog);
      
      // Increment address index for next time
      this.addressIndex++;
      
      logger.info(`Generated new hot wallet address ${wallet.address}`, {
        addressIndex: this.addressIndex - 1,
        hdPath
      });
      
      return savedAddress;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error generating hot wallet address: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Encrypt a private key for storage
   * @param privateKey The private key to encrypt
   */
  private encryptPrivateKey(privateKey: string): string {
    try {
      // Generate a random IV
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
      
      // Encrypt the private key
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return IV + encrypted data
      return iv.toString('hex') + ':' + encrypted;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error encrypting private key: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Decrypt a stored private key
   * @param encryptedPrivateKey The encrypted private key
   */
  private decryptPrivateKey(encryptedPrivateKey: string): string {
    try {
      // Split IV and encrypted data
      const parts = encryptedPrivateKey.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted private key format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);
      
      // Decrypt the private key
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error decrypting private key: ${errorMessage}`, { error });
      throw error;
    }
  }
  
  /**
   * Get a wallet instance for a payment address
   * @param addressId The payment address ID
   */
  async getWalletForAddress(addressId: string): Promise<ethers.Wallet> {
    try {
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
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
      const provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      return wallet;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting wallet for address: ${errorMessage}`, { error, addressId });
      throw error;
    }
  }
  
  /**
   * Create a hot wallet for a merchant
   * @param merchantId The merchant ID
   */
  async createHotWallet(merchantId: string): Promise<PaymentAddress> {
    try {
      // Generate a new hot wallet address
      const hotWallet = await this.generateHotWalletAddress();
      
      // Update the merchant ID
      const connection = await getConnection();
      const paymentAddressRepository = connection.getRepository(PaymentAddress);
      
      hotWallet.merchantId = merchantId;
      await paymentAddressRepository.save(hotWallet);
      
      logger.info(`Created hot wallet for merchant ${merchantId}: ${hotWallet.address}`);
      
      return hotWallet;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error creating hot wallet for merchant: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  /**
   * Check if funds need to be moved from hot wallet to cold storage
   */
  async checkHotWalletBalance(): Promise<void> {
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
      
      // Initialize blockchain provider
      const provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
      
      // Initialize USDT contract
      const usdtContract = new ethers.Contract(
        config.blockchain.bscMainnet.contracts.usdt,
        [
          'function balanceOf(address owner) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ],
        provider
      );
      
      // Get USDT decimals
      const decimals = await usdtContract.decimals();
      
      // Check balance of each hot wallet
      for (const hotWallet of hotWallets) {
        // Get USDT balance
        const balance = await usdtContract.balanceOf(hotWallet.address);
        const balanceDecimal = parseFloat(ethers.utils.formatUnits(balance, decimals));
        
        // Get threshold for moving to cold storage
        const threshold = parseFloat(config.wallet.hotWalletThreshold);
        
        logger.info(`Hot wallet ${hotWallet.address} balance: ${balanceDecimal} USDT`, {
          address: hotWallet.address,
          balance: balanceDecimal
        });
        
        // If balance exceeds threshold, schedule transfer to cold storage
        if (balanceDecimal > threshold) {
          logger.info(`Hot wallet balance exceeds threshold (${threshold} USDT), scheduling transfer to cold storage`, {
            address: hotWallet.address,
            balance: balanceDecimal,
            threshold
          });
          
          // In a real implementation, this would queue a job to transfer funds
          // to cold storage after proper approval and potentially manual review
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error checking hot wallet balance: ${errorMessage}`, { error });
    }
  }
}