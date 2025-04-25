// Test utilities for API endpoint tests
const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');

// Test configuration
const API_BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test_api_key';
const API_SECRET = 'test_api_secret';
const MERCHANT_TEST_EMAIL = 'test@example.com';
const MERCHANT_TEST_PASSWORD = 'Password123!';

/**
 * Helper function to generate HMAC signature for authenticated requests
 */
function generateSignature(apiSecret, timestamp, requestBody) {
  const message = timestamp + (requestBody ? JSON.stringify(requestBody) : '');
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

/**
 * Helper function to make authenticated API requests
 */
async function makeAuthenticatedRequest(method, endpoint, data = null, token = null) {
  const timestamp = Date.now().toString();
  const signature = generateSignature(API_SECRET, timestamp, data);
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Add authentication headers - either token-based or HMAC-based
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-API-KEY'] = API_KEY;
    headers['X-TIMESTAMP'] = timestamp;
    headers['X-SIGNATURE'] = signature;
  }
  
  try {
    const response = await axios({
      method,
      url: `${API_BASE_URL}${endpoint}`,
      data,
      headers,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      return {
        error: true,
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw error;
  }
}

/**
 * Helper function to authenticate (login or register)
 */
async function authenticate() {
  try {
    // Try to login first
    console.log('Attempting to login with test credentials...');
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: MERCHANT_TEST_EMAIL,
        password: MERCHANT_TEST_PASSWORD,
      });
      
      console.log('Login successful');
      return {
        token: loginResponse.data.token,
        merchantId: loginResponse.data.user.merchant?.id,
      };
    } catch (loginError) {
      console.log('Login failed, attempting registration...');
      // If login fails, register a new user
      const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
        email: MERCHANT_TEST_EMAIL,
        password: MERCHANT_TEST_PASSWORD,
        companyName: 'Test Company',
        contactName: 'Test User',
        contactPhone: '+1234567890',
      });
      
      console.log('Registration successful');
      return {
        token: registerResponse.data.token,
        merchantId: registerResponse.data.user.merchant?.id,
      };
    }
  } catch (error) {
    console.error('Authentication failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw new Error('Failed to authenticate: ' + error.message);
  }
}

/**
 * Create mock transaction data
 */
function createMockTransaction(paymentAddressId, addressString, amount = '100.00') {
  return {
    id: `tx_${Math.random().toString(36).substring(2, 10)}`,
    txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    status: 'CONFIRMED',
    type: 'PAYMENT',
    amount: amount,
    currency: 'USDT',
    fromAddress: '0x' + crypto.randomBytes(20).toString('hex'),
    toAddress: addressString,
    confirmations: 12,
    paymentAddressId: paymentAddressId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Wait for a specific amount of time
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if server is running on specified port
 */
async function isServerRunning(port) {
  try {
    // Try IPv4 address first
    await axios.get(`http://127.0.0.1:${port}/health`);
    return true;
  } catch (ipv4Error) {
    try {
      // Try localhost which might resolve to IPv6
      await axios.get(`http://localhost:${port}/health`);
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Start server for tests
 */
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting test server...');
    const serverProcess = exec('npm run dev', {
      env: { ...process.env, PORT: '3000' }
    });
    
    let output = '';
    
    serverProcess.stdout.on('data', (data) => {
      output += data;
      if (data.includes('Server running on port') || data.includes('Services initialized')) {
        console.log('Server started successfully');
        resolve(serverProcess);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      output += data;
      console.error(`Server error: ${data}`);
    });
    
    // Timeout if server doesn't start
    setTimeout(() => {
      if (output.includes('Server running on port') || output.includes('Services initialized')) {
        resolve(serverProcess);
      } else {
        serverProcess.kill();
        reject(new Error('Server failed to start in time'));
      }
    }, 10000);
  });
}

/**
 * Stop server process
 */
function stopServer(serverProcess) {
  if (serverProcess) {
    console.log('Stopping server...');
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${serverProcess.pid} /f /t`);
    } else {
      serverProcess.kill('SIGTERM');
    }
  }
}

module.exports = {
  API_BASE_URL,
  API_KEY,
  API_SECRET,
  MERCHANT_TEST_EMAIL,
  MERCHANT_TEST_PASSWORD,
  generateSignature,
  makeAuthenticatedRequest,
  authenticate,
  createMockTransaction,
  wait,
  isServerRunning,
  startServer,
  stopServer
}; 