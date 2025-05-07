import './reflect-metadata';
import { createConnection, getConnection, Connection } from 'typeorm';
import { config } from '../src/config';

// Import all entities to ensure they're registered properly
// Note: Order matters for resolving circular dependencies
// Import enums and entities that don't have circular dependencies

// We'll define these types in our mocks
type ApiKeyStatus = string;
type AddressStatus = string;
type AddressType = string;
type TransactionStatus = string;
type TransactionType = string;
type MerchantStatus = string;
type MerchantRiskLevel = string;
type WebhookEvent = string;
type WebhookStatus = string;

// Mock the Webhook entity to avoid circular dependency issues
jest.mock('../src/db/entities/Webhook', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } = require('typeorm');
  
  enum MockWebhookEvent {
    PAYMENT_RECEIVED = 'payment.received',
    PAYMENT_CONFIRMED = 'payment.confirmed',
    PAYMENT_FAILED = 'payment.failed',
    PAYMENT_UNDERPAID = 'payment.underpaid',
    PAYMENT_COMPLETED = 'payment.completed',
    ADDRESS_CREATED = 'address.created',
    ADDRESS_EXPIRED = 'address.expired',
    SETTLEMENT_COMPLETED = 'settlement.completed',
    TRANSACTION_SETTLED = 'transaction.settled',
    REFUND_INITIATED = 'refund.initiated',
    REFUND_COMPLETED = 'refund.completed',
    REFUND_FAILED = 'refund.failed',
    PAYOUT_INITIATED = 'payout.initiated',
    PAYOUT_PROCESSING = 'payout.processing',
    PAYOUT_COMPLETED = 'payout.completed',
    PAYOUT_FAILED = 'payout.failed'
  }
  
  enum MockWebhookStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    FAILED = 'failed'
  }
  
  @Entity('webhooks')
  class MockWebhook {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
  
    @Column()
    url: string = '';
  
    @Column({ type: 'simple-json' })
    events: string[] = [];
  
    @Column({ type: 'varchar' })
    status: string = MockWebhookStatus.ACTIVE;
  
    @Column({ nullable: true })
    secret?: string;
  
    @Column({ default: 0 })
    failedAttempts: number = 0;
  
    @Column({ nullable: true })
    lastFailureReason?: string;
  
    @Column({ nullable: true, type: 'varchar' })
    lastSuccessAt?: string;
  
    @Column({ nullable: true, type: 'varchar' })
    lastAttemptAt?: string;
  
    @Column({ default: 3 })
    maxRetries: number = 3;
  
    @Column({ default: 15 })
    retryInterval: number = 15;
  
    @Column({ default: true })
    sendPayload: boolean = true;
  
    @Column()
    merchantId: string = '';
  
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
  
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
  
    shouldRetry(): boolean {
      return this.failedAttempts < this.maxRetries;
    }
  
    incrementFailedAttempts(reason: string): void {
      this.failedAttempts += 1;
      this.lastFailureReason = reason;
      this.lastAttemptAt = new Date().toISOString();
      
      if (this.failedAttempts >= this.maxRetries) {
        this.status = MockWebhookStatus.FAILED;
      }
    }
  
    resetFailedAttempts(): void {
      this.failedAttempts = 0;
      this.lastFailureReason = "";
      this.lastSuccessAt = new Date().toISOString();
      this.lastAttemptAt = new Date().toISOString();
      this.status = MockWebhookStatus.ACTIVE;
    }
  
    getNextRetryTime(): string {
      const nextRetry = new Date(this.lastAttemptAt || new Date());
      nextRetry.setSeconds(nextRetry.getSeconds() + this.retryInterval * Math.pow(2, this.failedAttempts - 1));
      return nextRetry.toISOString();
    }
  }
  
  return {
    Webhook: MockWebhook,
    WebhookEvent: MockWebhookEvent,
    WebhookStatus: MockWebhookStatus
  };
});

