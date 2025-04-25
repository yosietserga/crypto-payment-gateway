// Mock services for tests

/**
 * This file contains mocks for services used in the tests.
 * It helps isolate the API tests from external dependencies.
 */

const mockWebhookService = {
  sendWebhook: jest.fn().mockResolvedValue(true),
  queueWebhook: jest.fn().mockResolvedValue(true),
};

const mockBlockchainService = {
  generatePaymentAddress: jest.fn().mockImplementation(() => {
    return {
      id: 'addr_' + Math.random().toString(36).substring(2, 10),
      address: '0x' + Math.random().toString(36).substring(2, 42),
      privateKey: '0x' + Math.random().toString(36).substring(2, 66),
      hdPath: `m/44'/60'/0'/0/${Math.floor(Math.random() * 1000)}`,
      status: 'ACTIVE',
      type: 'PAYMENT',
      expectedAmount: '100.00',
      currency: 'USDT',
      expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
      isMonitored: true,
      metadata: { orderId: 'test-123' },
      merchantId: 'merchant_123',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }),
  monitorAddress: jest.fn().mockResolvedValue(true),
  getTransactionStatus: jest.fn().mockResolvedValue({
    status: 'CONFIRMED',
    confirmations: 12,
  }),
};

const mockQueueService = {
  sendToQueue: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn().mockResolvedValue(true),
  initialize: jest.fn().mockResolvedValue(true),
};

const mockDatabaseConnection = {
  getRepository: jest.fn().mockImplementation((entity) => {
    return {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: data.id || `id_${Math.random().toString(36).substring(2, 10)}` })),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
  }),
  transaction: jest.fn().mockImplementation((callback) => callback({
    getRepository: jest.fn().mockReturnValue({
      save: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: data.id || `id_${Math.random().toString(36).substring(2, 10)}` })),
    }),
  })),
};

// Export mocks to be used in tests
module.exports = {
  mockWebhookService,
  mockBlockchainService,
  mockQueueService,
  mockDatabaseConnection,
}; 