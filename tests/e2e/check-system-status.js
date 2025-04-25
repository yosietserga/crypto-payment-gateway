/**
 * Crypto Payment Gateway - System Status Check
 * 
 * This script checks if all components of the system are properly configured and running
 * before executing the end-to-end payment tests.
 */

require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
  apiKey: process.env.TEST_API_KEY,
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY,
  bscTestnetRpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  usdtContractAddress: process.env.BSC_TESTNET_USDT_CONTRACT || '0xe73a457689c64792a9fd61096c6693b3fad089ce',
};

// USDT contract ABI (minimal for balance checking)
const usdtAbi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Helper function to check if server is running
async function checkServerStatus() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health`, {
      timeout: 5000,
      validateStatus: () => true
    });
    return {
      running: response.status === 200,
      status: response.status,
      message: response.data?.message || 'No message provided'
    };
  } catch (error) {
    return {
      running: false,
      status: 'error',
      message: error.message
    };
  }
}

// Helper function to check API key validity
async function checkApiKey() {
  if (!CONFIG.apiKey) {
    return {
      valid: false,
      message: 'API key not provided in environment variables'
    };
  }

  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/merchants/me`, {
      headers: {
        'X-API-Key': CONFIG.apiKey
      },
      timeout: 5000,
      validateStatus: () => true
    });

    return {
      valid: response.status === 200,
      status: response.status,
      message: response.status === 200 ? 'API key is valid' : 'API key is invalid'
    };
  } catch (error) {
    return {
      valid: false,
      status: 'error',
      message: error.message
    };
  }
}

// Helper function to check wallet status
async function checkWalletStatus() {
  if (!CONFIG.testWalletPrivateKey) {
    return {
      valid: false,
      message: 'Test wallet private key not provided in environment variables'
    };
  }

  try {
    // Initialize provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.bscTestnetRpcUrl);
    const wallet = new ethers.Wallet(CONFIG.testWalletPrivateKey, provider);
    const address = wallet.address;

    // Check wallet balance
    const balance = await provider.getBalance(address);
    const ethBalance = ethers.utils.formatEther(balance);

    // Check USDT balance
    const usdtContract = new ethers.Contract(CONFIG.usdtContractAddress, usdtAbi, provider);
    const usdtBalance = await usdtContract.balanceOf(address);
    const decimals = await usdtContract.decimals();
    const usdtBalanceFormatted = ethers.utils.formatUnits(usdtBalance, decimals);

    return {
      valid: true,
      address,
      ethBalance,
      usdtBalance: usdtBalanceFormatted,
      message: 'Wallet is valid and accessible'
    };
  } catch (error) {
    return {
      valid: false,
      message: `Error checking wallet: ${error.message}`
    };
  }
}

// Helper function to check database connection
async function checkDatabaseConnection() {
  try {
    const response = await axios.get(`${CONFIG.apiBaseUrl}/health/db`, {
      headers: {
        'X-API-Key': CONFIG.apiKey
      },
      timeout: 5000,
      validateStatus: () => true
    });

    return {
      connected: response.status === 200,
      status: response.status,
      message: response.data?.message || 'No message provided'
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      message: error.message
    };
  }
}

// Helper function to check blockchain connection
async function checkBlockchainConnection() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.bscTestnetRpcUrl);
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();

    return {
      connected: true,
      blockNumber,
      networkName: network.name,
      chainId: network.chainId,
      message: 'Successfully connected to blockchain'
    };
  } catch (error) {
    return {
      connected: false,
      message: `Error connecting to blockchain: ${error.message}`
    };
  }
}