// Mock the Merchant entity to avoid SQLite compatibility issues with enum types
jest.mock('../src/db/entities/Merchant', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } = require('typeorm');
  
  // Define the enums from the original module
  enum MockMerchantStatus {
    ACTIVE = 'active',
    PENDING = 'pending',
    SUSPENDED = 'suspended'
  }
  
  enum MockMerchantRiskLevel {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high'
  }
  
  @Entity('merchants')
  class MockMerchant {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
    
    @Column({ length: 100 })
    businessName: string = '';
    
    @Column({ nullable: true, length: 255 })
    description: string = '';
    
    @Column({ unique: true })
    email: string = '';
    
    @Column({ nullable: true })
    phone: string = '';
    
    @Column({ nullable: true })
    website: string = '';
    
    @Column({ type: 'varchar' })
    status: string = MockMerchantStatus.PENDING;
    
    @Column({ type: 'varchar' })
    riskLevel: string = MockMerchantRiskLevel.MEDIUM;
    
    @Column({ default: false })
    kycVerified: boolean = false;
    
    @Column({ nullable: true })
    kycDocuments: string = '';
    
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    transactionFeePercent: number = 0;
    
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    fixedFeeAmount: number = 0;
    
    @Column({ default: 0 })
    dailyTransactionLimit: number = 0;
    
    @Column({ default: 0 })
    monthlyTransactionLimit: number = 0;
    
    @Column({ default: 0 })
    maxTransactionAmount: number = 0;
    
    @Column({ default: 0 })
    minTransactionAmount: number = 0;
    
    @Column({ default: true })
    autoSettlement: boolean = true;
    
    @Column({ nullable: true })
    settlementAddress: string = '';
    
    @Column({ nullable: true })
    ipWhitelist: string = '';
    
    @Column({ default: false })
    testMode: boolean = false;
    
    @Column({ nullable: true })
    created_by_id: string = '';
    
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
    
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
    
    // Helper method to check if merchant has reached daily transaction limit
    hasReachedDailyLimit(amount: number, currentDailyTotal: number): boolean {
      if (this.dailyTransactionLimit <= 0) return false; // No limit set
      return currentDailyTotal + amount > this.dailyTransactionLimit;
    }
    
    // Helper method to check if merchant has reached monthly transaction limit
    hasReachedMonthlyLimit(amount: number, currentMonthlyTotal: number): boolean {
      if (this.monthlyTransactionLimit <= 0) return false; // No limit set
      return currentMonthlyTotal + amount > this.monthlyTransactionLimit;
    }
    
    // Helper method to check if transaction amount is within allowed range
    isTransactionAmountAllowed(amount: number): boolean {
      if (this.minTransactionAmount > 0 && amount < this.minTransactionAmount) {
        return false;
      }
      if (this.maxTransactionAmount > 0 && amount > this.maxTransactionAmount) {
        return false;
      }
      return true;
    }
    
    // Calculate fee for a transaction
    calculateFee(amount: number): number {
      const percentFee = amount * (this.transactionFeePercent / 100);
      return percentFee + this.fixedFeeAmount;
    }
  }
  
  return {
    Merchant: MockMerchant,
    MerchantStatus: MockMerchantStatus,
    MerchantRiskLevel: MockMerchantRiskLevel
  };
});

// Mock the User entity to break circular dependency with AuditLog
jest.mock('../src/db/entities/User', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } = require('typeorm');
  
  enum UserRole {
    ADMIN = 'admin',
    OPERATOR = 'operator',
    VIEWER = 'viewer'
  }
  
  @Entity('users')
  class MockUser {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column({ length: 100 })
    firstName: string;
    
    @Column({ length: 100 })
    lastName: string;
    
    @Column({ unique: true })
    email: string;
    
    @Column()
    password: string;
    
    @Column({
      type: 'varchar',
      default: UserRole.VIEWER
    })
    role: UserRole;
    
    @Column({ default: false })
    isActive: boolean;
    
    @Column({ nullable: true, type: 'varchar' })
    lastLoginAt?: string;
    
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
    
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
    
    // No reference to AuditLog here to break the circular dependency
    
    async validatePassword(password: string): Promise<boolean> {
      return true; // Mock implementation
    }
    
    get fullName(): string {
      return `${this.firstName} ${this.lastName}`;
    }
  }
  
  return {
    User: MockUser,
    UserRole
  };
});

