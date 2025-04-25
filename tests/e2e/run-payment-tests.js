/**
 * Crypto Payment Gateway - Test Runner Script
 * 
 * This script helps run the end-to-end payment flow tests with proper configuration
 * and provides detailed output about the test results.
 */

require('dotenv').config(); // Load environment variables from .env file
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration check
const requiredEnvVars = [
  'TEST_API_KEY',
  'TEST_WALLET_PRIVATE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

// Check if server is running
function checkServerRunning() {
  return new Promise((resolve) => {
    const http = require('http');
    const options = {
      host: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/v1/health'
    };

    const req = http.get(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.end();
  });
}

// Main function
async function runTests() {
  console.log('\n🔍 Checking environment for Crypto Payment Gateway tests...');
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found! Please create one based on .env.example');
    process.exit(1);
  }
  
  // Check for missing environment variables
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.log('\nPlease add these variables to your .env file:');
    missingVars.forEach(varName => {
      console.log(`${varName}=your_value_here`);
    });
    process.exit(1);
  }
  
  // Check if server is running
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.error('❌ API server is not running! Please start the server with: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ Environment check passed!');
  console.log('\n🚀 Running end-to-end payment flow tests...');
  
  // Run the tests
  const testProcess = spawn('npx', ['jest', '--verbose', 'tests/e2e/payment-flow.test.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  testProcess.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ All tests completed successfully!');
    } else {
      console.error(`\n❌ Tests failed with exit code ${code}`);
      console.log('\nPossible issues:');
      console.log('1. The server might not be processing blockchain events correctly');
      console.log('2. The test wallet might not have enough USDT for testing');
      console.log('3. The blockchain network might be congested or unresponsive');
      console.log('\nCheck the server logs for more details.');
    }
  });
}

// Run the script
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});

// Instructions for running this script:
/*
 1. Make sure you have set up the .env file with TEST_API_KEY and TEST_WALLET_PRIVATE_KEY
 2. Start the crypto payment gateway server: npm run dev
 3. Run this script: node tests/e2e/run-payment-tests.js
*/