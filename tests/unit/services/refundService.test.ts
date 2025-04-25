import { RefundService } from '../../../src/services/refundService';
import { BlockchainService } from '../../../src/services/blockchainService';
import { WalletService } from '../../../src/services/walletService';
import { QueueService } from '../../../src/services/queueService';
import { WebhookService } from '../../../src/services/webhookService';
import { Transaction, TransactionStatus, TransactionType } from '../../../src/db/entities/Transaction';
import { WebhookEvent } from '../../../src/db/entities/Webhook';
import { PaymentAddress } from '../../../src/db/entities/PaymentAddress';
import { ethers } from 'ethers';
import { getConnection } from '../../../src/db/connection';

// Mock dependencies
jest.mock('../../../src/db/connection');
jest.mock('ethers');

// Mock the repository pattern
const mockTransactionRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
};

// Mock getConnection to return repositories
(getConnection as jest.Mock).mockResolvedValue({
  getRepository: jest.fn().mockImplementation(() => mockTransactionRepository),
});

// Mock ethers Contract
const mockContract = {
  decimals: jest.fn().mockResolvedValue(18),
  transfer: jest.fn().mockResolvedValue({ hash: 'mock-tx-hash' }),
};

(ethers.Contract as jest.Mock) = jest.fn().mockImplementation(() => mockContract);
(ethers.utils.parseUnits as jest.Mock) = jest.fn().mockReturnValue('1000000000000000000');

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    blockchain: {
      bscMainnet: {
        contracts: {
          usdt: '0x55d398326f99059ff775485246999027b3197955',
        },
        gasLimit: 200000,
        gasPrice: '5',
      },
    },
  },
}));