// Mock the IdempotencyKey entity to avoid SQLite compatibility issues with Date fields
jest.mock('../src/db/entities/IdempotencyKey', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } = require('typeorm');
  
  @Entity('idempotency_keys')
  class MockIdempotencyKey {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @Index({ unique: true })
    key: string;

    @Column({ nullable: true })
    merchantId: string;

    @Column()
    method: string;

    @Column()
    path: string;

    @Column({ type: 'simple-json', nullable: true })
    requestData: object;

    @Column({ nullable: true })
    response: string;

    @Column({ nullable: true, default: 200 })
    statusCode: number;

    @Column({ nullable: true, type: 'varchar' })
    completedAt: string;

    @Column({ nullable: true, type: 'varchar' })
    expiresAt: string;

    @CreateDateColumn()
    createdAt: string = new Date().toISOString();

    // Check if key is expired
    isExpired(): boolean {
      if (!this.expiresAt) return false;
      return new Date() > new Date(this.expiresAt);
    }
    
    // Helper method to create a new key instance
    static createInstance(key: string, method: string, path: string, expiresAt: string): MockIdempotencyKey {
      const idempotencyKey = new MockIdempotencyKey();
      idempotencyKey.key = key;
      idempotencyKey.method = method;
      idempotencyKey.path = path;
      idempotencyKey.expiresAt = expiresAt;
      return idempotencyKey;
    }
    
    // Helper method to prepare update data for a response
    static getResponseUpdateData(statusCode: number, response: string): Partial<MockIdempotencyKey> {
      return {
        statusCode,
        response,
        completedAt: new Date().toISOString()
      };
    }
  }
  
  return {
    IdempotencyKey: MockIdempotencyKey
  };
});

// Mock the AuditLog entity to avoid circular dependency issues and SQLite compatibility issues
jest.mock('../src/db/entities/AuditLog', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } = require('typeorm');
  
  // Define the enums from the original module
  enum MockAuditLogAction {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LOGIN = 'login',
    LOGOUT = 'logout',
    PAYMENT_RECEIVED = 'payment_received',
    PAYMENT_CONFIRMED = 'payment_confirmed',
    PAYMENT_SETTLED = 'payment_settled',
    ADDRESS_GENERATED = 'address_generated',
    ADDRESS_CREATED = 'address_created',
    ADDRESS_EXPIRED = 'address_expired',
    API_KEY_CREATED = 'api_key_created',
    API_KEY_REVOKED = 'api_key_revoked',
    WEBHOOK_CREATED = 'webhook_created',
    WEBHOOK_UPDATED = 'webhook_updated',
    WEBHOOK_DELETED = 'webhook_deleted',
    MERCHANT_CREATED = 'merchant_created',
    MERCHANT_UPDATED = 'merchant_updated',
    MERCHANT_STATUS_CHANGED = 'merchant_status_changed',
    MANUAL_TRANSACTION_OVERRIDE = 'manual_transaction_override',
    SYSTEM_ERROR = 'system_error',
    SECURITY_ALERT = 'security_alert',
    SETTLEMENT_TRIGGERED = 'settlement_triggered',
    SETTLEMENT_PROCESSED = 'settlement_processed',
    TRANSACTION_STATUS_UPDATED = 'transaction_status_updated',
    COLD_STORAGE_TRANSFER = 'cold_storage_transfer',
    COLD_STORAGE_TRANSFER_TRIGGERED = 'cold_storage_transfer_triggered'
  }
  
  enum MockAuditLogEntityType {
    USER = 'user',
    MERCHANT = 'merchant',
    PAYMENT_ADDRESS = 'payment_address',
    TRANSACTION = 'transaction',
    WEBHOOK = 'webhook',
    API_KEY = 'api_key',
    SYSTEM = 'system'
  }
  
  @Entity('audit_logs')
  class MockAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
    
    @Column({ type: 'varchar' })
    action: string = '';
    
    @Column({ type: 'varchar' })
    entityType: string = '';
    
    @Column({ type: 'varchar', nullable: true })
    @Index()
    entityId: string | null = null;
    
    @Column({ type: 'simple-json', nullable: true })
    previousState: any | null = null;
    
    @Column({ type: 'simple-json', nullable: true })
    newState: any | null = null;
    
    @Column({ type: 'varchar', nullable: true })
    description: string = '';
    
    @Column({ type: 'varchar', nullable: true })
    ipAddress: string | null = null;
    
    @Column({ type: 'varchar', nullable: true })
    userAgent: string | null = null;
    
    @Column({ type: 'varchar', nullable: true })
    userId: string | null = null;
    
    @Column({ type: 'varchar', nullable: true })
    merchantId: string | null = null;
    
    @CreateDateColumn()
    @Index()
    createdAt: string = new Date().toISOString();
    
    static create(params: any) {
      const auditLog = new MockAuditLog();
      Object.assign(auditLog, params);
      return auditLog;
    }
  }
  
  return {
    AuditLog: MockAuditLog,
    AuditLogAction: MockAuditLogAction,
    AuditLogEntityType: MockAuditLogEntityType
  };
});

