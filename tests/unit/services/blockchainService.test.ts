import { BlockchainService } from '../../../src/services/blockchainService';
import { WebhookService } from '../../../src/services/webhookService';
import { QueueService } from '../../../src/services/queueService';
import { Transaction, TransactionStatus, TransactionType } from '../../../src/db/entities/Transaction';
import { PaymentAddress } from '../../../src/db/entities/PaymentAddress';
import { WebhookEvent } from '../../../src/db/entities/Webhook';
import { ethers } from 'ethers';
import { getConnection } from '../../../src/db/connection';

// Mock dependencies
jest.mock('../../../src/db/connection');
jest.mock('ethers');

// Mock the repository pattern
const mockTransactionRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockPaymentAddressRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
};

// Mock getConnection to return repositories
(getConnection as jest.Mock).mockResolvedValue({
  getRepository: jest.fn().mockImplementation((entity) => {
    if (entity === Transaction) return mockTransactionRepository;
    if (entity === PaymentAddress) return mockPaymentAddressRepository;
    return {};
  }),
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    blockchain: {
      bscMainnet: {
        contracts: {
          usdt: '0x55d398326f99059ff775485246999027b3197955',
        },
        confirmations: 6,
      },
    },
    payment: {
      expirationTimeMinutes: 60,
      underpaymentThresholdPercent: 1, // 1% threshold for underpayments
      overpaymentThresholdPercent: 0.5, // 0.5% threshold for overpayments
    },
  },
}));

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;
  let mockWebhookService: jest.Mocked<WebhookService>;
  let mockQueueService: jest.Mocked<QueueService>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock services
    mockWebhookService = {
      sendWebhookNotification: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookService>;
    
    mockQueueService = {
      addToQueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<QueueService>;
    
    // Create the blockchain service with mocked dependencies
    blockchainService = new BlockchainService(
      mockWebhookService,
      mockQueueService
    );
  });
  
  describe('validatePayment', () => {
    const mockTransaction = {
      id: 'tx-123',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      amount: 100,
      currency: 'USDT',
      merchantId: 'merchant-123',
      metadata: {},
      paymentAddress: {
        id: 'addr-123',
        address: '0xpaymentaddress',
      } as PaymentAddress,
    } as Transaction;
    
    it('should mark transaction as completed when payment amount matches exactly', async () => {
      // Setup
      const paymentAmount = 100; // Exact match
      
      // Call the method
      await blockchainService.validatePayment(mockTransaction, paymentAmount, '0xsenderaddress', 'txhash-123');
      
      // Verify transaction was updated correctly
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.COMPLETED,
          fromAddress: '0xsenderaddress',
          txHash: 'txhash-123',
        })
      );
      
      // Verify webhook was sent
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.PAYMENT_COMPLETED,
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.COMPLETED,
        })
      );
      
      // Verify no refund was queued
      expect(mockQueueService.addToQueue).not.toHaveBeenCalledWith(
        'refund.process',
        expect.anything()
      );
    });
    
    it('should handle underpayment within threshold', async () => {
      // Setup - 0.5% underpayment (within 1% threshold)
      const paymentAmount = 99.5;
      
      // Call the method
      await blockchainService.validatePayment(mockTransaction, paymentAmount, '0xsenderaddress', 'txhash-123');
      
      // Verify transaction was marked as completed despite underpayment
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.COMPLETED,
          metadata: expect.objectContaining({
            actualAmount: 99.5,
            underpayment: true,
            underpaymentAmount: 0.5,
          }),
        })
      );
      
      // Verify webhook was sent with underpayment info
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.PAYMENT_COMPLETED,
        expect.objectContaining({
          actualAmount: 99.5,
          underpayment: true,
        })
      );
    });
    
    it('should handle significant underpayment (outside threshold)', async () => {
      // Setup - 2% underpayment (outside 1% threshold)
      const paymentAmount = 98;
      
      // Call the method
      await blockchainService.validatePayment(mockTransaction, paymentAmount, '0xsenderaddress', 'txhash-123');
      
      // Verify transaction was marked as underpaid
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.UNDERPAID,
          metadata: expect.objectContaining({
            actualAmount: 98,
            underpayment: true,
            underpaymentAmount: 2,
          }),
        })
      );
      
      // Verify webhook was sent with underpayment info
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.PAYMENT_UNDERPAID,
        expect.objectContaining({
          actualAmount: 98,
          underpayment: true,
          underpaymentAmount: 2,
        })
      );
    });
    
    it('should handle overpayment within threshold', async () => {
      // Setup - 0.3% overpayment (within 0.5% threshold)
      const paymentAmount = 100.3;
      
      // Call the method
      await blockchainService.validatePayment(mockTransaction, paymentAmount, '0xsenderaddress', 'txhash-123');
      
      // Verify transaction was marked as completed without refund
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.COMPLETED,
          metadata: expect.objectContaining({
            actualAmount: 100.3,
            overpayment: true,
            overpaymentAmount: 0.3,
          }),
        })
      );
      
      // Verify no refund was queued
      expect(mockQueueService.addToQueue).not.toHaveBeenCalledWith(
        'refund.process',
        expect.anything()
      );
    });
    
    it('should handle significant overpayment and queue refund', async () => {
      // Setup - 1% overpayment (outside 0.5% threshold)
      const paymentAmount = 101;
      
      // Call the method
      await blockchainService.validatePayment(mockTransaction, paymentAmount, '0xsenderaddress', 'txhash-123');
      
      // Verify transaction was marked as completed
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.COMPLETED,
          metadata: expect.objectContaining({
            actualAmount: 101,
            overpayment: true,
            overpaymentAmount: 1,
            refundPending: true,
          }),
        })
      );
      
      // Verify webhook was sent
      expect(mockWebhookService.sendWebhookNotification).toHaveBeenCalledWith(
        'merchant-123',
        WebhookEvent.PAYMENT_COMPLETED,
        expect.objectContaining({
          actualAmount: 101,
          overpayment: true,
          overpaymentAmount: 1,
        })
      );
      
      // Verify refund was queued
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.objectContaining({
          transactionId: 'tx-123',
          excessAmount: 1,
          refundAddress: '0xsenderaddress',
        })
      );
    });
    
    it('should handle payment for already completed transaction', async () => {
      // Setup - transaction already completed
      const completedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
        txHash: 'existing-hash',
      };
      
      // Call the method
      await blockchainService.validatePayment(completedTransaction, 100, '0xsenderaddress', 'new-txhash');
      
      // Verify transaction was not updated
      expect(mockTransactionRepository.save).not.toHaveBeenCalled();
      
      // Verify no webhook was sent
      expect(mockWebhookService.sendWebhookNotification).not.toHaveBeenCalled();
    });
    
    it('should handle payment for expired transaction', async () => {
      // Setup - expired transaction
      const expiredTransaction = {
        ...mockTransaction,
        status: TransactionStatus.EXPIRED,
      };
      
      // Call the method
      await blockchainService.validatePayment(expiredTransaction, 100, '0xsenderaddress', 'txhash-123');
      
      // Verify refund was queued
      expect(mockQueueService.addToQueue).toHaveBeenCalledWith(
        'refund.process',
        expect.objectContaining({
          transactionId: 'tx-123',
          excessAmount: 100, // Full refund
          refundAddress: '0xsenderaddress',
        })
      );
      
      // Verify transaction metadata was updated
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          status: TransactionStatus.EXPIRED,
          metadata: expect.objectContaining({
            paymentAfterExpiration: true,
            refundPending: true,
          }),
        })
      );
    });
  });
});