describe('RefundService', () => {
  let refundService: RefundService;
  let mockBlockchainService: jest.Mocked<BlockchainService>;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockQueueService: jest.Mocked<QueueService>;
  let mockWebhookService: jest.Mocked<WebhookService>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock services
    mockBlockchainService = {
      validatePayment: jest.fn(),
    } as unknown as jest.Mocked<BlockchainService>;
    
    mockWalletService = {
      getWalletForAddress: jest.fn().mockResolvedValue({
        address: '0xmerchantaddress',
        privateKey: '0xprivatekey',
      }),
    } as unknown as jest.Mocked<WalletService>;
    
    mockQueueService = {
      addToQueue: jest.fn().mockResolvedValue(undefined),
      consumeQueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<QueueService>;
    
    mockWebhookService = {
      sendWebhookNotification: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookService>;
    
    // Create the refund service with mocked dependencies
    refundService = new RefundService(
      mockBlockchainService,
      mockWalletService,
      mockQueueService,
      mockWebhookService
    );
  });
  
  describe('initialize', () => {
    it('should set up queue consumer for refund processing', async () => {
      await refundService.initialize();
      
      expect(mockQueueService.consumeQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.any(Function)
      );
    });
  });
  
  describe('processRefundTask', () => {
    const mockRefundData = {
      transactionId: 'tx-123',
      excessAmount: 10.5,
      refundAddress: '0xrefundaddress',
    };
    
    const mockTransaction = {
      id: 'tx-123',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.COMPLETED,
      amount: 100,
      currency: 'USDT',
      fromAddress: '0xsenderaddress',
      toAddress: '0xmerchantaddress',
      merchantId: 'merchant-123',
      metadata: {},
      paymentAddress: {
        id: 'addr-123',
        address: '0xpaymentaddress',
      } as PaymentAddress,
    } as Transaction;
    
    it('should process a refund successfully', async () => {
      // Mock repository responses
      mockTransactionRepository.findOne.mockResolvedValueOnce(mockTransaction);
      mockTransactionRepository.save.mockImplementation(tx => Promise.resolve({ ...tx, id: 'refund-tx-123' }));
      
      // Call the private method using any type assertion
      await (refundService as any).processRefundTask(mockRefundData);
      
      // Verify transaction was fetched
      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tx-123' },
        relations: ['paymentAddress'],
      });
      
      // Verify refund transaction was created
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.REFUND,
          status: TransactionStatus.PENDING,
          amount: 10.5,
          currency: 'USDT',
          fromAddress: '0xmerchantaddress',
          toAddress: '0xrefundaddress',
          merchantId: 'merchant-123',
        })
      );
      
      // Verify webhook notification was sent
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.REFUND_INITIATED,
        expect.objectContaining({
          originalTransactionId: 'tx-123',
          amount: 10.5,
          currency: 'USDT',
          refundAddress: '0xrefundaddress',
          status: TransactionStatus.PENDING,
        })
      );
      
      // Verify wallet was fetched
      expect(mockWalletService.getWalletForAddress).toHaveBeenCalledWith('addr-123');
      
      // Verify refund transaction was updated with hash
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          txHash: 'mock-tx-hash',
          status: TransactionStatus.CONFIRMING,
        })
      );
      
      // Verify original transaction metadata was updated
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          metadata: expect.objectContaining({
            refundPending: false,
            refundCompleted: true,
          }),
        })
      );
      
      // Verify completed webhook was sent
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.REFUND_COMPLETED,
        expect.objectContaining({
          txHash: 'mock-tx-hash',
          status: TransactionStatus.CONFIRMING,
        })
      );
      
      // Verify transaction monitoring was queued
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'transaction.monitor',
        expect.objectContaining({
          type: 'check_confirmations',
        })
      );
    });
    
    it('should handle errors and retry the refund task', async () => {
      // Mock repository to throw an error
      mockTransactionRepository.findOne.mockRejectedValueOnce(new Error('Database error'));
      
      // Mock setTimeout
      jest.useFakeTimers();
      
      // Call the private method
      await (refundService as any).processRefundTask(mockRefundData);
      
      // Verify retry was queued
      jest.runAllTimers();
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.objectContaining({
          transactionId: 'tx-123',
          retryCount: 1,
        })
      );
      
      jest.useRealTimers();
    });
    
    it('should send failure webhook after max retries', async () => {
      // Set retry count to max
      const dataWithMaxRetries = { ...mockRefundData, retryCount: 5 };
      
      // Mock repository to throw an error
      mockTransactionRepository.findOne
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(mockTransaction);
      
      // Call the private method
      await (refundService as any).processRefundTask(dataWithMaxRetries);
      
      // Verify failure webhook was sent
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.REFUND_FAILED,
        expect.objectContaining({
          id: 'tx-123',
          error: 'Database error',
        })
      );
    });
  });
  
  describe('initiateManualRefund', () => {
    const mockTransaction = {
      id: 'tx-123',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.COMPLETED,
      amount: 100,
      currency: 'USDT',
      fromAddress: '0xsenderaddress',
      toAddress: '0xmerchantaddress',
      merchantId: 'merchant-123',
      metadata: {},
      paymentAddress: {
        id: 'addr-123',
        address: '0xpaymentaddress',
      } as PaymentAddress,
    } as Transaction;
    
    it('should initiate a manual refund with full amount', async () => {
      // Mock repository responses
      mockTransactionRepository.findOne.mockResolvedValueOnce(mockTransaction);
      mockTransactionRepository.save.mockImplementation(tx => Promise.resolve({ ...tx, id: 'refund-tx-123' }));
      
      // Call the method
      const result = await refundService.initiateManualRefund('tx-123', undefined, undefined, 'customer request', 'user-123');
      
      // Verify transaction was fetched
      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tx-123' },
        relations: ['paymentAddress'],
      });
      
      // Verify refund transaction was created with full amount
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.REFUND,
          status: TransactionStatus.PENDING,
          amount: 100, // Full amount
          currency: 'USDT',
          fromAddress: '0xmerchantaddress',
          toAddress: '0xsenderaddress', // Original sender
          merchantId: 'merchant-123',
          metadata: expect.objectContaining({
            reason: 'customer request',
            initiatedBy: 'user-123',
          }),
        })
      );
      
      // Verify refund was queued
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.objectContaining({
          transactionId: 'tx-123',
          excessAmount: 100,
        })
      );
      
      // Verify result
      expect(result).toEqual(expect.objectContaining({ id: 'refund-tx-123' }));
    });
    
    it('should initiate a partial refund with custom amount and address', async () => {
      // Mock repository responses
      mockTransactionRepository.findOne.mockResolvedValueOnce(mockTransaction);
      mockTransactionRepository.save.mockImplementation(tx => Promise.resolve({ ...tx, id: 'refund-tx-123' }));
      
      // Call the method with custom amount and address
      const result = await refundService.initiateManualRefund(
        'tx-123',
        50, // Partial amount
        '0xcustomrefundaddress',
        'partial refund',
        'user-123'
      );
      
      // Verify refund transaction was created with custom values
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50, // Partial amount
          toAddress: '0xcustomrefundaddress', // Custom address
          metadata: expect.objectContaining({
            reason: 'partial refund',
          }),
        })
      );
      
      // Verify refund was queued with custom values
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.objectContaining({
          excessAmount: 50,
          refundAddress: '0xcustomrefundaddress',
        })
      );
    });
    
    it('should throw an error if refund amount exceeds original payment', async () => {
      // Mock repository responses
      mockTransactionRepository.findOne.mockResolvedValueOnce(mockTransaction);
      
      // Call the method with excessive amount
      await expect(refundService.initiateManualRefund('tx-123', 150)).rejects.toThrow(
        'Refund amount cannot exceed original payment amount'
      );
    });
    
    it('should throw an error if transaction is not found', async () => {
      // Mock repository to return null
      mockTransactionRepository.findOne.mockResolvedValueOnce(null);
      
      // Call the method
      await expect(refundService.initiateManualRefund('tx-123')).rejects.toThrow(
        'Transaction tx-123 not found'
      );
    });
    
    it('should throw an error if refund address is not available', async () => {
      // Create transaction without fromAddress
      const txWithoutSender = { ...mockTransaction, fromAddress: null };
      mockTransactionRepository.findOne.mockResolvedValueOnce(txWithoutSender);
      
      // Call the method without providing refund address
      await expect(refundService.initiateManualRefund('tx-123')).rejects.toThrow(
        'Refund address not provided and original sender address not available'
      );
    });
  });
});