// Mock the ApiKey entity to avoid SQLite compatibility issues with enum types
jest.mock('../src/db/entities/ApiKey', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert } = require('typeorm');
  const crypto = require('crypto');
  
  // Define the enums from the original module
  enum MockApiKeyStatus {
    ACTIVE = 'active',
    REVOKED = 'revoked',
    EXPIRED = 'expired'
  }
  
  @Entity('api_keys')
  class MockApiKey {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
    
    @Column()
    key: string = '';
    
    @Column()
    secret: string = '';
    
    @Column({ nullable: true })
    description: string = '';
    
    @Column({ type: 'varchar' })
    status: string = MockApiKeyStatus.ACTIVE;
    
    @Column({ nullable: true, type: 'varchar' })
    expiresAt: string | null = null;
    
    @Column({ nullable: true, type: 'varchar' })
    lastUsedAt: string | null = null;
    
    @Column({ default: 0 })
    usageCount: number = 0;
    
    @Column({ nullable: true })
    ipRestrictions: string = '';
    
    @Column({ default: false })
    readOnly: boolean = false;
    
    @Column({ nullable: true, type: 'simple-json' })
    permissions: object | null = null;
    
    @Column()
    merchantId: string = '';
    
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
    
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
    
    // Generate a new API key and secret
    generateKeyAndSecret() {
      if (!this.key) {
        this.key = `pk_${crypto.randomBytes(16).toString('hex')}`;
      }
      if (!this.secret) {
        const rawSecret = `sk_${crypto.randomBytes(32).toString('hex')}`;
        // Store hashed version of secret
        this.secret = crypto.createHash('sha256').update(rawSecret).digest('hex');
        // The raw secret should be returned to the user once and never stored
        (this as any).rawSecret = rawSecret;
      }
    }
    
    // Check if API key is expired
    isExpired(): boolean {
      if (!this.expiresAt) return false;
      return new Date() > new Date(this.expiresAt);
    }
    
    // Check if API key is valid
    isValid(): boolean {
      return this.status === MockApiKeyStatus.ACTIVE && !this.isExpired();
    }
    
    // Update last used timestamp
    updateLastUsed(): void {
      this.lastUsedAt = new Date().toISOString();
      this.usageCount += 1;
    }
    
    // Verify if IP is allowed
    isIpAllowed(ip: string): boolean {
      if (!this.ipRestrictions) return true;
      const allowedIps = this.ipRestrictions.split(',').map(i => i.trim());
      return allowedIps.includes(ip);
    }
    
    // Revoke API key
    revoke(): void {
      this.status = MockApiKeyStatus.REVOKED;
    }
    
    // Verify API key secret
    verifySecret(secret: string): boolean {
      const hash = crypto.createHash('sha256').update(secret).digest('hex');
      return this.secret === hash;
    }
  }
  
  return {
    ApiKey: MockApiKey,
    ApiKeyStatus: MockApiKeyStatus
  };
});

