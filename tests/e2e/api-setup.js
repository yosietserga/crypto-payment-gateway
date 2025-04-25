// API Test Setup

const { exec } = require('child_process');
const waitOn = require('wait-on');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load test environment variables if available
const testEnvPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
} else {
  // Create a minimal test environment
  const testEnv = `
NODE_ENV=test
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=crypto_payment_gateway_test
DB_SSL=false
RABBITMQ_URL=amqp://localhost
BCRYPT_SALT_ROUNDS=4
JWT_SECRET=test-jwt-secret
WEBHOOK_SIGNATURE_SECRET=test-webhook-secret
LOG_LEVEL=error
`;
  fs.writeFileSync(testEnvPath, testEnv);
  dotenv.config({ path: testEnvPath });
}

// Server process reference
let serverProcess = null;

/**
 * Start the test server
 */
async function startTestServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting test server...');
    // Use the dist (compiled) version if it exists, otherwise use ts-node
    const serverCommand = fs.existsSync(path.join(process.cwd(), 'dist', 'app.js'))
      ? 'node dist/app.js'
      : 'npx ts-node src/app.ts';
    
    serverProcess = exec(serverCommand, {
      env: {
        ...process.env,
        PORT: '3000',
        NODE_ENV: 'test',
      }
    });
    
    serverProcess.stdout.on('data', (data) => {
      if (data.includes('Server running on port')) {
        console.log('Server started successfully');
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error(`Server error: ${data}`);
    });
    
    // Set a timeout to reject if server doesn't start
    setTimeout(() => {
      // Check if the server is running by trying to connect
      waitOn({
        resources: ['http://localhost:3000/health'],
        timeout: 5000,
      }).then(() => {
        console.log('Server is responding to health checks');
        resolve();
      }).catch((err) => {
        console.error('Server failed to start:', err);
        reject(new Error('Server failed to start'));
      });
    }, 5000);
  });
}

/**
 * Stop the test server
 */
function stopTestServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log('Stopping test server...');
      if (process.platform === 'win32') {
        // On Windows, we need to use taskkill
        exec(`taskkill /pid ${serverProcess.pid} /f /t`, () => {
          serverProcess = null;
          resolve();
        });
      } else {
        // On Unix-like systems
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        resolve();
      }
    } else {
      resolve();
    }
  });
}

/**
 * Setup global Jest hooks
 */
jest.setTimeout(30000); // Increase timeout for API tests

// Start server before all tests
beforeAll(async () => {
  try {
    await startTestServer();
  } catch (error) {
    console.error('Failed to start test server:', error);
    process.exit(1);
  }
});

// Stop server after all tests
afterAll(async () => {
  await stopTestServer();
});

module.exports = {
  startTestServer,
  stopTestServer,
}; 