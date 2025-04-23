import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getConnection } from '../db/connection';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';
import { Transaction, TransactionStatus, TransactionType } from '../db/entities/Transaction';

// Add the PROCESSING status since it's used but not defined in the entity
// We'll extend the enum for our internal use
enum ExtendedTransactionStatus {
  PROCESSING = 'processing',
  PENDING = TransactionStatus.PENDING,
  FAILED = TransactionStatus.FAILED
}

/**
 * Interface for payout parameters
 */
interface PayoutParams {
  merchantId: string;
  amount: number;
  currency: string;
  network: string;
  recipientAddress: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Service for interacting with Binance exchange API
 */
export class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor() {
    // Load credentials from environment variables
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.apiSecret = process.env.BINANCE_API_SECRET || '';
    this.baseUrl = process.env.BINANCE_API_URL || 'https://api.binance.com';

    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Binance API credentials not configured properly');
    }
  }

  /**
   * Generate signature for Binance API
   * @param queryString Query string to sign
   * @returns HMAC SHA256 signature
   */
  private generateSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make a signed request to Binance API
   * @param endpoint API endpoint
   * @param method HTTP method
   * @param params Request parameters
   * @param retry Current retry attempt
   * @param maxRetries Maximum number of retries
   * @returns API response
   */
  private async makeSignedRequest(
    endpoint: string, 
    method: string = 'GET', 
    params: any = {},
    retry: number = 0,
    maxRetries: number = 3
  ): Promise<any> {
    try {
      // Add timestamp to params
      params.timestamp = Date.now();
      
      // Convert params to query string
      const queryString = Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');
      
      // Generate signature
      const signature = this.generateSignature(queryString);
      
      // Add signature to query string
      const fullQueryString = `${queryString}&signature=${signature}`;
      
      // Determine URL
      const url = `${this.baseUrl}${endpoint}${method === 'GET' ? '?' + fullQueryString : ''}`;
      
      logger.debug(`Making Binance API request to ${endpoint}`, { method, retry });
      
      // Make request with timeout
      const response = await axios({
        method,
        url,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: method !== 'GET' ? fullQueryString : undefined,
        timeout: 15000 // 15 second timeout
      });
      
      return response.data;
    } catch (error: any) {
      // Classify error for better handling
      const isNetworkError = !error.response && error.request;
      const isRateLimitError = error.response?.status === 429;
      const isServerError = error.response?.status >= 500;
      const isAuthError = error.response?.status === 401;
      const errorCode = error.response?.data?.code;
      
      // Format error message with code if available
      const errorMsg = error.response?.data?.msg || error.message || 'Unknown error';
      const errorMessage = errorCode ? `[${errorCode}] ${errorMsg}` : errorMsg;
      
      // Enhanced error context for logging
      const errorContext = {
        endpoint,
        method,
        statusCode: error.response?.status,
        errorCode: error.response?.data?.code,
        errorMessage,
        retry,
        params: { ...params, signature: '***REDACTED***' } // Redact sensitive info
      };
      
      // Determine if we should retry the request
      const shouldRetry = 
        retry < maxRetries && 
        (isNetworkError || isRateLimitError || isServerError);
      
      if (shouldRetry) {
        // Calculate backoff delay with exponential backoff and jitter
        const baseDelay = 1000; // 1 second
        const maxDelay = 30000; // 30 seconds
        const exponentialDelay = Math.min(
          maxDelay,
          baseDelay * Math.pow(2, retry) * (0.8 + Math.random() * 0.4) // Add 20% jitter
        );
        
        logger.warn(`Binance API request failed, retrying in ${exponentialDelay}ms`, errorContext);
        
        // Wait for backoff delay
        await new Promise(resolve => setTimeout(resolve, exponentialDelay));
        
        // Retry the request
        return this.makeSignedRequest(endpoint, method, params, retry + 1, maxRetries);
      } else {
        // No more retries, log error and create audit log
        if (isAuthError) {
          logger.error(`Binance API authentication error - check API keys`, errorContext);
        } else {
          logger.error(`Binance API error after ${retry} retries`, errorContext);
        }
        
        // Create audit log for API errors
        await this.createApiErrorLog(endpoint, errorMessage);
        
        // Throw a more informative error
        if (isAuthError) {
          throw new Error(`Binance API authentication failed - check API keys`);
        } else if (isRateLimitError) {
          throw new Error(`Binance API rate limit exceeded - please try again later`);
        } else {
          throw new Error(`Binance API error: ${errorMessage}`);
        }
      }
    }
  }

  /**
   * Get wallet balance for a specific asset
   * @param asset Asset symbol (e.g., 'USDT')
   * @returns Balance information
   */
  async getAssetBalance(asset: string): Promise<{
    free: string;
    locked: string;
    total: string;
  }> {
    try {
      const balances = await this.makeSignedRequest('/api/v3/account');
      
      // Find the specific asset
      const assetBalance = balances.balances.find((b: any) => b.asset === asset);
      
      if (!assetBalance) {
        return { free: '0', locked: '0', total: '0' };
      }
      
      return {
        free: assetBalance.free,
        locked: assetBalance.locked,
        total: (parseFloat(assetBalance.free) + parseFloat(assetBalance.locked)).toString()
      };
    } catch (error) {
      logger.error(`Failed to get ${asset} balance`, { error });
      throw error;
    }
  }

  /**
   * Withdraw funds from Binance to an external address
   * @param asset Asset to withdraw (e.g., 'USDT')
   * @param network Network to use (e.g., 'BSC')
   * @param address Destination address
   * @param amount Amount to withdraw
   * @param transactionId Related transaction ID in our system
   * @returns Withdrawal information
   */
  async withdrawFunds(
    asset: string,
    network: string,
    address: string,
    amount: number,
    transactionId: string
  ): Promise<{
    id: string;
    amount: string;
    transactionFee: string;
    status: string;
  }> {
    try {
      // Validate input parameters
      if (!asset || !network || !address) {
        throw new Error('Missing required parameters: asset, network, and address are required');
      }
      
      // Validate amount
      if (amount <= 0) {
        throw new Error('Withdrawal amount must be greater than 0');
      }
      
      // Check balance before attempting withdrawal
      const balance = await this.getAssetBalance(asset);
      if (parseFloat(balance.free) < amount) {
        throw new Error(`Insufficient balance. Required: ${amount}, Available: ${balance.free}`);
      }
      
      // Validate address format based on network
      const isValidAddress = this.validateAddressFormat(address, network);
      if (!isValidAddress) {
        throw new Error(`Invalid address format for ${network} network`);
      }
      
      // Convert amount to string with proper precision
      const amountStr = amount.toString();
      
      // Set up withdrawal parameters
      const params = {
        coin: asset,
        address: address,
        amount: amountStr,
        network: network,
        name: `Withdrawal to ${address}`,
        walletType: 0, // Spot wallet
      };
      
      logger.info(`Initiating withdrawal request`, {
        transactionId,
        asset,
        network,
        amount: amountStr,
        addressPartial: address.substring(0, 8) + '...' + address.substring(address.length - 6) // Partial address for logging
      });
      
      // Execute withdrawal
      const response = await this.makeSignedRequest('/sapi/v1/capital/withdraw/apply', 'POST', params);
      
      // Log successful withdrawal request
      logger.info(`Withdrawal request successful: ${response.id}`, {
        transactionId,
        withdrawalId: response.id,
        asset,
        amount: amountStr,
        addressPartial: address.substring(0, 8) + '...' + address.substring(address.length - 6) // Partial address for logging
      });
      
      // Create audit log
      await this.createWithdrawalAuditLog(transactionId, response.id, asset, amount, address);
      
      return {
        id: response.id,
        amount: amountStr,
        transactionFee: response.transactionFee || '0',
        status: 'PROCESSING'
      };
    } catch (error: any) {
      // Format error message
      const errorMessage = error.message || 'Unknown error during withdrawal';
      
      // Enhanced error logging
      logger.error(`Withdrawal failed: ${errorMessage}`, { 
        error, 
        asset, 
        network, 
        addressPartial: address ? (address.substring(0, 8) + '...' + address.substring(address.length - 6)) : 'N/A',
        amount, 
        transactionId 
      });
      
      // Create audit log for failed withdrawal
      try {
        const connection = await getConnection();
        const auditLogRepository = connection.getRepository(AuditLog);
        await auditLogRepository.save({
          entityType: AuditLogEntityType.TRANSACTION,
          entityId: transactionId,
          action: AuditLogAction.WITHDRAWAL_FAILED,
          data: {
            asset,
            network,
            amount,
            error: errorMessage
          },
          timestamp: new Date()
        });
      } catch (logError) {
        logger.error(`Failed to create audit log for failed withdrawal`, { logError, transactionId });
      }
      
      // Attempt to update transaction to failed state
      try {
        const connection = await getConnection();
        const transactionRepository = connection.getRepository(Transaction);
        const transaction = await transactionRepository.findOne({
          where: { id: transactionId }
        });
        
        if (transaction && transaction.status !== TransactionStatus.FAILED) {
          transaction.status = TransactionStatus.FAILED;
          transaction.metadata = {
            ...transaction.metadata,
            failureReason: errorMessage
          };
          await transactionRepository.save(transaction);
          logger.info(`Updated transaction ${transactionId} to FAILED status`);
        }
      } catch (txError) {
        logger.error(`Failed to update transaction to FAILED state`, { txError, transactionId });
      }
      
      throw error; // Rethrow the error to be handled by the caller
    }
  }

  /**
   * Validate address format based on network
   * @param address Address to validate
   * @param network Network for the address
   * @returns Whether the address is valid
   */
  private validateAddressFormat(address: string, network: string): boolean {
    // Basic validation based on network
    switch (network.toUpperCase()) {
      case 'BSC':
      case 'ETH':
        // Ethereum/BSC address format - 0x followed by 40 hex chars
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'BTC':
        // Basic BTC address check - starts with 1, 3, or bc1
        return /^(1|3|bc1)[a-zA-Z0-9]{25,42}$/.test(address);
      case 'TRX':
        // Tron address format - starts with T and is 34 chars
        return /^T[a-zA-Z0-9]{33}$/.test(address);
      default:
        // For other networks, just check that address is not empty
        return !!address && address.length > 10;
    }
  }

  /**
   * Get withdrawal history
   * @param asset Optional asset to filter by
   * @param status Optional status to filter by
   * @param startTime Optional start time
   * @param endTime Optional end time
   * @returns Withdrawal history
   */
  async getWithdrawalHistory(
    asset?: string,
    status?: string,
    startTime?: number,
    endTime?: number
  ): Promise<any[]> {
    try {
      const params: any = {};
      
      if (asset) params.coin = asset;
      if (status) params.status = status;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      
      const response = await this.makeSignedRequest('/sapi/v1/capital/withdraw/history', 'GET', params);
      
      return response;
    } catch (error) {
      logger.error(`Failed to get withdrawal history`, { error, asset, status, startTime, endTime });
      throw error;
    }
  }

  /**
   * Get deposit address for a specific asset and network
   * @param asset Asset symbol (e.g., 'USDT')
   * @param network Network to use (e.g., 'BSC')
   * @returns Deposit address information
   */
  async getDepositAddress(asset: string, network: string): Promise<{
    address: string;
    tag?: string;
    url: string;
  }> {
    try {
      const params = {
        coin: asset,
        network: network
      };
      
      const response = await this.makeSignedRequest('/sapi/v1/capital/deposit/address', 'GET', params);
      
      return {
        address: response.address,
        tag: response.tag,
        url: response.url
      };
    } catch (error) {
      logger.error(`Failed to get deposit address`, { error, asset, network });
      throw error;
    }
  }

  /**
   * Process a withdrawal transaction
   * @param transaction The transaction to process
   * @returns Result of the withdrawal operation
   */
  async processWithdrawal(transaction: Transaction): Promise<{
    id: string;
    amount: string;
    transactionFee: string;
    status: string;
  }> {
    try {
      if (!transaction || !transaction.id) {
        throw new Error('Invalid transaction provided');
      }

      if (transaction.type !== TransactionType.PAYOUT) {
        throw new Error(`Transaction ${transaction.id} is not a payout transaction`);
      }

      logger.info(`Processing withdrawal for transaction ${transaction.id}`);

      if (!transaction.amount || !transaction.currency || !transaction.recipientAddress || !transaction.network) {
        throw new Error(`Missing required withdrawal parameters for transaction ${transaction.id}`);
      }

      // Update transaction status to processing
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      transaction.status = ExtendedTransactionStatus.PROCESSING as unknown as TransactionStatus;
      await transactionRepository.save(transaction);
      
      // Execute the withdrawal
      const result = await this.withdrawFunds(
        transaction.currency,
        transaction.network,
        transaction.recipientAddress,
        Number(transaction.amount),
        transaction.id
      );
      
      // Update transaction with withdrawal ID and status
      transaction.externalId = result.id;
      transaction.status = TransactionStatus.PENDING;
      transaction.metadata = {
        ...transaction.metadata,
        withdrawalId: result.id,
        transactionFee: result.transactionFee
      };
      
      await transactionRepository.save(transaction);
      
      logger.info(`Withdrawal processed successfully for transaction ${transaction.id}`);
      
      return result;
    } catch (error) {
      logger.error(`Failed to process withdrawal for transaction ${transaction?.id}`, { error });
      
      // Update transaction to failed state if possible
      try {
        if (transaction && transaction.id) {
          const connection = await getConnection();
          const transactionRepository = connection.getRepository(Transaction);
          
          transaction.status = TransactionStatus.FAILED;
          transaction.metadata = {
            ...transaction.metadata,
            failureReason: error instanceof Error ? error.message : 'Unknown error'
          };
          
          await transactionRepository.save(transaction);
        }
      } catch (updateError) {
        logger.error(`Failed to update transaction status after withdrawal failure`, { 
          updateError, 
          transactionId: transaction?.id 
        });
      }
      
      throw error;
    }
  }

  /**
   * Create an audit log for a withdrawal
   * @param transactionId The transaction ID
   * @param withdrawalId The withdrawal ID from Binance
   * @param asset The asset being withdrawn
   * @param amount The amount being withdrawn
   * @param address The destination address
   */
  private async createWithdrawalAuditLog(
    transactionId: string,
    withdrawalId: string,
    asset: string,
    amount: number,
    address: string
  ): Promise<void> {
    try {
      const connection = await getConnection();
      const auditLogRepository = connection.getRepository(AuditLog);
      const transactionRepository = connection.getRepository(Transaction);
      
      // Get the transaction to retrieve merchant ID
      const transaction = await transactionRepository.findOne({
        where: { id: transactionId }
      });
      
      if (!transaction) {
        logger.warn(`Transaction not found for audit log: ${transactionId}`);
        return;
      }
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.BINANCE_WITHDRAWAL,
        entityType: AuditLogEntityType.TRANSACTION,
        entityId: transactionId,
        description: `Binance withdrawal: ${amount} ${asset} to ${address} (Binance ID: ${withdrawalId})`,
        merchantId: transaction.merchantId,
        newState: {
          binanceWithdrawalId: withdrawalId,
          asset,
          amount: amount.toString(),
          address
        }
      });
      
      await auditLogRepository.save(auditLog);
    } catch (error) {
      logger.error(`Failed to create withdrawal audit log`, { error });
    }
  }

  /**
   * Create an audit log for API error
   * @param endpoint API endpoint
   * @param errorMessage Error message
   */
  private async createApiErrorLog(endpoint: string, errorMessage: string): Promise<void> {
    try {
      const connection = await getConnection();
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.SYSTEM_ERROR,
        entityType: AuditLogEntityType.SYSTEM,
        entityId: '0',
        description: `Binance API error: ${endpoint} - ${errorMessage}`,
        merchantId: undefined,
        newState: {
          endpoint,
          error: errorMessage
        }
      });
      
      await auditLogRepository.save(auditLog);
    } catch (error) {
      logger.error(`Failed to create API error audit log`, { error });
    }
  }

  /**
   * Create a new payout transaction and process it
   * @param params Payout parameters
   * @returns Created transaction
   */
  async createPayout(params: PayoutParams): Promise<Transaction> {
    try {
      const { merchantId, amount, currency, network, recipientAddress, webhookUrl, metadata } = params;
      
      logger.info(`Creating payout transaction`, {
        merchantId,
        amount,
        currency,
        network,
        addressPartial: recipientAddress.substring(0, 8) + '...' + recipientAddress.substring(recipientAddress.length - 6)
      });
      
      // Create transaction record
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      
      const transaction = new Transaction();
      transaction.merchantId = merchantId;
      transaction.type = TransactionType.PAYOUT;
      transaction.status = TransactionStatus.PENDING;
      transaction.currency = currency;
      transaction.amount = amount;
      transaction.recipientAddress = recipientAddress;
      transaction.network = network;
      transaction.metadata = {
        ...(metadata || {}),
        webhookUrl
      };
      
      // Save transaction first to get an ID
      const savedTransaction = await transactionRepository.save(transaction);
      
      // Process the withdrawal
      await this.processWithdrawal(savedTransaction);
      
      return savedTransaction;
    } catch (error) {
      logger.error('Failed to create payout', { error, params });
      throw error;
    }
  }
} 