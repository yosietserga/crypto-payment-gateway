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
  private reconnectAttempts: number = 0;
  private addressBalances: Map<string, ethers.BigNumber> = new Map();
  private pollingIntervalId: NodeJS.Timeout | null = null;
  
  /**
   * Get the USDT balance for an address
   * @param address The address to check balance for
   * @returns The USDT balance as a BigNumber
   */
  async getUsdtBalance(address: string): Promise<ethers.BigNumber> {
    try {
      // Get the balance using internal implementation
      const balance = await this.getUsdtBalanceInternal(address);
      
      // Store the balance for reference
      this.addressBalances.set(address, balance);
      
      return balance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get USDT balance for address ${address}: ${errorMessage}`, { error, address });
      
      // Return zero balance on error
      return ethers.BigNumber.from(0);
    }
  }
  
  /**
   * Generate a new payment address for a merchant
   * This method delegates to WalletService for address generation
   * @param merchantId The merchant ID
   * @param expectedAmount The expected payment amount
   * @param metadata Additional metadata
   * @returns The generated payment address
   */
  async generatePaymentAddress(
    merchantId: string,
    expectedAmount?: number,
    metadata?: any,
    retryCount: number = 0
  ): Promise<PaymentAddress> {
    try {
      // Get connection to database
      const connection = await getConnection();
      
      // Import WalletService dynamically to avoid circular dependencies
      const { WalletService } = await import('./walletService');
      const walletService = await WalletService.getInstance();
      
      // Generate address using WalletService
      const paymentAddress = await walletService.generatePaymentAddress(
        merchantId,
        expectedAmount,
        metadata
      );
      
      // Start monitoring the new address
      if (paymentAddress.address) {
        await this.startMonitoringAddresses([paymentAddress.address]);
      }
      
      return paymentAddress;
    } catch (error) {
      // Check if the error is a database constraint error for duplicate address
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isDuplicateAddressError = errorMessage.includes('duplicate key value') && 
                                      errorMessage.includes('address');
      
      // If it's a duplicate address error and we haven't retried too many times, try again
      if (isDuplicateAddressError && retryCount < 3) {
        logger.warn(`Duplicate address detected, retrying with new index (attempt ${retryCount + 1})`, { merchantId });
        
        // Force wallet service to increment address index
        const { WalletService } = await import('./walletService');
        const walletService = await WalletService.getInstance();
        await walletService.forceIncrementAddressIndex();
        
        // Retry with incremented retry count
        return this.generatePaymentAddress(merchantId, expectedAmount, metadata, retryCount + 1);
      }
      
      logger.error(`Failed to generate payment address: ${errorMessage}`, { error, merchantId });
      throw error;
    }
  }
  
  constructor(webhookService: WebhookService, queueService: QueueService) {
    this.webhookService = webhookService;
    this.queueService = queueService;
    
    // Initialize providers
    this.initializeProviders();
  }
  
  /**
   * Initialize blockchain providers and contracts
   */
  private async initializeProviders(): Promise<void> {
    try {
      // HTTP provider for general API calls
      // Try with the primary RPC URL first
      try {
        // Expanded list of alternative RPC URLs
        const alternativeRpcUrls = [
          config.blockchain.bscMainnet.rpcUrl, // Try configured URL first
          'https://bsc-dataseed1.binance.org/',
          'https://bsc-dataseed2.binance.org/',
          'https://bsc-dataseed3.binance.org/',
          'https://bsc-dataseed4.binance.org/',
          'https://binance.nodereal.io',
          'https://bsc-mainnet.public.blastapi.io',
          'https://bsc-mainnet.gateway.pokt.network/v1/lb/',
          'https://bsc-mainnet-rpc.allthatnode.com',
          'https://bsc.rpc.blxrbdn.com',
          'https://bsc-mainnet.chainnodes.org'
        ];
        
        // Try to connect to each RPC URL with timeout
        let connected = false;
        
        for (const url of alternativeRpcUrls) {
          if (connected) break;
          
          logger.info(`Attempting to connect to RPC URL: ${url}`);
          
          try {
            const tempProvider = new ethers.providers.JsonRpcProvider(url);
            
            // Set a connection timeout
            const blockNumberPromise = new Promise<number>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout for RPC URL ${url}`));
              }, 10000); // 10 second timeout
              
              tempProvider.getBlockNumber()
                .then(blockNumber => {
                  clearTimeout(timeout);
                  resolve(blockNumber);
                })
                .catch(err => {
                  clearTimeout(timeout);
                  reject(err);
                });
            });
            
            // Wait for the connection to be established
            await blockNumberPromise;
            
            // If we get here, connection was successful
            this.provider = tempProvider;
            connected = true;
            logger.info(`Successfully connected to RPC URL: ${url}`);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable');
            
            if (is503Error) {
              logger.error(`RPC URL ${url} returned 503 Service Unavailable`);
              this.createSystemErrorLog(`RPC URL ${url} returned 503 Service Unavailable`, 
                                     e instanceof Error ? e : undefined);
            } else {
              logger.warn(`Failed to connect to RPC URL ${url}: ${errorMessage}`);
            }
          }
        }
        
        // If all connections failed, create a provider with the default URL as a fallback
        if (!connected) {
          logger.error('All RPC URLs failed, using default URL as fallback');
          this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
        }
      } catch (rpcError) {
        const errorMessage = rpcError instanceof Error ? rpcError.message : 'Unknown error';
        logger.error(`Failed to initialize HTTP provider: ${errorMessage}`);
        
        // Create a provider anyway with the default URL - we'll retry connections later
        this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.bscMainnet.rpcUrl);
        
        // Create system error log
        this.createSystemErrorLog(`Failed to initialize HTTP provider: ${errorMessage}`, 
                               rpcError instanceof Error ? rpcError : undefined);
      }
      
      // Initialize WebSocket provider with fallback mechanism
      try {
        await this.initializeWebSocketProvider();
      } catch (wsError) {
        const errorMessage = wsError instanceof Error ? wsError.message : 'Unknown error';
        logger.error(`Failed to initialize WebSocket provider: ${errorMessage}`);
        // Continue without WebSocket provider - we'll use HTTP polling as fallback
      }
      
      // Initialize USDT contract
      try {
        this.usdtContract = new ethers.Contract(
          config.blockchain.bscMainnet.contracts.usdt,
          ERC20_ABI,
          this.provider
        );
      } catch (contractError) {
        const errorMessage = contractError instanceof Error ? contractError.message : 'Unknown error';
        logger.error(`Failed to initialize USDT contract: ${errorMessage}`);
        // Continue without USDT contract - functionality will be limited
      }
      
      logger.info('Blockchain providers initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize blockchain providers: ${errorMessage}`, { error });
      
      // Check for 503 error specifically
      const is503Error = error instanceof Error && (error.message.includes('503') || error.message.includes('Service Unavailable'));
      if (is503Error) {
        logger.error('503 Service Unavailable error detected during provider initialization');
        // Create system error log
        this.createSystemErrorLog('503 Service Unavailable error during blockchain provider initialization', 
                               error instanceof Error ? error : undefined);
      }
      
      // Set up HTTP polling fallback if we have addresses to monitor
      if (this.monitoringAddresses.size > 0) {
        try {
          logger.info('Setting up HTTP polling fallback due to provider initialization failure');
          this.setupHttpPollingFallback();
        } catch (fallbackError) {
          logger.error(`Failed to set up HTTP polling fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
          // Continue without fallback - we'll retry initialization later
        }
      }
      
      // Continue without throwing to prevent application crash
      // We'll retry initialization later with exponential backoff
      const baseDelay = is503Error ? 60000 : 30000; // 1 minute for 503 errors, 30 seconds for others
      const reconnectAttempt = (this.reconnectAttempts || 0) + 1;
      this.reconnectAttempts = reconnectAttempt;
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(300000, baseDelay * Math.pow(1.5, reconnectAttempt - 1)); // Cap at 5 minutes
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = Math.floor(exponentialDelay + jitter);
      
      logger.info(`Will retry provider initialization in ${delay/1000} seconds (attempt ${reconnectAttempt})`);
      setTimeout(() => {
        try {
          this.initializeProviders();
        } catch (retryError) {
          logger.error(`Failed to retry provider initialization: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
          // Don't throw - just log the error and continue with limited functionality
        }
      }, delay);
    }
  }
  
  /**
   * Initialize WebSocket provider with fallback options
   * @returns Promise that resolves when initialization is complete or fails safely
   */
  private async initializeWebSocketProvider(): Promise<void> {
    // Define fallback WebSocket URLs - expanded list with more providers
    const wsUrls = [
      config.blockchain.bscMainnet.wsUrl,
      'wss://bsc-ws-node.nariox.org:443',
      'wss://bsc.getblock.io/mainnet/',
      'wss://bsc-mainnet.nodereal.io/ws',
      'wss://binance.nodereal.io/ws',
      'wss://bsc-mainnet.public.blastapi.io/ws',
      'wss://bsc-mainnet.gateway.pokt.network/v1/lb/websocket',
      // Remove problematic endpoint that's causing 503 errors
      // 'wss://bsc-mainnet-rpc.allthatnode.com',
      'wss://bsc-ws.nodies.app',
      'wss://bsc-mainnet.chainnodes.org/ws'
    ];
    
    // Clean up any existing polling interval
    this.cleanupPollingInterval();
    
    let connected = false;
    let attemptIndex = 0;
    
    // Create a safe wrapper for WebSocket connection attempts
    const safeWebSocketConnect = async (url: string): Promise<ethers.providers.WebSocketProvider | null> => {
      return new Promise<ethers.providers.WebSocketProvider | null>((resolve) => {
        try {
          // Create WebSocket provider with standard network options
          const wsProvider = new ethers.providers.WebSocketProvider(url);
          
          // Add error handler for WebSocket to prevent uncaught exceptions
          if (wsProvider._websocket) {
            wsProvider._websocket.onerror = (event: any) => {
              logger.warn(`WebSocket error from ${url}: ${event.message || 'Connection error'}`);
              resolve(null); // Return null on error
            };
          }
          
          // Set a connection timeout
          const timeout = setTimeout(() => {
            logger.warn(`Connection timeout for WebSocket provider ${url}`);
            resolve(null); // Return null on timeout
          }, 15000);
          
          // Test the connection
          wsProvider.getBlockNumber()
            .then(() => {
              clearTimeout(timeout);
              resolve(wsProvider); // Return the provider on success
            })
            .catch((error) => {
              clearTimeout(timeout);
              logger.warn(`Failed to connect to WebSocket provider ${url}: ${error.message}`);
              resolve(null); // Return null on error
            });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Error initializing WebSocket provider ${url}: ${errorMessage}`);
          resolve(null); // Return null on error
        }
      });
    };
    
    const tryConnect = async () => {
      if (connected || attemptIndex >= wsUrls.length) {
        if (!connected && attemptIndex >= wsUrls.length) {
          logger.error('All WebSocket providers failed, will retry in 60 seconds');
          // Create system error log for all providers failing
          this.createSystemErrorLog('All WebSocket providers failed to connect');
          
          // Start HTTP polling as a fallback since all WebSocket providers failed
          this.setupHttpPollingFallback();
          
          // Try again after a longer delay with exponential backoff
          const retryDelay = Math.min(300000, 60000 * Math.pow(1.5, Math.min(5, this.reconnectAttempts))); // Max 5 minutes
          logger.info(`Will retry WebSocket initialization in ${retryDelay/1000} seconds`);
          setTimeout(() => this.initializeWebSocketProvider(), retryDelay);
        }
        return;
      }
      
      const wsUrl = wsUrls[attemptIndex];
      logger.info(`Attempting to connect to WebSocket provider: ${wsUrl}`);
      
      try {
        // Use the safe wrapper to attempt connection
        const wsProvider = await safeWebSocketConnect(wsUrl);
        
        if (wsProvider) {
          connected = true;
          this.wsProvider = wsProvider;
          
          // Set up reconnection for WebSocket provider
          this.setupWebSocketReconnection();
          
          logger.info(`Successfully connected to WebSocket provider: ${wsUrl}`);
          
          // Reset reconnect attempts on successful connection
          this.reconnectAttempts = 0;
          
          // Clean up any HTTP polling fallback if it was set up
          this.cleanupPollingInterval();
          
          // Restart monitoring if we had active addresses
          if (this.monitoringAddresses.size > 0) {
            this.startMonitoringAddresses(Array.from(this.monitoringAddresses));
          }
        } else {
          // Check if this was a 503 error (based on URL)
          if (wsUrl.includes('allthatnode') || wsUrl.includes('nariox')) {
            logger.warn(`Skipping potentially problematic WebSocket provider: ${wsUrl}`);
          }
          
          // Move to next provider
          attemptIndex++;
          setTimeout(() => tryConnect(), 2000);
        }
      } catch (error) {
        // This should rarely happen due to our safe wrapper, but just in case
        logger.warn(`Unexpected error during WebSocket connection attempt: ${error instanceof Error ? error.message : 'Unknown error'}`);
        attemptIndex++;
        setTimeout(() => tryConnect(), 2000);
      }
    };
    
    // Start the connection process
    tryConnect();
  }
  
  
  /**
   * Set up HTTP polling as a fallback when WebSocket is unavailable
   */
  private setupHttpPollingFallback(): void {
    // Only set up polling if it's not already running
    if (this.pollingIntervalId) {
      return;
    }
    
    logger.info('Setting up HTTP polling fallback for transaction monitoring');
    
    // Set up polling interval to check for new transactions
    const pollInterval = setInterval(async () => {
      try {
        // For each address, check for new transactions
        for (const address of this.monitoringAddresses) {
          await this.pollAddressForTransactions(address);
        }
      } catch (pollError) {
        const errorMessage = pollError instanceof Error ? pollError.message : 'Unknown error';
        logger.error(`Error polling for transactions: ${errorMessage}`);
        
        // Check for 503 error specifically
        if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
          logger.error('503 Service Unavailable error during HTTP polling');
          this.createSystemErrorLog('503 Service Unavailable error during HTTP polling', 
                                 pollError instanceof Error ? pollError : undefined);
        }
      }
    }, 30000); // Poll every 30 seconds
    
    // Store the interval ID for cleanup
    this.pollingIntervalId = pollInterval;
    
    this.isMonitoring = true;
    logger.info(`Started polling ${this.monitoringAddresses.size} addresses for incoming transactions via HTTP RPC`);
  }
  
  /**
   * Clean up polling interval if it exists
   */
  private cleanupPollingInterval(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      logger.info('Cleaned up transaction polling interval');
    }
  }
  
  /**
   * Set up automatic reconnection for WebSocket provider
   */
  private setupWebSocketReconnection(): void {
    // Handle WebSocket connection errors and closures
    const handleReconnection = (event: string, error?: Error) => {
      const errorMsg = error ? `: ${error.message}` : '';
      logger.warn(`WebSocket connection ${event}${errorMsg}, attempting to reconnect...`);
      
      // Clear the current monitoring state
      this.isMonitoring = false;
      
      // Check for 503 error specifically
      const is503Error = error && (error.message?.includes('503') || error.message?.includes('Service Unavailable'));
      if (is503Error) {
        logger.error(`WebSocket provider returned 503 Service Unavailable`);
      }
      
      // Create audit log for system error
      this.createSystemErrorLog(`WebSocket connection ${event}${errorMsg}`, error);
      
      // Calculate backoff delay (exponential with jitter)
      const baseDelay = is503Error ? 30000 : 5000; // 30 seconds base for 503 errors (increased from 15s), 5 seconds for others
      const maxDelay = 600000; // 10 minutes max (increased from 5 minutes)
      const reconnectAttempt = (this.reconnectAttempts || 0) + 1;
      this.reconnectAttempts = reconnectAttempt;
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(maxDelay, baseDelay * Math.pow(1.5, reconnectAttempt - 1));
      const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
      const delay = Math.floor(exponentialDelay + jitter);
      
      logger.info(`Reconnection attempt ${reconnectAttempt} scheduled in ${delay/1000} seconds`);
      
      // Clean up any existing polling interval before reconnecting
      this.cleanupPollingInterval();
      
      // Set up HTTP polling fallback immediately for 503 errors or after multiple failures
      if (is503Error || reconnectAttempt > 2) {
        this.setupHttpPollingFallback();
      }
      
      // Attempt to reconnect after the calculated delay
      setTimeout(() => {
        try {
          // Try to reconnect using the initializeWebSocketProvider method
          this.initializeWebSocketProvider();
          
          // Restart monitoring if we had active addresses
          if (this.monitoringAddresses.size > 0) {
            this.startMonitoringAddresses(Array.from(this.monitoringAddresses));
          }
        } catch (reconnectError) {
          logger.error(`Error during WebSocket reconnection: ${reconnectError instanceof Error ? reconnectError.message : 'Unknown error'}`);
          // Ensure HTTP polling fallback is set up if reconnection fails
          this.setupHttpPollingFallback();
        }
      }, delay);
    };
    
    // Ensure the WebSocket provider exists and has a websocket
    if (!this.wsProvider || !this.wsProvider._websocket) {
      logger.error('Cannot set up WebSocket reconnection: provider or websocket is undefined');
      this.setupHttpPollingFallback();
      return;
    }
    
    // Listen for WebSocket errors
    this.wsProvider._websocket.on('error', (error: Error) => {
      handleReconnection('error', error);
    });
    
    // Listen for WebSocket closures
    this.wsProvider._websocket.on('close', () => {
      handleReconnection('closed');
    });
    
    // Reset reconnect attempts counter when successfully connected
    this.wsProvider._websocket.on('open', () => {
      logger.info('WebSocket connection established successfully');
      this.reconnectAttempts = 0;
    });
  }
  
  /**
   * Get the USDT balance for an address (internal implementation)
   * @param address The address to check
   * @private
   */
  private async getUsdtBalanceInternal(address: string): Promise<ethers.BigNumber> {
    try {
      // Ensure the USDT contract is initialized
      if (!this.usdtContract) {
        this.usdtContract = new ethers.Contract(
          config.blockchain.bscMainnet.contracts.usdt,
          ERC20_ABI,
          this.provider
        );
      }
      
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
      logger.info(`Added ${addresses.length} new addresses to monitoring set, total: ${this.monitoringAddresses.size}`);
      return;
    }
    
    // Log the monitoring attempt
    logger.info(`Attempting to start monitoring ${addresses.length} addresses for incoming transactions`);
    
    try {
      // Add addresses to the monitoring set
      addresses.forEach(address => this.monitoringAddresses.add(address));
      
      // Use safe WebSocket operation with fallback
      await this.safeWebSocketOperation(
        // WebSocket operation
        async () => {
          // Check if WebSocket provider is available
          if (!this.wsProvider || !this.wsProvider._websocket || this.wsProvider._websocket.readyState !== 1) {
            logger.warn('WebSocket provider not ready, reinitializing...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.initializeWebSocketProvider();
            throw new Error('WebSocket provider not ready');
          }
          
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
          
          // Test the connection by getting the latest block number
          await this.wsProvider.getBlockNumber();
          
          this.isMonitoring = true;
          logger.info(`Started monitoring ${addresses.length} addresses for incoming transactions via WebSocket`);
          return true;
        },
        // HTTP RPC fallback - poll for transactions instead of using events
        async () => {
          logger.info('Falling back to HTTP polling for transaction monitoring');
          
          // Set up polling interval to check for new transactions
          const pollInterval = setInterval(async () => {
            try {
              // For each address, check for new transactions
              for (const address of this.monitoringAddresses) {
                await this.pollAddressForTransactions(address);
              }
            } catch (pollError) {
              logger.error(`Error polling for transactions: ${pollError instanceof Error ? pollError.message : 'Unknown error'}`);
            }
          }, 30000); // Poll every 30 seconds
          
          // Store the interval ID for cleanup
          this.pollingIntervalId = pollInterval;
          
          this.isMonitoring = true;
          logger.info(`Started polling ${addresses.length} addresses for incoming transactions via HTTP RPC`);
          return true;
        }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to start monitoring addresses: ${errorMessage}`, { error });
      
      // Create system error log
      await this.createSystemErrorLog(`Failed to start monitoring addresses: ${errorMessage}`, error instanceof Error ? error : undefined);
      
      // Don't throw, just log and continue
      // We'll retry in the next reconnection cycle
      logger.info('Will retry monitoring in the next reconnection cycle');
    }
  }
  
  /**
   * Poll an address for new transactions (fallback method when WebSocket is unavailable)
   * @param address The address to check
   */
  private async pollAddressForTransactions(address: string): Promise<void> {
    try {
      // Get current USDT balance using executeWithRetry for better error handling
      const balance = await this.executeWithRetry(async () => {
        return await this.usdtContract.balanceOf(address);
      });
      
      // Check if we have a previous balance record
      const previousBalance = this.addressBalances.get(address) || ethers.BigNumber.from(0);
      
      // If balance increased, there might be a new transaction
      if (balance.gt(previousBalance)) {
        logger.info(`Balance increase detected for ${address}`, {
          previous: previousBalance.toString(),
          current: balance.toString(),
          difference: balance.sub(previousBalance).toString()
        });
        
        // Get recent transactions for this address (implementation depends on available API)
        // This is a simplified example - in production, you'd use a proper transaction indexing service
        await this.checkRecentTransactionsForAddress(address);
      }
      
      // Update stored balance
      this.addressBalances.set(address, balance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error polling address ${address}: ${errorMessage}`);
      
      // Create system error log for persistent polling failures
      if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
        await this.createSystemErrorLog(`503 Service Unavailable error when polling address ${address}`, 
                                     error instanceof Error ? error : undefined);
      }
    }
  }
  
  /**
   * Check recent transactions for an address (fallback method)
   * @param address The address to check
   */
  private async checkRecentTransactionsForAddress(address: string): Promise<void> {
    try {
      // In a real implementation, you would:
      // 1. Use a blockchain explorer API or indexing service to get recent transactions
      // 2. Filter for USDT transfers to this address
      // 3. Process each transaction that hasn't been processed yet
      
      // For this example, we'll just log that we would check transactions
      logger.info(`Would check recent transactions for ${address} (fallback method)`);
      
      // Note: In a production environment, implement proper transaction fetching
      // This might involve using APIs like BscScan, Moralis, Covalent, or your own indexer
    } catch (error) {
      logger.error(`Error checking recent transactions for ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Validates a payment against expected amount and handles various payment scenarios
   * @param transaction The transaction to validate
   * @param paymentAmount The actual payment amount received
   * @param senderAddress The address that sent the payment
   * @param txHash The transaction hash
   */
  async validatePayment(
    transaction: Transaction,
    paymentAmount: number,
    senderAddress: string,
    txHash: string
  ): Promise<void> {
    // Skip validation if transaction is already completed
    if (transaction.status === TransactionStatus.COMPLETED) {
      return;
    }
    
    // Handle payment for expired transaction
    if (transaction.status === TransactionStatus.EXPIRED) {
      // Update transaction metadata
      transaction.metadata = {
        ...transaction.metadata,
        paymentAfterExpiration: true,
        refundPending: true
      };
      
      // Save the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      await transactionRepository.save(transaction);
      
      // Queue refund for the full amount
      await this.queueService.addToQueue('refund.process', {
        transactionId: transaction.id,
        excessAmount: paymentAmount,
        refundAddress: senderAddress
      });
      
      return;
    }
    
    // Calculate payment difference
    const expectedAmount = transaction.amount;
    const difference = expectedAmount - paymentAmount;
    const differencePercent = Math.abs(difference) / expectedAmount * 100;
    
    // Get underpayment and overpayment thresholds from config
    const underpaymentThreshold = config.payment.underpaymentThresholdPercent;
    const overpaymentThreshold = config.payment.overpaymentThresholdPercent;
    
    // Initialize transaction metadata
    transaction.metadata = transaction.metadata || {};
    transaction.fromAddress = senderAddress;
    transaction.txHash = txHash;
    
    // Handle different payment scenarios
    if (difference > 0 && differencePercent > underpaymentThreshold) {
      // Significant underpayment (outside threshold)
      transaction.status = TransactionStatus.UNDERPAID;
      transaction.metadata = {
        ...transaction.metadata,
        actualAmount: paymentAmount,
        underpayment: true,
        underpaymentAmount: difference
      };
      
      // Save the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      await transactionRepository.save(transaction);
      
      // Send webhook notification for underpayment
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        WebhookEvent.PAYMENT_UNDERPAID,
        {
          ...transaction,
          actualAmount: paymentAmount,
          underpayment: true,
          underpaymentAmount: difference
        }
      );
    } else if (difference < 0 && differencePercent > overpaymentThreshold) {
      // Significant overpayment (outside threshold)
      transaction.status = TransactionStatus.COMPLETED;
      const overpaymentAmount = Math.abs(difference);
      
      transaction.metadata = {
        ...transaction.metadata,
        actualAmount: paymentAmount,
        overpayment: true,
        overpaymentAmount: overpaymentAmount,
        refundPending: true
      };
      
      // Save the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      await transactionRepository.save(transaction);
      
      // Send webhook notification for completed payment
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        WebhookEvent.PAYMENT_COMPLETED,
        {
          ...transaction,
          actualAmount: paymentAmount,
          overpayment: true,
          overpaymentAmount: overpaymentAmount
        }
      );
      
      // Queue refund for the excess amount
      await this.queueService.addToQueue('refund.process', {
        transactionId: transaction.id,
        excessAmount: overpaymentAmount,
        refundAddress: senderAddress
      });
    } else {
      // Payment within acceptable threshold (exact, minor underpayment, or minor overpayment)
      transaction.status = TransactionStatus.COMPLETED;
      
      // Add metadata for minor underpayment or overpayment
      if (difference > 0) {
        transaction.metadata = {
          ...transaction.metadata,
          actualAmount: paymentAmount,
          underpayment: true,
          underpaymentAmount: difference
        };
      } else if (difference < 0) {
        transaction.metadata = {
          ...transaction.metadata,
          actualAmount: paymentAmount,
          overpayment: true,
          overpaymentAmount: Math.abs(difference)
        };
      }
      
      // Save the transaction
      const connection = await getConnection();
      const transactionRepository = connection.getRepository(Transaction);
      await transactionRepository.save(transaction);
      
      // Send webhook notification for completed payment
      await this.webhookService.sendWebhookNotification(
        transaction.merchantId,
        WebhookEvent.PAYMENT_COMPLETED,
        transaction
      );
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
          
          // Define required confirmations
          const neededConfirmations = config.blockchain.bscMainnet.confirmations || 12;
          
          // Check if fully confirmed
          if (confirmations >= neededConfirmations && transaction.status === TransactionStatus.CONFIRMING) {
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
          const currentConfirmations = transaction.confirmations || 0;
          //const neededConfirmations = config.blockchain.bscMainnet.confirmations || 12;
          
          if (currentConfirmations < neededConfirmations) {
            // Queue next check with exponential backoff
            const delay = Math.min(30, Math.pow(2, currentConfirmations)) * 1000; // Max 30 seconds
            const txHash = transaction.txHash;
            const transactionId = transaction.id;
            
            setTimeout(async () => {
              await this.queueService.addToQueue('transaction.monitor', {
                transactionId,
                txHash,
                blockNumber: txReceipt.blockNumber,
                confirmations: currentConfirmations,
                requiredConfirmations: neededConfirmations
              });
            }, delay);
          }
        });
      } else {
        // No new confirmations, check again later
        const confirmsToUse = currentConfirmations || 0;
        const neededConfirmations = config.blockchain.bscMainnet.confirmations || 12;
        // Use the txHash and transactionId from parameters
        
        setTimeout(async () => {
          await this.queueService.addToQueue('transaction.monitor', {
            transactionId,
            txHash,
            blockNumber: txReceipt ? txReceipt.blockNumber : 0,
            confirmations: confirmsToUse,
            requiredConfirmations: neededConfirmations
          });
        }, 15000); // Check again in 15 seconds
      }
    } catch (error) {
      const err = error as Error;
      // Use safe access to avoid undefined variables
      const txHashLog = txHash || 'unknown';
      const transactionIdLog = transactionId || 'unknown';
      
      logger.error(`Error monitoring transaction confirmations for ${txHashLog}: ${err.message}`, {
        error,
        txHash: txHashLog,
        transactionId: transactionIdLog
      });
      
      // Retry after a delay
      // Use the values from parameters or default to 0
      const confirmsToRetry = currentConfirmations || 0;
      const neededConfirmations = config.blockchain.bscMainnet.confirmations || 12;
      // txHash and transactionId are already defined in parameters
      
      setTimeout(async () => {
        await this.queueService.addToQueue('transaction.monitor', {
          transactionId,
          txHash,
          confirmations: confirmsToRetry,
          requiredConfirmations: neededConfirmations
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
  // This method is already defined above - implementation is in the class
  
  /**
   * Create a system error log entry
   * @param description Error description
   * @param error Error object
   */
  private async createSystemErrorLog(description: string, error?: Error): Promise<void> {
    try {
      await DatabaseCircuitBreaker.executeQuery(async () => {
        const connection = await getConnection();
        const auditLogRepository = connection.getRepository(AuditLog);
        
        const auditLog = AuditLog.create({
          action: AuditLogAction.SYSTEM_ERROR,
          entityType: AuditLogEntityType.SYSTEM,
          description,
          newState: error ? {
            message: error.message,
            stack: error.stack,
            service: 'eoscryptopago',
            timestamp: new Date().toISOString()
          } : {
            service: 'eoscryptopago',
            timestamp: new Date().toISOString()
          }
        });
        
        await auditLogRepository.save(auditLog);
      });
    } catch (logError) {
      // Just log to console if we can't save to database
      logger.error(`Failed to create system error log: ${logError instanceof Error ? logError.message : 'Unknown error'}`);
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
    const maxRetries = 7; // Increased from 5 to 7 for more resilience
    let lastError: Error = new Error('Unknown error occurred');
    
    // Expanded list of alternative RPC URLs
    const alternativeRpcUrls = [
      'https://bsc-dataseed1.binance.org/',
      'https://bsc-dataseed2.binance.org/',
      'https://bsc-dataseed3.binance.org/',
      'https://bsc-dataseed4.binance.org/',
      'https://bsc-dataseed.binance.org/',
      'https://binance.nodereal.io',
      'https://bsc-mainnet.gateway.pokt.network/v1/lb/',
      'https://bsc-mainnet.public.blastapi.io',
      // Remove problematic endpoint that's causing 503 errors
      // 'https://bsc-mainnet-rpc.allthatnode.com',
      'https://bsc.rpc.blxrbdn.com',
      'https://bsc-mainnet.chainnodes.org'
    ];
    
    // Keep track of which URLs we've tried
    const triedUrls = new Set<string>();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // If this is a retry attempt, try to use a different provider first
        if (attempt > 1) {
          // For HTTP provider issues, try with an alternative RPC URL
          if (attempt <= alternativeRpcUrls.length + 1) { // +1 because attempt starts at 1
            // Choose an RPC URL we haven't tried yet
            let alternativeUrl = '';
            for (const url of alternativeRpcUrls) {
              if (!triedUrls.has(url)) {
                alternativeUrl = url;
                triedUrls.add(url);
                break;
              }
            }
            
            // If we've tried all URLs, pick a random one
            if (!alternativeUrl && alternativeRpcUrls.length > 0) {
              alternativeUrl = alternativeRpcUrls[Math.floor(Math.random() * alternativeRpcUrls.length)];
              logger.info(`All alternative URLs tried, randomly selecting: ${alternativeUrl}`);
            }
            
            if (alternativeUrl) {
              logger.info(`Trying alternative RPC URL (attempt ${attempt}/${maxRetries}): ${alternativeUrl}`);
              
              // Temporarily create a new provider with the alternative URL
              const tempProvider = new ethers.providers.JsonRpcProvider(alternativeUrl);
              
              // Set a timeout for the connection attempt
              const connectionPromise = new Promise<ethers.providers.Provider>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error(`Connection timeout for RPC URL ${alternativeUrl}`));
                }, 10000); // 10 second timeout
                
                tempProvider.getBlockNumber()
                  .then(() => {
                    clearTimeout(timeout);
                    resolve(tempProvider);
                  })
                  .catch(err => {
                    clearTimeout(timeout);
                    reject(err);
                  });
              });
              
              try {
                // Wait for the connection to be established
                await connectionPromise;
                
                // Create a temporary contract with the new provider
                const tempContract = new ethers.Contract(
                  config.blockchain.bscMainnet.contracts.usdt,
                  ERC20_ABI,
                  tempProvider
                );
                
                // Store the original provider and contract
                const originalProvider = this.provider;
                const originalContract = this.usdtContract;
                
                try {
                  // Temporarily replace the provider and contract
                  this.provider = tempProvider;
                  this.usdtContract = tempContract;
                  
                  // Execute the function with the temporary provider
                  const result = await fn();
                  
                  // If successful, keep this provider
                  logger.info(`Alternative RPC URL ${alternativeUrl} worked successfully, keeping it`);
                  return result;
                } catch (innerError) {
                  // Revert back to the original provider and contract
                  this.provider = originalProvider;
                  this.usdtContract = originalContract;
                  
                  // Re-throw to be caught by the outer catch block
                  throw innerError;
                }
              } catch (connectionError) {
                logger.warn(`Failed to connect to alternative RPC URL ${alternativeUrl}: ${connectionError instanceof Error ? connectionError.message : 'Unknown error'}`);
                // Continue to the next iteration of the loop
              }
            }
          }
        }
        
        // Normal execution with current provider
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check for specific error types
        const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable');
        const isConnectionError = errorMessage.includes('connection') || 
                                errorMessage.includes('network') || 
                                errorMessage.includes('timeout') || 
                                errorMessage.includes('ECONNREFUSED');
        
        logger.warn(`Blockchain call failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`, {
          error,
          attempt,
          is503Error,
          isConnectionError
        });
        
        // For 503 errors or connection issues, we might need to reinitialize the provider
        if ((is503Error || isConnectionError) && attempt === 2) {
          logger.info('Attempting to reinitialize WebSocket provider due to connection issues');
          this.initializeWebSocketProvider();
          
          // Also set up HTTP polling fallback for 503 errors
          if (is503Error) {
            this.setupHttpPollingFallback();
          }
        }
        
        if (attempt < maxRetries) {
          // Wait with exponential backoff before retrying
          // More aggressive backoff for 503 errors
          const baseDelay = is503Error ? 15000 : 3000; // 15 seconds for 503, 3 seconds for others
          const maxBackoffDelay = is503Error ? 120000 : 60000; // 2 minutes for 503, 1 minute for others
          const delay = Math.min(maxBackoffDelay, baseDelay * Math.pow(2, attempt - 1));
          const jitter = Math.random() * 0.3 * delay; // Add 0-30% jitter
          
          logger.info(`Retrying in ${Math.floor(delay + jitter)}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }
      }
    }
    
    // Create system error log for persistent failures
    await this.createSystemErrorLog(`Blockchain call failed after ${maxRetries} attempts`, lastError);
    
    // For 503 errors, provide a more specific error message
    if (lastError.message.includes('503') || lastError.message.includes('Service Unavailable')) {
      throw new Error(`Service unavailable (503). The blockchain node is currently unavailable. Please try again later. Original error: ${lastError.message}`);
    }
    
    throw lastError;
  }
  
  /**
   * Safely execute a WebSocket operation with fallback to HTTP RPC if needed
   * @param wsOperation The WebSocket operation to execute
   * @param rpcFallback The HTTP RPC fallback operation
   */
  private async safeWebSocketOperation<T>(
    wsOperation: () => Promise<T>,
    rpcFallback: () => Promise<T>
  ): Promise<T> {
    // Check if WebSocket provider is in a good state
    const isWsProviderHealthy = this.wsProvider && 
                              this.wsProvider._websocket && 
                              this.wsProvider._websocket.readyState === 1;
    
    // If WebSocket is not healthy, go straight to fallback
    if (!isWsProviderHealthy) {
      logger.warn('WebSocket provider not in a healthy state, using HTTP RPC fallback directly');
      
      // Set up HTTP polling as a fallback mechanism
      this.setupHttpPollingFallback();
      
      try {
        return await this.executeWithRetry(rpcFallback);
      } catch (rpcError) {
        const errorMessage = rpcError instanceof Error ? rpcError.message : 'Unknown error';
        const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable');
        
        logger.error(`HTTP RPC fallback operation failed: ${errorMessage}`);
        
        // Create system error log with specific 503 information if applicable
        await this.createSystemErrorLog(
          `HTTP RPC fallback operation failed${is503Error ? ' (503 Service Unavailable)' : ''}: ${errorMessage}`, 
          rpcError instanceof Error ? rpcError : undefined
        );
        
        // Try to reinitialize providers before giving up
        // Use a longer delay for 503 errors to avoid hammering the service
        const initDelay = is503Error ? 10000 : 5000;
        logger.info(`Will attempt to reinitialize providers in ${initDelay/1000} seconds`);
        setTimeout(() => this.initializeProviders(), initDelay);
        
        throw rpcError;
      }
    }
    
    try {
      // First try with WebSocket
      return await this.executeWithRetry(wsOperation);
    } catch (wsError) {
      // Check for 503 error
      const errorMessage = wsError instanceof Error ? wsError.message : 'Unknown error';
      const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable');
      
      // Log the WebSocket failure
      logger.warn(`WebSocket operation failed (${is503Error ? '503 error' : 'error'}), falling back to HTTP RPC: ${errorMessage}`);
      
      // Create system error log for WebSocket failure
      await this.createSystemErrorLog(`WebSocket operation failed: ${errorMessage}`, 
                                   wsError instanceof Error ? wsError : undefined);
      
      // If it's a 503 error, try to reinitialize the WebSocket provider
      if (is503Error) {
        logger.info('Attempting to reinitialize WebSocket provider due to 503 error');
        setTimeout(() => this.initializeWebSocketProvider(), 5000); // Increased delay to 5 seconds
        
        // Set up HTTP polling as a fallback mechanism
        this.setupHttpPollingFallback();
      }
      
      try {
        // Fall back to HTTP RPC
        return await this.executeWithRetry(rpcFallback);
      } catch (rpcError) {
        // Both methods failed
        const rpcErrorMessage = rpcError instanceof Error ? rpcError.message : 'Unknown error';
        const isRpc503Error = rpcErrorMessage.includes('503') || rpcErrorMessage.includes('Service Unavailable');
        
        logger.error(`Both WebSocket and HTTP RPC operations failed: ${rpcErrorMessage}`);
        
        // Create system error log for complete failure
        await this.createSystemErrorLog(
          `Both WebSocket and HTTP RPC operations failed${isRpc503Error ? ' (503 Service Unavailable)' : ''}: ${rpcErrorMessage}`, 
          rpcError instanceof Error ? rpcError : undefined
        );
        
        // Try to reinitialize providers as a last resort with longer delay for 503 errors
        const initDelay = isRpc503Error ? 30000 : 10000; // 30 seconds for 503, 10 seconds for others
        logger.info(`Will attempt to reinitialize providers in ${initDelay/1000} seconds as last resort`);
        setTimeout(() => this.initializeProviders(), initDelay);
        
        // Throw a more descriptive error for 503 errors
        if (isRpc503Error) {
          throw new Error(`Blockchain service temporarily unavailable (503). The service is experiencing high load or maintenance. Please try again later.`);
        } else {
          throw new Error(`Blockchain connection failed: ${rpcErrorMessage}. Please try again later.`);
        }
      }
    }
  }
}