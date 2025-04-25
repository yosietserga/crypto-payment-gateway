/**
 * Crypto Payment Gateway - End-to-End Payment Flow Tests
 * 
 * This file contains tests that simulate real payment flows through the webapp,
 * making actual API requests to the server and verifying the entire payment processing pipeline.
 */

const axios = require('axios');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');

// Configuration for tests
const CONFIG = {
  apiBaseUrl: 'http://localhost:3000/api/v1',
  apiKey: process.env.TEST_API_KEY || 'test-api-key', // Set this in your environment or .env file
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY, // Private key with test funds
  testAmount: '0.01', // Small amount for testing
  currency: 'USDT',
  network: 'BEP20',
  callbackUrl: 'https://webhook.site/your-unique-id', // Use webhook.site for testing
  testTimeoutMs: 60000, // 1 minute timeout for tests
};

// Initialize blockchain provider
const provider = new ethers.providers.JsonRpcProvider(
  'https://data-seed-prebsc-1-s1.binance.org:8545/' // BSC Testnet
);

// Initialize test wallet
let testWallet;
if (CONFIG.testWalletPrivateKey) {
  testWallet = new ethers.Wallet(CONFIG.testWalletPrivateKey, provider);
}

// USDT contract on BSC Testnet
const usdtContractAddress = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const usdtAbi = [
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Initialize USDT contract
const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, provider);

// Helper function to create API client
function createApiClient() {
  return axios.create({
    baseURL: CONFIG.apiBaseUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': CONFIG.apiKey
    }
  });
}

// Helper function to generate a payment address
async function generatePaymentAddress(reference, amount) {
  const apiClient = createApiClient();
  const response = await apiClient.post('/addresses', {
    reference,
    expectedAmount: amount,
    callbackUrl: CONFIG.callbackUrl
  });
  return response.data.data;
}

// Helper function to check payment status
async function checkPaymentStatus(reference) {
  const apiClient = createApiClient();
  const response = await apiClient.get(`/transactions/${reference}`);
  return response.data.data;
}

// Helper function to send USDT to an address
async function sendUsdt(toAddress, amount) {
  if (!testWallet) {
    throw new Error('Test wallet not configured. Set TEST_WALLET_PRIVATE_KEY environment variable.');
  }
  
  const usdtWithSigner = usdtContract.connect(testWallet);
  const decimals = await usdtContract.decimals();
  const amountInSmallestUnit = ethers.utils.parseUnits(amount, decimals);
  
  const tx = await usdtWithSigner.transfer(toAddress, amountInSmallestUnit);
  return await tx.wait();
}

// Helper function to wait for a condition with timeout
async function waitForCondition(conditionFn, timeoutMs = 30000, intervalMs = 1000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms timeout`);
}

// Test cases
describe('Crypto Payment Gateway - End-to-End Tests', () => {
  // Increase timeout for all tests in this suite
  jest.setTimeout(CONFIG.testTimeoutMs);
  
  test('Full payment flow - Exact amount', async () => {
    // Generate a unique reference for this test
    const reference = `test-${uuidv4()}`;
    
    // Step 1: Generate a payment address
    console.log(`Generating payment address for reference: ${reference}`);
    const paymentData = await generatePaymentAddress(reference, CONFIG.testAmount);
    
    expect(paymentData).toBeDefined();
    expect(paymentData.address).toBeDefined();
    expect(paymentData.status).toBe('pending');
    
    console.log(`Payment address generated: ${paymentData.address}`);
    
    // Step 2: Send the exact amount of USDT to the address
    if (testWallet) {
      console.log(`Sending ${CONFIG.testAmount} USDT to ${paymentData.address}`);
      const txReceipt = await sendUsdt(paymentData.address, CONFIG.testAmount);
      console.log(`Transaction sent: ${txReceipt.transactionHash}`);
      
      // Step 3: Wait for payment to be detected and confirmed
      console.log('Waiting for payment to be confirmed...');
      await waitForCondition(async () => {
        const status = await checkPaymentStatus(reference);
        console.log(`Current payment status: ${status.status}`);
        return status.status === 'confirmed';
      }, 45000); // Allow up to 45 seconds for confirmation
      
      // Step 4: Verify final payment status
      const finalStatus = await checkPaymentStatus(reference);
      expect(finalStatus.status).toBe('confirmed');
      expect(finalStatus.amountReceived).toBe(CONFIG.testAmount);
    } else {
      console.log('Skipping payment sending as test wallet is not configured');
    }
  });
  
  test('Underpayment flow', async () => {
    // Generate a unique reference for this test
    const reference = `test-${uuidv4()}`;
    
    // Step 1: Generate a payment address
    const paymentData = await generatePaymentAddress(reference, CONFIG.testAmount);
    
    // Step 2: Send less than the expected amount (e.g., 90%)
    if (testWallet) {
      const underpaymentAmount = (parseFloat(CONFIG.testAmount) * 0.9).toString();
      console.log(`Sending underpayment of ${underpaymentAmount} USDT to ${paymentData.address}`);
      await sendUsdt(paymentData.address, underpaymentAmount);
      
      // Step 3: Wait for payment to be detected
      await waitForCondition(async () => {
        const status = await checkPaymentStatus(reference);
        return status.status === 'underpaid';
      }, 45000);
      
      // Step 4: Verify underpayment status
      const finalStatus = await checkPaymentStatus(reference);
      expect(finalStatus.status).toBe('underpaid');
    } else {
      console.log('Skipping underpayment test as test wallet is not configured');
    }
  });
  
  test('Overpayment flow', async () => {
    // Generate a unique reference for this test
    const reference = `test-${uuidv4()}`;
    
    // Step 1: Generate a payment address
    const paymentData = await generatePaymentAddress(reference, CONFIG.testAmount);
    
    // Step 2: Send more than the expected amount (e.g., 110%)
    if (testWallet) {
      const overpaymentAmount = (parseFloat(CONFIG.testAmount) * 1.1).toString();
      console.log(`Sending overpayment of ${overpaymentAmount} USDT to ${paymentData.address}`);
      await sendUsdt(paymentData.address, overpaymentAmount);
      
      // Step 3: Wait for payment to be detected
      await waitForCondition(async () => {
        const status = await checkPaymentStatus(reference);
        return status.status === 'overpaid';
      }, 45000);
      
      // Step 4: Verify overpayment status
      const finalStatus = await checkPaymentStatus(reference);
      expect(finalStatus.status).toBe('overpaid');
    } else {
      console.log('Skipping overpayment test as test wallet is not configured');
    }
  });
  
  test('Address expiration flow', async () => {
    // Generate a unique reference for this test
    const reference = `test-${uuidv4()}`;
    
    // Step 1: Generate a payment address with very short expiration (10 seconds)
    const apiClient = createApiClient();
    const response = await apiClient.post('/addresses', {
      reference,
      expectedAmount: CONFIG.testAmount,
      callbackUrl: CONFIG.callbackUrl,
      expiresIn: 10 // 10 seconds
    });
    
    const paymentData = response.data.data;
    expect(paymentData.status).toBe('pending');
    
    // Step 2: Wait for address to expire
    console.log('Waiting for payment address to expire...');
    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
    
    // Step 3: Verify address has expired
    const status = await checkPaymentStatus(reference);
    expect(status.status).toBe('expired');
  });
});

// Instructions for running the tests:
/*
 1. Make sure the crypto payment gateway server is running
 2. Set the TEST_API_KEY environment variable to a valid API key
 3. Set the TEST_WALLET_PRIVATE_KEY environment variable to a wallet with test USDT
 4. Run the tests with: npm test -- tests/e2e/payment-flow.test.js
*/