// Mock the PaymentAddress entity to avoid SQLite compatibility issues with enum types
jest.mock('../src/db/entities/PaymentAddress', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } = require('typeorm');
  
  // Define the enums from the original module
  enum MockAddressStatus {
    ACTIVE = 'active',
    EXPIRED = 'expired',
    USED = 'used',
    BLACKLISTED = 'blacklisted'
  }
  
  enum MockAddressType {
    MERCHANT_PAYMENT = 'merchant_payment',
    HOT_WALLET = 'hot_wallet',
    COLD_WALLET = 'cold_wallet',
    SETTLEMENT = 'settlement'
  }
  
  @Entity('payment_addresses')
  class MockPaymentAddress {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
    
    @Column()
    @Index({ unique: true })
    address: string = '';
    
    @Column({ nullable: true })
    privateKey: string = '';
    
    @Column({ nullable: true })
    hdPath: string = '';
    
    @Column({ type: 'varchar' })
    status: string = MockAddressStatus.ACTIVE;
    
    @Column({ type: 'varchar' })
    type: string = MockAddressType.MERCHANT_PAYMENT;
    
    @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
    expectedAmount: number = 0;
    
    @Column({ nullable: true })
    currency: string = '';
    
    @Column({ type: 'varchar', nullable: true })
    expiresAt: string | null = null;
    
    @Column({ default: false })
    isMonitored: boolean = false;
    
    @Column({ nullable: true })
    callbackUrl: string = '';
    
    @Column({ nullable: true, type: 'simple-json' })
    metadata: object | null = null;
    
    @Column({ nullable: true })
    merchantId: string = '';
    
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
    
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
    
    // Check if address is expired
    isExpired(): boolean {
      if (!this.expiresAt) return false;
      return new Date() > new Date(this.expiresAt);
    }
    
    // Mark address as expired
    markAsExpired(): void {
      this.status = MockAddressStatus.EXPIRED;
    }
    
    // Mark address as used
    markAsUsed(): void {
      this.status = MockAddressStatus.USED;
    }
    
    // Check if address is valid for payment
    isValidForPayment(): boolean {
      if (this.status !== MockAddressStatus.ACTIVE) return false;
      if (this.isExpired()) return false;
      return true;
    }
  }
  
  return {
    PaymentAddress: MockPaymentAddress,
    AddressStatus: MockAddressStatus,
    AddressType: MockAddressType
  };
});

