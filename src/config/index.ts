import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  maxConnections: number;
  idleTimeoutMillis: number;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string | null;
  ttl: number;
}

interface BlockchainConfig {
  bscMainnet: {
    rpcUrl: string;
    wsUrl: string;
    chainId: number;
    confirmations: number;
    gasPrice: string;
    gasLimit: number;
    contracts: {
      usdt: string;
    };
  };
  bscTestnet: {
    rpcUrl: string;
    wsUrl: string;
    chainId: number;
    confirmations: number;
    gasPrice: string;
    gasLimit: number;
    contracts: {
      usdt: string;
    };
  };
}

interface WalletConfig {
  hdPath: string;
  addressExpirationTime: number; // in milliseconds
  hotWalletThreshold: string; // in USDT
  coldWalletAddress: string;
}

interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  apiKeys: {
    headerName: string;
    expirationDays: number;
  };
  webhookSignatureSecret: string;
  encryptionKey: string; // Added for encryption/decryption operations
}

interface LoggingConfig {
  level: string;
  directory: string;
}

interface QueueConfig {
  url: string;
  retryAttempts: number;
  retryDelay: number; // in milliseconds
  useBackoff: boolean; // whether to use exponential backoff for reconnection
  healthCheckInterval: number; // interval in ms to check connection health
  storeFailedMessages: boolean; // whether to store failed messages for retry
  maxRetries?: number; // maximum number of retries for messages
}

interface WebhookConfig {
  maxRetries: number;
  retryDelay: number;
}

interface PaymentConfig {
  underpaymentThresholdPercent: number;
  overpaymentThresholdPercent: number;
}

interface Config {
  env: string;
  port: number;
  database: DatabaseConfig;
  redis: RedisConfig;
  blockchain: BlockchainConfig;
  wallet: WalletConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  queue: QueueConfig;
  payment: PaymentConfig;
  webhook: WebhookConfig;
  idempotencyKeyExpiration: number; // in seconds
}

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  payment: {
    underpaymentThresholdPercent: parseFloat(process.env.UNDERPAYMENT_THRESHOLD || '5'),
    overpaymentThresholdPercent: parseFloat(process.env.OVERPAYMENT_THRESHOLD || '5')
  },
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'crypto_payment_gateway',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || null,
    ttl: parseInt(process.env.REDIS_TTL || '86400', 10), // 24 hours
  },
  
  blockchain: {
    bscMainnet: {
      rpcUrl: process.env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org/',
      wsUrl: process.env.BSC_MAINNET_WS_URL || 'wss://bsc-ws-node.nariox.org:443',
      chainId: 56,
      confirmations: parseInt(process.env.BSC_MAINNET_CONFIRMATIONS || '6', 10),
      gasPrice: process.env.BSC_MAINNET_GAS_PRICE || '5000000000', // 5 Gwei
      gasLimit: parseInt(process.env.BSC_MAINNET_GAS_LIMIT || '300000', 10),
      contracts: {
        usdt: process.env.BSC_MAINNET_USDT_CONTRACT || '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
      },
    },
    bscTestnet: {
      rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      wsUrl: process.env.BSC_TESTNET_WS_URL || 'wss://bsc-testnet-ws.nariox.org:443',
      chainId: 97,
      confirmations: parseInt(process.env.BSC_TESTNET_CONFIRMATIONS || '6', 10),
      gasPrice: process.env.BSC_TESTNET_GAS_PRICE || '10000000000', // 10 Gwei
      gasLimit: parseInt(process.env.BSC_TESTNET_GAS_LIMIT || '300000', 10),
      contracts: {
        usdt: process.env.BSC_TESTNET_USDT_CONTRACT || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // BSC Testnet USDT
      },
    },
  },
  
  wallet: {
    hdPath: process.env.WALLET_HD_PATH || "m/44'/60'/0'/0", // BIP44 for Ethereum-compatible chains
    addressExpirationTime: parseInt(process.env.ADDRESS_EXPIRATION_TIME || '86400000', 10), // 24 hours
    hotWalletThreshold: process.env.HOT_WALLET_THRESHOLD || '10000', // 10,000 USDT
    coldWalletAddress: process.env.COLD_WALLET_ADDRESS || '',
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    apiKeys: {
      headerName: 'X-API-KEY',
      expirationDays: parseInt(process.env.API_KEY_EXPIRATION_DAYS || '365', 10),
    },
    webhookSignatureSecret: process.env.WEBHOOK_SIGNATURE_SECRET || 'your-webhook-secret-change-in-production',
    encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIRECTORY || 'logs',
  },
  
  queue: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    retryAttempts: parseInt(process.env.QUEUE_RETRY_ATTEMPTS || '5', 10),
    retryDelay: parseInt(process.env.QUEUE_RETRY_DELAY || '5000', 10), // 5 seconds
    useBackoff: process.env.QUEUE_USE_BACKOFF === 'false' ? false : true,
    healthCheckInterval: parseInt(process.env.QUEUE_HEALTH_CHECK_INTERVAL || '30000', 10), // 30 seconds
    storeFailedMessages: process.env.QUEUE_STORE_FAILED_MESSAGES === 'false' ? false : true,
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),
  },
  
  webhook: {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '60000', 10) // 60 seconds
  },
  
  idempotencyKeyExpiration: parseInt(process.env.IDEMPOTENCY_KEY_EXPIRATION || '86400', 10), // 24 hours
};