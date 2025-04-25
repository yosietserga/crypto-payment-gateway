/**
 * Crypto Payment Gateway - End-to-End Binance Service Flow Tests
 * 
 * This file contains tests that validate the complete workflow of sending and receiving
 * USDT through Binance integration, including database connections, API interactions,
 * webhook services, and the full transaction lifecycle.
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { getConnection } from '../../src/db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../src/db/entities/Transaction';
import { WebhookService } from '../../src/services/webhookService';
import { QueueService } from '../../src/services/queueService';
import { BinanceService } from '../../src/services/binanceService';
import { WebhookEvent } from '../../src/db/entities/Webhook';

dotenv.config();

// Mock webhook receiver to validate notifications
const mockWebhookServer = {
  receivedWebhooks: [] as any[],
  getWebhooks: () => mockWebhookServer.receivedWebhooks,
  reset: () => { mockWebhookServer.receivedWebhooks = []; },
  addWebhook: (data: any) => mockWebhookServer.receivedWebhooks.push(data)
};

// Configuration for tests
const CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
  apiKey: process.env.TEST_API_KEY || 'test-api-key',
  testBinanceApiKey: process.env.BINANCE_API_KEY,
  testBinanceApiSecret: process.env.BINANCE_API_SECRET,
  testAmount: '0.01',
  testRecipientAddress: process.env.TEST_RECIPIENT_ADDRESS || '0x1234567890abcdef1234567890abcdef12345678',
  merchantId: process.env.TEST_MERCHANT_ID || '00000000-0000-0000-0000-000000000001',
  currency: 'USDT',
  network: 'BSC',
  testTimeoutMs: 60000, // 1 minute timeout for tests
};

// Helper function to create a test transaction in the database
async function createTestTransaction(type: TransactionType, status: TransactionStatus = TransactionStatus.PENDING) {
  const connection = await getConnection();
  const transactionRepository = connection.getRepository(Transaction);
  
  const transaction = transactionRepository.create({
    id: uuidv4(),
    type: type,
    status: status,
    amount: parseFloat(CONFIG.testAmount),
    currency: CONFIG.currency,
    network: CONFIG.network,
    merchantId: CONFIG.merchantId,
    webhookUrl: 'http://localhost:3001/webhook',
    callbackUrl: 'http://localhost:3001/callback',
    metadata: { test: true, timestamp: Date.now() }
  });
  
  if (type === TransactionType.PAYOUT) {
    transaction.recipientAddress = CONFIG.testRecipientAddress;
  }
  
  await transactionRepository.save(transaction);
  return transaction;
}

// Helper function to wait for a condition
async function waitForCondition(conditionFn: () => Promise<boolean>, timeoutMs = 30000, intervalMs = 1000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms timeout`);
}

// Helper function to check transaction status
async function getTransactionStatus(transactionId: string) {
  const connection = await getConnection();
  const transactionRepository = connection.getRepository(Transaction);
  const transaction = await transactionRepository.findOne({
    where: { id: transactionId }
  });
  return transaction;
}

// Setup webhook mock server
let webhookServer: any;
function setupWebhookMockServer() {
  return new Promise<void>((resolve) => {
    const app = express();
    app.use(express.json());
    
    app.post('/webhook', (req, res) => {
      mockWebhookServer.addWebhook(req.body);
      res.status(200).json({ success: true });
    });
    
    app.post('/callback', (req, res) => {
      mockWebhookServer.addWebhook(req.body);
      res.status(200).json({ success: true });
    });
    
    webhookServer = app.listen(3001, () => {
      console.log('Webhook mock server running on port 3001');
      resolve();
    });
  });
}

// Initialize Binance service with real credentials
function initializeBinanceService() {
  // Store original env values
  const originalEnv = { ...process.env };
  
  // Set required env variables
  process.env.BINANCE_API_KEY = CONFIG.testBinanceApiKey;
  process.env.BINANCE_API_SECRET = CONFIG.testBinanceApiSecret;
  
  const binanceService = new BinanceService();
  
  // Return function to restore original env
  return {
    binanceService,
    restoreEnv: () => {
      process.env = originalEnv;
    }
  };
}

// Check if we have valid Binance API credentials
function hasBinanceCredentials(): boolean {
  return Boolean(CONFIG.testBinanceApiKey && CONFIG.testBinanceApiSecret);
}

// Patch the QueueService to process messages directly for testing
function patchQueueService() {
  const originalAddToQueue = QueueService.prototype.addToQueue;
  
  // Override the addToQueue method to process messages directly
  QueueService.prototype.addToQueue = async function(queue: string, data: any) {
    console.log(`Processing message directly for queue: ${queue}`);
    await this.processDirectly(queue, data);
    return true;
  };
  
  // Return function to restore original method
  return () => {
    QueueService.prototype.addToQueue = originalAddToQueue;
  };
}

// Test suite
describe('Binance Service E2E Tests', () => {
  let restoreQueueService: (() => void) | undefined;
  let binanceService: BinanceService | undefined;
  let restoreEnv: (() => void) | undefined;
  
  beforeAll(async () => {
    // Setup mock webhook server
    await setupWebhookMockServer();
    
    // Patch QueueService to process messages directly
    restoreQueueService = patchQueueService();
    
    // Initialize Binance service
    if (hasBinanceCredentials()) {
      const binanceSetup = initializeBinanceService();
      binanceService = binanceSetup.binanceService;
      restoreEnv = binanceSetup.restoreEnv;
    }
  });
  
  afterAll(async () => {
    // Restore QueueService
    if (restoreQueueService) {
      restoreQueueService();
    }
    
    // Restore environment
    if (restoreEnv) {
      restoreEnv();
    }
    
    // Close webhook server
    if (webhookServer) {
      await new Promise<void>(resolve => webhookServer.close(resolve));
    }
  });
  
  beforeEach(() => {
    // Reset mock webhook receiver
    mockWebhookServer.reset();
  });
  
  // Test the complete payout flow
  test('Complete payout flow from wallet to external address', async () => {
    // Skip test if no Binance credentials
    if (!hasBinanceCredentials()) {
      console.log('Skipping test: No Binance API credentials available');
      return;
    }
    
    // Set longer timeout for E2E test
    jest.setTimeout(CONFIG.testTimeoutMs);
    
    if (!binanceService) {
      throw new Error('BinanceService is not initialized');
    }
    
    // Step 1: Verify connection to Binance API
    const balance = await binanceService.getAssetBalance(CONFIG.currency);
    expect(balance).toBeDefined();
    expect(parseFloat(balance.free)).toBeGreaterThanOrEqual(0);
    
    // Make sure we have enough balance for test
    const requiredBalance = parseFloat(CONFIG.testAmount) * 1.1; // Add 10% for fees
    if (parseFloat(balance.free) < requiredBalance) {
      console.log(`Skipping withdrawal test: Insufficient balance (${balance.free} < ${requiredBalance})`);
      return;
    }
    
    // Step 2: Create a PAYOUT transaction in the database
    const transaction = await createTestTransaction(TransactionType.PAYOUT);
    expect(transaction).toBeDefined();
    expect(transaction.id).toBeDefined();
    expect(transaction.status).toBe(TransactionStatus.PENDING);
    
    // Step 3: Create QueueService instance
    const queueService = QueueService.getInstance();
    await queueService.initialize();
    
    // Step 4: Create WebhookService instance
    const webhookService = new WebhookService(queueService);
    
    // Step 5: Process the payout through the queue
    await queueService.addToQueue('binance.payout', {
      transactionId: transaction.id,
      amount: parseFloat(CONFIG.testAmount),
      recipientAddress: CONFIG.testRecipientAddress,
      currency: CONFIG.currency,
      network: CONFIG.network
    });
    
    // Step 6: Verify transaction status changes to CONFIRMING then COMPLETED
    await waitForCondition(async () => {
      const tx = await getTransactionStatus(transaction.id);
      return tx?.status === TransactionStatus.CONFIRMING || tx?.status === TransactionStatus.COMPLETED;
    }, 30000);
    
    // Step 7: Verify transaction status eventually becomes COMPLETED
    await waitForCondition(async () => {
      const tx = await getTransactionStatus(transaction.id);
      return tx?.status === TransactionStatus.COMPLETED;
    }, 30000);
    
    // Step 8: Verify the transaction has a txHash from Binance
    const completedTx = await getTransactionStatus(transaction.id);
    expect(completedTx?.txHash).toBeDefined();
    expect(completedTx?.txHash).not.toBe('');
    
    // Step 9: Verify that webhook notifications were sent
    expect(mockWebhookServer.getWebhooks().length).toBeGreaterThan(0);
    
    // Find the completion webhook
    const completionWebhook = mockWebhookServer.getWebhooks().find(
      webhook => webhook.event === WebhookEvent.PAYOUT_COMPLETED
    );
    
    expect(completionWebhook).toBeDefined();
    expect(completionWebhook?.data.id).toBe(transaction.id);
    expect(completionWebhook?.data.status).toBe(TransactionStatus.COMPLETED);
  });
  
  // Test receiving a deposit (incoming USDT)
  test('Receiving USDT deposit from external source', async () => {
    // Skip test if no Binance credentials
    if (!hasBinanceCredentials()) {
      console.log('Skipping test: No Binance API credentials available');
      return;
    }
    
    // Set longer timeout for E2E test
    jest.setTimeout(CONFIG.testTimeoutMs);
    
    if (!binanceService) {
      throw new Error('BinanceService is not initialized');
    }
    
    // Step 1: Verify connection to Binance API
    const balance = await binanceService.getAssetBalance(CONFIG.currency);
    expect(balance).toBeDefined();
    
    // Step 2: Get deposit address for receiving USDT
    const depositAddress = await binanceService.getDepositAddress(CONFIG.currency, CONFIG.network);
    expect(depositAddress).toBeDefined();
    expect(depositAddress.address).toBeDefined();
    expect(depositAddress.address.length).toBeGreaterThan(10); // Basic validation of address format
    
    // Step 3: Create a PAYMENT transaction in the database for tracking deposit
    const transaction = await createTestTransaction(TransactionType.PAYMENT);
    expect(transaction).toBeDefined();
    expect(transaction.status).toBe(TransactionStatus.PENDING);
    
    // Step 4: This part requires manual intervention in a real scenario
    // User would need to send actual USDT to the deposit address
    console.log(`To complete this test manually, send ${CONFIG.testAmount} USDT to ${depositAddress.address} on ${CONFIG.network} network`);
    
    // For automated testing, we'll simulate receiving a deposit by updating the transaction directly
    // This bypasses the real blockchain transaction but allows testing the remaining flow
    const connection = await getConnection();
    const transactionRepository = connection.getRepository(Transaction);
    
    // Update transaction to simulate receiving funds
    transaction.status = TransactionStatus.CONFIRMING;
    transaction.txHash = `simulatedTxHash-${Date.now()}`;
    await transactionRepository.save(transaction);
    
    // Step 5: Create QueueService instance if not already created
    const queueService = QueueService.getInstance();
    await queueService.initialize();
    
    // Step 6: Create WebhookService instance
    const webhookService = new WebhookService(queueService);
    
    // Step 7: Send webhook notification for the deposit
    await webhookService.sendWebhookNotification(
      transaction.merchantId,
      WebhookEvent.PAYMENT_RECEIVED,
      {
        id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        txHash: transaction.txHash
      }
    );
    
    // Step 8: Update transaction to CONFIRMED to simulate confirmation
    transaction.status = TransactionStatus.CONFIRMED;
    transaction.confirmations = 12; // Simulate blockchain confirmations
    await transactionRepository.save(transaction);
    
    // Step 9: Send webhook notification for the confirmation
    await webhookService.sendWebhookNotification(
      transaction.merchantId,
      WebhookEvent.PAYMENT_CONFIRMED,
      {
        id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        txHash: transaction.txHash,
        confirmations: transaction.confirmations
      }
    );
    
    // Step 10: Verify webhook notifications were sent
    expect(mockWebhookServer.getWebhooks().length).toBeGreaterThan(0);
    
    // Find the confirmation webhook
    const confirmationWebhook = mockWebhookServer.getWebhooks().find(
      webhook => webhook.event === WebhookEvent.PAYMENT_CONFIRMED
    );
    
    expect(confirmationWebhook).toBeDefined();
    expect(confirmationWebhook?.data.id).toBe(transaction.id);
    expect(confirmationWebhook?.data.status).toBe(TransactionStatus.CONFIRMED);
  });
  
  // Test error handling for payout with insufficient funds
  test('Error handling for payout with insufficient funds', async () => {
    // Skip test if no Binance credentials
    if (!hasBinanceCredentials()) {
      console.log('Skipping test: No Binance API credentials available');
      return;
    }
    
    // Set longer timeout for E2E test
    jest.setTimeout(CONFIG.testTimeoutMs);
    
    // Step 1: Create a PAYOUT transaction with a very large amount that exceeds balance
    const transaction = await createTestTransaction(TransactionType.PAYOUT);
    
    // Update the transaction to have a very large amount
    const connection = await getConnection();
    const transactionRepository = connection.getRepository(Transaction);
    transaction.amount = 999999; // Very large amount that will exceed any test account balance
    await transactionRepository.save(transaction);
    
    // Step 2: Create QueueService instance
    const queueService = QueueService.getInstance();
    await queueService.initialize();
    
    // Step 3: Create WebhookService instance
    const webhookService = new WebhookService(queueService);
    
    // Step 4: Process the payout through the queue, which should fail
    await queueService.addToQueue('binance.payout', {
      transactionId: transaction.id,
      amount: transaction.amount,
      recipientAddress: CONFIG.testRecipientAddress,
      currency: CONFIG.currency,
      network: CONFIG.network
    });
    
    // Step 5: Verify transaction status changes to FAILED
    await waitForCondition(async () => {
      const tx = await getTransactionStatus(transaction.id);
      return tx?.status === TransactionStatus.FAILED;
    }, 30000);
    
    // Step 6: Verify error details are stored in metadata
    const failedTx = await getTransactionStatus(transaction.id);
    expect(failedTx?.metadata).toBeDefined();
    expect(failedTx?.metadata?.error).toBeDefined();
    
    // Step 7: Verify that a failure webhook was sent
    const failureWebhook = mockWebhookServer.getWebhooks().find(
      webhook => webhook.event === WebhookEvent.PAYOUT_FAILED
    );
    
    expect(failureWebhook).toBeDefined();
    expect(failureWebhook?.data.id).toBe(transaction.id);
    expect(failureWebhook?.data.status).toBe(TransactionStatus.FAILED);
    expect(failureWebhook?.data.error).toBeDefined();
  });
  
  // Test binance service methods directly
  test('Direct Binance service method tests', async () => {
    // Skip test if no Binance credentials
    if (!hasBinanceCredentials()) {
      console.log('Skipping test: No Binance API credentials available');
      return;
    }
    
    if (!binanceService) {
      throw new Error('BinanceService is not initialized');
    }
    
    // 1. Test getAssetBalance
    const balance = await binanceService.getAssetBalance(CONFIG.currency);
    expect(balance).toBeDefined();
    expect(balance.free).toBeDefined();
    expect(balance.locked).toBeDefined();
    expect(balance.total).toBeDefined();
    
    // 2. Test getDepositAddress
    const depositAddress = await binanceService.getDepositAddress(CONFIG.currency, CONFIG.network);
    expect(depositAddress).toBeDefined();
    expect(depositAddress.address).toBeDefined();
    
    // 3. Test getWithdrawalHistory
    const withdrawalHistory = await binanceService.getWithdrawalHistory(CONFIG.currency);
    expect(Array.isArray(withdrawalHistory)).toBe(true);
  });
});

// Instructions for running the tests:
/*
 1. Make sure the crypto payment gateway server is running
 2. Set the required environment variables:
    - TEST_API_KEY: API key for authentication
    - BINANCE_API_KEY: Valid Binance API key
    - BINANCE_API_SECRET: Valid Binance API secret
    - TEST_RECIPIENT_ADDRESS: Valid BEP20 address for receiving USDT
    - TEST_MERCHANT_ID: Valid merchant ID in the system
 3. Run the tests with: npm test -- tests/e2e/binance-service-flow.test.ts
*/ 