// Mock the Transaction entity to avoid SQLite compatibility issues with enum types
jest.mock('../src/db/entities/Transaction', () => {
  const { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } = require('typeorm');
  
  // Define the enums from the original module
  enum MockTransactionStatus {
    PENDING = 'pending',
    CONFIRMING = 'confirming',
    CONFIRMED = 'confirmed',
    FAILED = 'failed',
    EXPIRED = 'expired',
    SETTLED = 'settled',
    COMPLETED = 'completed',
    UNDERPAID = 'underpaid'
  }
  
  enum MockTransactionType {
    PAYMENT = 'payment',
    REFUND = 'refund',
    SETTLEMENT = 'settlement',
    FEE = 'fee',
    TRANSFER = 'transfer'
  }
  
  @Entity('transactions')
  class MockTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string = '';
    
    @Column({ unique: true })
    txHash: string = '';
    
    @Column({ type: 'varchar' })
    status: string = MockTransactionStatus.PENDING;
    
    @Column({ type: 'varchar' })
    type: string = MockTransactionType.PAYMENT;
    
    @Column({ type: 'decimal', precision: 18, scale: 8 })
    amount: number = 0;
    
    @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
    feeAmount: number = 0;
    
    @Column()
    currency: string = '';
    
    @Column({ nullable: true })
    fromAddress: string = '';
    
    @Column()
    toAddress: string = '';
    
    @Column({ default: 0 })
    confirmations: number = 0;
    
    @Column({ nullable: true })
    blockNumber?: number;
    
    @Column({ nullable: true })
    blockHash?: string;
    
    @Column({ nullable: true, type: 'varchar' })
    blockTimestamp?: string;
    
    @Column({ default: false })
    webhookSent: boolean = false;
    
    @Column({ nullable: true })
    webhookResponse?: string;
    
    @Column({ nullable: true })
    settlementTxHash?: string;
    
    @Column({ nullable: true, type: 'simple-json' })
    metadata?: object;
    
    @Column({ nullable: true })
    @Index()
    externalId?: string;
    
    @Column({ nullable: true })
    merchantId: string = '';
    
    @Column({ nullable: true })
    paymentAddressId: string = '';
    
    @CreateDateColumn()
    createdAt: string = new Date().toISOString();
    
    @UpdateDateColumn()
    updatedAt: string = new Date().toISOString();
    
    // Check if transaction is fully confirmed
    isFullyConfirmed(requiredConfirmations: number): boolean {
      return this.confirmations >= requiredConfirmations;
    }
    
    // Mark transaction as confirmed
    markAsConfirmed(): void {
      this.status = MockTransactionStatus.CONFIRMED;
    }
    
    // Mark transaction as settled
    markAsSettled(settlementTxHash: string): void {
      this.status = MockTransactionStatus.SETTLED;
      this.settlementTxHash = settlementTxHash;
    }
    
    // Calculate net amount (after fees)
    getNetAmount(): number {
      return this.amount - this.feeAmount;
    }
  }
  
  return {
    Transaction: MockTransaction,
    TransactionStatus: MockTransactionStatus,
    TransactionType: MockTransactionType
  };
});

// Export the entities we've mocked so far
// This prevents "Cannot find name" TypeScript errors
export const {
  AuditLog,
  AuditLogAction,
  AuditLogEntityType,
} = jest.requireMock('../src/db/entities/AuditLog');

export const {
  ApiKey,
  ApiKeyStatus,
} = jest.requireMock('../src/db/entities/ApiKey');

export const {
  PaymentAddress,
  AddressStatus,
  AddressType,
} = jest.requireMock('../src/db/entities/PaymentAddress');

export const {
  Transaction,
  TransactionStatus,
  TransactionType,
} = jest.requireMock('../src/db/entities/Transaction');

export const {
  Merchant,
  MerchantStatus,
  MerchantRiskLevel,
} = jest.requireMock('../src/db/entities/Merchant');

export const {
  User,
  UserRole,
} = jest.requireMock('../src/db/entities/User');

export const {
  Webhook,
  WebhookEvent,
  WebhookStatus,
} = jest.requireMock('../src/db/entities/Webhook');

export const {
  IdempotencyKey,
} = jest.requireMock('../src/db/entities/IdempotencyKey');

// Set up aliases for the mocked modules to avoid circular dependencies
jest.mock('../src/db/entities/Transaction');
jest.mock('../src/db/entities/PaymentAddress');
jest.mock('../src/db/entities/ApiKey');
jest.mock('../src/db/entities/Merchant');
jest.mock('../src/db/entities/User');
jest.mock('../src/db/entities/AuditLog');
jest.mock('../src/db/entities/IdempotencyKey');

