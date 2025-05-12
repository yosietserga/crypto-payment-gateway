/**
 * Sandbox Environment Configuration
 * 
 * This file contains configuration specific to the sandbox environment
 * as described in the API documentation.
 */

// Avoid circular dependency with logger
// import { logger } from '../utils/logger';

/**
 * Sandbox test wallets with pre-loaded funds for testing
 */
export const testWallets: {
  [key: string]: {
    address: string;
    privateKey: string;
    balance: string;
  }
} = {
  'USDT-BSC': {
    address: '0xTestWallet1',
    privateKey: 'sandbox_private_key_1', // In production, this would be securely stored
    balance: '1000.00'
  },
  'BNB': {
    address: '0xTestWallet2',
    privateKey: 'sandbox_private_key_2', // In production, this would be securely stored
    balance: '10.00'
  }
};

/**
 * Sandbox mode detection
 */
export const isSandboxMode = (): boolean => {
  return process.env.NODE_ENV === 'sandbox';
};

/**
 * Get a test wallet for the specified currency
 */
export const getTestWallet = (currency: string) => {
  const wallet = testWallets[currency];
  if (!wallet) {
    console.warn(`No test wallet found for currency: ${currency}`);
    return null;
  }
  return wallet;
};

/**
 * Sandbox environment configuration
 */
export const sandboxConfig = {
  // Override blockchain confirmation requirements for faster testing
  confirmations: {
    USDT: 1,  // Only require 1 confirmation in sandbox (vs. 12 in production)
    BNB: 1,
    default: 1
  },
  
  // Faster processing times for testing
  processingTimes: {
    payment: 30000,    // 30 seconds (vs. minutes in production)
    payout: 60000,     // 60 seconds (vs. hours in production)
    settlement: 120000 // 2 minutes (vs. days in production)
  },
  
  // Test API keys for sandbox
  apiKeys: {
    binance: 'sandbox_binance_api_key',
    coinmarketcap: 'sandbox_coinmarketcap_api_key'
  },
  
  // Test wallets
  testWallets,
  
  // Helper functions
  isSandboxMode,
  getTestWallet
};

export default sandboxConfig;