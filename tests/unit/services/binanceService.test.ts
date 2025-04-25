import { BinanceService } from '../../../src/services/binanceService';
import axios from 'axios';
import crypto from 'crypto';

jest.mock('axios');
jest.mock('crypto');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('BinanceService', () => {
  let binanceService: BinanceService;
  
  // Mock environmental variables
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env = {
      ...originalEnv,
      BINANCE_API_KEY: 'test-api-key',
      BINANCE_API_SECRET: 'test-api-secret',
      BINANCE_API_URL: 'https://api.binance.com'
    };
    
    // Mock axios
    (axios.create as jest.Mock).mockReturnValue({
      get: jest.fn(),
      post: jest.fn()
    });
    
    // Mock crypto for HMAC generation
    (crypto.createHmac as jest.Mock).mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mocked-signature')
    });
    
    // Initialize service
    binanceService = new BinanceService();
  });
  
  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });
  
  describe('initialization', () => {
    it('should throw error if API credentials are missing', () => {
      // Clear environment variables
      delete process.env.BINANCE_API_KEY;
      delete process.env.BINANCE_API_SECRET;
      
      expect(() => new BinanceService()).toThrow('Binance API credentials not configured');
    });
    
    it('should initialize with valid API credentials', () => {
      expect(binanceService).toBeDefined();
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.binance.com',
        headers: {
          'X-MBX-APIKEY': 'test-api-key'
        }
      });
    });
  });
  
  describe('getSignature', () => {
    it('should generate correct HMAC signature', () => {
      const params = new URLSearchParams();
      params.append('key1', 'value1');
      params.append('key2', 'value2');
      
      // Use a type assertion to access the private method
      (binanceService as any)['getSignature'](params);
      
      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-api-secret');
      expect(crypto.createHmac('sha256', 'test-api-secret').update).toHaveBeenCalledWith('key1=value1&key2=value2');
    });
  });
  
  describe('getAssetBalance', () => {
    it('should retrieve balance for a specific asset', async () => {
      // Mock axios response
      const mockAxiosInstance = axios.create({});
      (mockAxiosInstance.get as jest.Mock).mockResolvedValueOnce({
        data: {
          balances: [
            { asset: 'BTC', free: '1.0', locked: '0.5' },
            { asset: 'USDT', free: '1000.0', locked: '500.0' },
            { asset: 'ETH', free: '10.0', locked: '2.0' }
          ]
        }
      });
      
      const balance = await binanceService.getAssetBalance('USDT');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/account'),
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
      
      expect(balance).toEqual({
        free: 1000.0,
        locked: 500.0,
        total: 1500.0
      });
    });
    
    it('should return zero balance if asset not found', async () => {
      // Mock axios response with no matching asset
      const mockAxiosInstance = axios.create({});
      (mockAxiosInstance.get as jest.Mock).mockResolvedValueOnce({
        data: {
          balances: [
            { asset: 'BTC', free: '1.0', locked: '0.5' },
            { asset: 'ETH', free: '10.0', locked: '2.0' }
          ]
        }
      });
      
      const balance = await binanceService.getAssetBalance('USDT');
      
      expect(balance).toEqual({
        free: 0,
        locked: 0,
        total: 0
      });
    });
    
    it('should handle API errors', async () => {
      // Mock axios error
      const mockAxiosInstance = axios.create({});
      const error = new Error('API error');
      
      // Implement a mock that verifies params before rejecting
      (mockAxiosInstance.get as jest.Mock).mockImplementation((url, options) => {
        // Verify params are present
        expect(options).toEqual(expect.objectContaining({ params: expect.any(URLSearchParams) }));
        
        // Now reject with our error
        return Promise.reject(error);
      });
      
      // Test the error
      await expect(binanceService.getAssetBalance('USDT')).rejects.toThrow('Failed to retrieve USDT balance');
    });
  });
  
  describe('withdrawFunds', () => {
    it('should withdraw funds successfully', async () => {
      // Mock API response
      const mockWithdrawalResponse = {
        id: 'withdrawal123',
        amount: '100',
        address: '0x1234567890',
        asset: 'USDT',
        txId: 'tx123456',
        applyTime: '1597026383000',
        status: 0
      };
      
      const mockAxiosInstance = axios.create({});
      (mockAxiosInstance.post as jest.Mock).mockResolvedValueOnce({
        data: mockWithdrawalResponse
      });
      
      const result = await binanceService.withdrawFunds(
        'USDT',
        'BSC',
        '0x1234567890',
        100,
        'tx123'
      );
      
      // Check that the API was called with correct parameters
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('/sapi/v1/capital/withdraw/apply'),
        null,
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
      
      // Verify the params contain the required fields
      const callParams = (mockAxiosInstance.post as jest.Mock).mock.calls[0][2].params;
      expect(callParams.get('coin')).toBe('USDT');
      expect(callParams.get('network')).toBe('BSC');
      expect(callParams.get('address')).toBe('0x1234567890');
      expect(callParams.get('amount')).toBe('100');
      
      // Check that the result is as expected
      expect(result).toEqual({
        id: 'withdrawal123',
        amount: '100',
        transactionFee: undefined,
        status: 'PROCESSING'
      });
    });
    
    it('should handle withdrawal API errors', async () => {
      // Mock API error
      const mockAxiosInstance = axios.create({});
      const error = {
        response: {
          data: {
            code: -3022,
            msg: 'Insufficient balance'
          }
        }
      };
      
      // Implement a mock that verifies params before rejecting
      (mockAxiosInstance.post as jest.Mock).mockImplementation((url, data, options) => {
        // Verify params are present
        expect(options).toEqual(expect.objectContaining({ params: expect.any(URLSearchParams) }));
        
        // Now reject with our error
        return Promise.reject(error);
      });
      
      // Test the error
      await expect(binanceService.withdrawFunds(
        'USDT', 'BSC', '0x1234567890', 1000, 'tx123'
      )).rejects.toThrow('Failed to withdraw funds: Insufficient balance');
    });
    
    it('should handle generic errors during withdrawal', async () => {
      // Mock generic error
      const mockAxiosInstance = axios.create({});
      const error = new Error('Network error');
      
      // Implement a mock that verifies params before rejecting
      (mockAxiosInstance.post as jest.Mock).mockImplementation((url, data, options) => {
        // Verify params are present
        expect(options).toEqual(expect.objectContaining({ params: expect.any(URLSearchParams) }));
        
        // Now reject with our error
        return Promise.reject(error);
      });
      
      // Test the error
      await expect(binanceService.withdrawFunds(
        'USDT', 'BSC', '0x1234567890', 100, 'tx123'
      )).rejects.toThrow('Failed to withdraw funds: Network error');
    });
  });
  
  describe('getWithdrawalHistory', () => {
    it('should retrieve withdrawal history for an asset', async () => {
      // Mock withdrawal history response
      const mockWithdrawalHistory = [
        {
          id: 'withdrawal123',
          amount: '100',
          address: '0x1234567890',
          asset: 'USDT',
          txId: 'tx123456',
          applyTime: '1597026383000',
          status: 6
        }
      ];
      
      const mockAxiosInstance = axios.create({});
      (mockAxiosInstance.get as jest.Mock).mockResolvedValueOnce({
        data: mockWithdrawalHistory
      });
      
      const history = await binanceService.getWithdrawalHistory('USDT');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/sapi/v1/capital/withdraw/history'),
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
      
      expect(history).toEqual([
        {
          id: 'withdrawal123',
          amount: '100',
          address: '0x1234567890',
          asset: 'USDT',
          txId: 'tx123456',
          applyTime: '1597026383000',
          status: 'COMPLETED'
        }
      ]);
    });
    
    it('should handle API errors when retrieving withdrawal history', async () => {
      // Mock API error
      const mockAxiosInstance = axios.create({});
      const error = new Error('API error');
      (mockAxiosInstance.get as jest.Mock).mockRejectedValueOnce(error);
      
      // Test both the API call and the error
      await expect(binanceService.getWithdrawalHistory('USDT')).rejects.toThrow('Failed to retrieve withdrawal history');
      
      // Verify the API was called with correct parameters
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/sapi/v1/capital/withdraw/history'),
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
    });
  });
  
  describe('getDepositAddress', () => {
    it('should retrieve deposit address for an asset and network', async () => {
      // Mock deposit address response
      const mockDepositAddress = {
        address: '0x1234567890',
        coin: 'USDT',
        tag: '',
        url: ''
      };
      
      const mockAxiosInstance = axios.create({});
      (mockAxiosInstance.get as jest.Mock).mockResolvedValueOnce({
        data: mockDepositAddress
      });
      
      const address = await binanceService.getDepositAddress('USDT', 'BSC');
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/sapi/v1/capital/deposit/address'),
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
      
      expect(address).toEqual('0x1234567890');
    });
    
    it('should handle API errors when retrieving deposit address', async () => {
      // Mock API error
      const mockAxiosInstance = axios.create({});
      const error = new Error('API error');
      (mockAxiosInstance.get as jest.Mock).mockRejectedValueOnce(error);
      
      // Test both the API call and the error
      await expect(binanceService.getDepositAddress('USDT', 'BSC')).rejects.toThrow('Failed to get deposit address');
      
      // Verify the API was called with correct parameters
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/sapi/v1/capital/deposit/address'),
        expect.objectContaining({ params: expect.any(URLSearchParams) })
      );
    });
  });
}); 