// Mock external services
jest.mock('../src/services/blockchainService', () => ({
  BlockchainService: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue('1000000000000000000'),
    getTransaction: jest.fn().mockResolvedValue({
      hash: '0x123456789abcdef',
      from: '0xsender',
      to: '0xrecipient',
      value: '1000000000000000000',
      blockNumber: 12345678,
      confirmations: 10
    }),
    sendTransaction: jest.fn().mockResolvedValue('0xtransactionhash'),
    generateWallet: jest.fn().mockReturnValue({
      address: '0xnewaddress',
      privateKey: '0xprivatekey'
    }),
    validateAddress: jest.fn().mockReturnValue(true),
    subscribeToAddress: jest.fn(),
    unsubscribeFromAddress: jest.fn()
  }))
}));

jest.mock('../src/services/webhookService', () => ({
  WebhookService: jest.fn().mockImplementation(() => ({
    sendWebhook: jest.fn().mockResolvedValue(true),
    retryFailedWebhooks: jest.fn().mockResolvedValue(true)
  }))
}));

// Mock QueueService to prevent RabbitMQ connection errors
jest.mock('../src/services/queueService', () => {
  // Define the type for queue callbacks
  type QueueCallback = (data: any) => Promise<any>;
  type QueueCallbacks = { [queueName: string]: QueueCallback };
  
  // Create a singleton instance that will be shared across all tests
  const mockQueueServiceInstance = {
    initialize: jest.fn().mockResolvedValue(true),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    addToQueue: jest.fn().mockResolvedValue(true),
    consumeQueue: jest.fn().mockImplementation((queueName: string, callback: QueueCallback) => {
      // Store the callback for direct execution in tests
      if (!mockQueueServiceInstance.queueCallbacks) {
        mockQueueServiceInstance.queueCallbacks = {};
      }
      mockQueueServiceInstance.queueCallbacks[queueName] = callback;
      return Promise.resolve(true);
    }),
    checkQueueHealth: jest.fn().mockResolvedValue(true),
    purgeQueue: jest.fn().mockResolvedValue(true),
    // Add processDirectly method for the E2E tests
    processDirectly: jest.fn().mockImplementation(async (queue: string, data: any) => {
      console.log(`Mock processing message for queue: ${queue}`);
      // If we have a registered callback for this queue, execute it
      if (mockQueueServiceInstance.queueCallbacks && mockQueueServiceInstance.queueCallbacks[queue]) {
        try {
          return await mockQueueServiceInstance.queueCallbacks[queue](data);
        } catch (error) {
          console.error(`Error processing queue message for ${queue}:`, error);
          throw error;
        }
      }
      return true;
    }),
    // Store queue callbacks with proper typing
    queueCallbacks: {} as QueueCallbacks
  };
  
  // Create a proper mock class with a static getInstance method
  class MockQueueService {
    static instance = mockQueueServiceInstance;
    
    constructor() {
      return MockQueueService.instance;
    }
    
    static getInstance() {
      return MockQueueService.instance;
    }
  }
  
  // Make the instance look like an instance of MockQueueService
  Object.setPrototypeOf(mockQueueServiceInstance, MockQueueService.prototype);
  
  return {
    QueueService: MockQueueService
  };
});  

// Mock any other services that might try to connect to external resources
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Create a test database connection before tests
let connection: Connection;

beforeAll(async () => {
  const { MockWebhook } = jest.requireMock('../src/db/entities/Webhook');
  
  // Use an in-memory SQLite database for testing
  connection = await createConnection({
    type: 'sqlite',
    database: ':memory:',
    entities: [
      User,
      Merchant,
      ApiKey,
      PaymentAddress,
      Transaction,
      MockWebhook,
      AuditLog,
      IdempotencyKey
    ],
    synchronize: true,
    dropSchema: true,
    logging: false
  });
});

// Close the connection after all tests
afterAll(async () => {
  if (connection && connection.isConnected) {
    await connection.close();
  }
});

// Clear all tables between tests
afterEach(async () => {
  if (connection && connection.isConnected) {
    const entities = connection.entityMetadatas;
    for (const entity of entities) {
      try {
        const repository = connection.getRepository(entity.name);
        await repository.clear();
      } catch (error) {
        // Silently ignore errors during cleanup
      }
    }
  }
});