// Main function to run all checks
async function checkSystemStatus() {
  console.log('🔍 Checking Crypto Payment Gateway System Status...');
  console.log('==================================================');

  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '..', '.env');
  const envExists = fs.existsSync(envPath);
  console.log(`\n📄 .env file: ${envExists ? '✅ Found' : '❌ Not found'}`);

  // Check server status
  console.log('\n🖥️ API Server:');
  const serverStatus = await checkServerStatus();
  console.log(`  Status: ${serverStatus.running ? '✅ Running' : '❌ Not running'}`);
  console.log(`  Details: ${serverStatus.message}`);

  // Check API key
  console.log('\n🔑 API Key:');
  const apiKeyStatus = await checkApiKey();
  console.log(`  Status: ${apiKeyStatus.valid ? '✅ Valid' : '❌ Invalid'}`);
  console.log(`  Details: ${apiKeyStatus.message}`);

  // Check wallet status
  console.log('\n👛 Test Wallet:');
  const walletStatus = await checkWalletStatus();
  console.log(`  Status: ${walletStatus.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (walletStatus.valid) {
    console.log(`  Address: ${walletStatus.address}`);
    console.log(`  BNB Balance: ${walletStatus.ethBalance}`);
    console.log(`  USDT Balance: ${walletStatus.usdtBalance}`);
    
    // Check if wallet has enough funds for testing
    const hasEnoughBnb = parseFloat(walletStatus.ethBalance) >= 0.01;
    const hasEnoughUsdt = parseFloat(walletStatus.usdtBalance) >= 0.05;
    
    console.log(`  BNB for gas: ${hasEnoughBnb ? '✅ Sufficient' : '❌ Insufficient'} (min 0.01 BNB recommended)`);
    console.log(`  USDT for tests: ${hasEnoughUsdt ? '✅ Sufficient' : '❌ Insufficient'} (min 0.05 USDT recommended)`);
  } else {
    console.log(`  Details: ${walletStatus.message}`);
  }

  // Check database connection
  console.log('\n🗄️ Database:');
  const dbStatus = await checkDatabaseConnection();
  console.log(`  Status: ${dbStatus.connected ? '✅ Connected' : '❌ Not connected'}`);
  console.log(`  Details: ${dbStatus.message}`);

  // Check blockchain connection
  console.log('\n⛓️ Blockchain:');
  const blockchainStatus = await checkBlockchainConnection();
  console.log(`  Status: ${blockchainStatus.connected ? '✅ Connected' : '❌ Not connected'}`);
  if (blockchainStatus.connected) {
    console.log(`  Network: ${blockchainStatus.networkName} (Chain ID: ${blockchainStatus.chainId})`);
    console.log(`  Current Block: ${blockchainStatus.blockNumber}`);
  } else {
    console.log(`  Details: ${blockchainStatus.message}`);
  }

  // Overall system status
  const allSystemsGo = serverStatus.running && 
                       apiKeyStatus.valid && 
                       walletStatus.valid && 
                       dbStatus.connected && 
                       blockchainStatus.connected;

  console.log('\n==================================================');
  console.log(`Overall System Status: ${allSystemsGo ? '✅ READY FOR TESTING' : '❌ NOT READY - Fix issues above'}`);
  console.log('==================================================');

  if (!allSystemsGo) {
    console.log('\n🔧 Troubleshooting Tips:');
    if (!serverStatus.running) {
      console.log('  • Start the API server with: npm run dev');
    }
    if (!apiKeyStatus.valid) {
      console.log('  • Check your TEST_API_KEY in the .env file');
      console.log('  • Ensure the API key has not expired');
    }
    if (!walletStatus.valid) {
      console.log('  • Verify your TEST_WALLET_PRIVATE_KEY in the .env file');
    } else if (parseFloat(walletStatus.ethBalance) < 0.01 || parseFloat(walletStatus.usdtBalance) < 0.05) {
      console.log('  • Fund your test wallet with BNB for gas and USDT for testing');
      console.log(`  • Wallet address: ${walletStatus.address}`);
    }
    if (!dbStatus.connected) {
      console.log('  • Check database connection settings in your .env file');
      console.log('  • Ensure the database server is running');
    }
    if (!blockchainStatus.connected) {
      console.log('  • Verify your BSC_TESTNET_RPC_URL in the .env file');
      console.log('  • Check your internet connection');
    }
  } else {
    console.log('\n🚀 You can now run the end-to-end tests with:');
    console.log('  node tests/e2e/run-payment-tests.js');
  }
}

// Run the checks
checkSystemStatus().catch(error => {
  console.error('\n❌ Error running system checks:', error.message);
});