import { QueueService } from '../../../src/services/queueService';
import { BinanceService } from '../../../src/services/binanceService';
import { WebhookService } from '../../../src/services/webhookService';
import { getConnection } from '../../../src/db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../../src/db/entities/Transaction';
import { WebhookEvent } from '../../../src/db/entities/Webhook';
import amqplib from 'amqplib';

jest.mock('amqplib');
jest.mock('../../../src/services/binanceService');
jest.mock('../../../src/services/webhookService');
jest.mock('../../../src/db/connection');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('QueueService', () => {
  let queueService: QueueService;
  let mockConnection: any;
  let mockChannel: any;
  let mockWebhookService: any;
  let mockBinanceService: any;
  let mockTransactionRepository: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock connection and channel
    mockChannel = {
      assertQueue: jest.fn().mockResolvedValue({}),
      sendToQueue: jest.fn(),
      consume: jest.fn().mockImplementation((queueName, callback) => {
        // Store the callback for later use in tests
        mockChannel.callbacks = mockChannel.callbacks || {};
        mockChannel.callbacks[queueName] = callback;
        return { consumerTag: 'mock-consumer' };
      }),
      ack: jest.fn(),
      nack: jest.fn()
    };
    
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn()
    };
    
    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);
    
    // Mock transaction repository
    mockTransactionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn()
    };
    
    // Mock database connection
    const dbConnection = {
      getRepository: jest.fn().mockReturnValue(mockTransactionRepository)
    };
    (getConnection as jest.Mock).mockResolvedValue(dbConnection);
    
    // Mock webhook service
    mockWebhookService = {
      sendWebhook: jest.fn().mockResolvedValue({}),
      handleWebhookError: jest.fn()
    };
    
    // Mock binance service
    mockBinanceService = {
      withdrawFunds: jest.fn().mockResolvedValue({
        id: 'withdrawal123',
        amount: '100',
        transactionFee: '1',
        status: 'PROCESSING'
      })
    };
    
    // Initialize the service with constructor parameters
    queueService = new QueueService();
    // Assign the dependencies directly to the instance
    (queueService as any)['webhookService'] = mockWebhookService;
    (queueService as any)['binanceService'] = mockBinanceService;
    // Initialize the channel property to avoid errors in afterEach
    (queueService as any)['channel'] = null;
  });
  
  afterEach(async () => {
    // Close channel and connection if they were created
    if (queueService && (queueService as any)['channel']) {
      await queueService.close();
    }
  });
  
  describe('initialize', () => {
    it('should connect to RabbitMQ and set up consumers', async () => {
      await queueService.initialize();
      
      expect(amqplib.connect).toHaveBeenCalledWith(expect.any(String));
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalledTimes(3); // 3 queues should be set up
      expect(mockChannel.consume).toHaveBeenCalledTimes(3); // 3 consumers should be set up
    });
    
    it('should handle connection errors', async () => {
      const error = new Error('Connection error');
      (amqplib.connect as jest.Mock).mockRejectedValueOnce(error);
      
      await expect(queueService.initialize()).rejects.toThrow('Failed to initialize queue service');
    });
  });
  
  describe('addToQueue', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });
    
    it('should add message to queue', async () => {
      const queueName = 'test.queue';
      const message = { id: '123', data: 'test' };
      
      await queueService.addToQueue(queueName, message);
      
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(queueName, expect.any(Object));
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        queueName,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
    
    it('should handle errors when adding to queue', async () => {
      const error = new Error('Send error');
      mockChannel.sendToQueue.mockImplementationOnce(() => {
        throw error;
      });
      
      await expect(queueService.addToQueue('test.queue', {})).rejects.toThrow('Failed to add message to queue');
    });
  });
  
  describe('consumeQueue', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });
    
    it('should set up consumer for queue', async () => {
      const queueName = 'test.consumer';
      const mockCallback = jest.fn();
      
      await queueService.consumeQueue(queueName, mockCallback);
      
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(queueName, expect.any(Object));
      expect(mockChannel.consume).toHaveBeenCalledWith(queueName, expect.any(Function));
    });
  });
  
  describe('setupBinancePayoutConsumer', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });
    
    it('should process valid payout message', async () => {
      // Mock data
      const transactionId = 'tx123';
      const mockTransaction = {
        id: transactionId,
        status: TransactionStatus.PENDING,
        type: TransactionType.PAYOUT,
        amount: 100,
        asset: 'USDT',
        recipientAddress: '0x1234567890',
        merchantId: 'merchant123',
        webhookUrl: 'https://example.com/webhook',
        network: 'BSC',
        save: jest.fn().mockResolvedValue({}),
        error: '',
        externalId: ''
      };
      
      // Mock finding the transaction
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      
      // Create a mock message
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ transactionId })),
        properties: { messageId: 'msg123' }
      };
      
      // Trigger the Binance payout consumer
      if (mockChannel.callbacks && mockChannel.callbacks['binance.payout']) {
        await mockChannel.callbacks['binance.payout'](mockMsg);
      }
      
      // Expectations
      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: transactionId }
      });
      
      // Should update status to PROCESSING
      expect(mockTransaction.status).toBe('PROCESSING');
      expect(mockTransaction.save).toHaveBeenCalled();
      
      // Should send webhook for PROCESSING status
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith(
        mockTransaction.webhookUrl,
        expect.objectContaining({
          event: WebhookEvent.PAYOUT_PROCESSING,
          data: expect.objectContaining({
            transactionId,
            status: 'PROCESSING'
          })
        })
      );
      
      // Should call BinanceService to withdraw funds
      expect(mockBinanceService.withdrawFunds).toHaveBeenCalledWith(
        mockTransaction.asset,
        mockTransaction.network,
        mockTransaction.recipientAddress,
        mockTransaction.amount,
        mockTransaction.id
      );
      
      // Should update transaction with withdrawal information
      expect(mockTransaction.externalId).toBe('withdrawal123');
      
      // Should update status to COMPLETED and save
      expect(mockTransaction.status).toBe('COMPLETED');
      expect(mockTransaction.save).toHaveBeenCalledTimes(2);
      
      // Should send webhook for COMPLETED status
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith(
        mockTransaction.webhookUrl,
        expect.objectContaining({
          event: WebhookEvent.PAYOUT_COMPLETED,
          data: expect.objectContaining({
            transactionId,
            status: 'COMPLETED'
          })
        })
      );
      
      // Should acknowledge the message
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });
    
    it('should handle transaction not found', async () => {
      // Mock finding no transaction
      mockTransactionRepository.findOne.mockResolvedValue(null);
      
      // Create a mock message
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ transactionId: 'non-existent' })),
        properties: { messageId: 'msg123' }
      };
      
      // Trigger the Binance payout consumer
      if (mockChannel.callbacks && mockChannel.callbacks['binance.payout']) {
        await mockChannel.callbacks['binance.payout'](mockMsg);
      }
      
      // Should acknowledge the message even if transaction not found
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });
    
    it('should handle non-PENDING transaction', async () => {
      // Mock finding transaction with non-PENDING status
      const mockTransaction = {
        id: 'tx123',
        status: 'PROCESSING',
        save: jest.fn()
      };
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      
      // Create a mock message
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ transactionId: 'tx123' })),
        properties: { messageId: 'msg123' }
      };
      
      // Trigger the Binance payout consumer
      if (mockChannel.callbacks && mockChannel.callbacks['binance.payout']) {
        await mockChannel.callbacks['binance.payout'](mockMsg);
      }
      
      // Should acknowledge the message but not process further
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
      expect(mockTransaction.save).not.toHaveBeenCalled();
      expect(mockBinanceService.withdrawFunds).not.toHaveBeenCalled();
    });
    
    it('should handle withdrawal error', async () => {
      // Mock data
      const transactionId = 'tx123';
      const mockTransaction = {
        id: transactionId,
        status: TransactionStatus.PENDING,
        type: TransactionType.PAYOUT,
        amount: 100,
        asset: 'USDT',
        recipientAddress: '0x1234567890',
        merchantId: 'merchant123',
        webhookUrl: 'https://example.com/webhook',
        network: 'BSC',
        save: jest.fn().mockResolvedValue({}),
        error: '',
        externalId: ''
      };
      
      // Mock finding the transaction
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      
      // Mock withdrawal error
      const withdrawalError = new Error('Insufficient funds');
      mockBinanceService.withdrawFunds.mockRejectedValueOnce(withdrawalError);
      
      // Create a mock message
      const mockMsg = {
        content: Buffer.from(JSON.stringify({ transactionId })),
        properties: { messageId: 'msg123' }
      };
      
      // Trigger the Binance payout consumer
      if (mockChannel.callbacks && mockChannel.callbacks['binance.payout']) {
        await mockChannel.callbacks['binance.payout'](mockMsg);
      }
      
      // Should update status to FAILED
      expect(mockTransaction.status).toBe('FAILED');
      expect(mockTransaction.error).toContain('Insufficient funds');
      expect(mockTransaction.save).toHaveBeenCalled();
      
      // Should send webhook for FAILED status
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith(
        mockTransaction.webhookUrl,
        expect.objectContaining({
          event: WebhookEvent.PAYOUT_FAILED,
          data: expect.objectContaining({
            transactionId,
            status: 'FAILED',
            error: expect.stringContaining('Insufficient funds')
          })
        })
      );
      
      // Should acknowledge the message
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });
  });
  
  describe('close', () => {
    it('should close channel and connection', async () => {
      await queueService.initialize();
      await queueService.close();
      
      expect(mockConnection.close).toHaveBeenCalled();
    });
    
    it('should handle errors during close', async () => {
      await queueService.initialize();
      
      const error = new Error('Close error');
      mockConnection.close.mockRejectedValueOnce(error);
      
      await expect(queueService.close()).rejects.toThrow('Failed to close queue connection');
    });
  });
}); 