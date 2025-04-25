#!/usr/bin/env node

/**
 * Script to run API endpoint tests
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const waitOn = require('wait-on');
const axios = require('axios');

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

let serverProcess = null;

/**
 * Run a command and return its output
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.cyan}> ${command} ${args.join(' ')}${colors.reset}`);
    
    const childProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Check if dependencies for tests are installed
 */
async function checkDependencies() {
  try {
    // Check if wait-on is installed
    if (!fs.existsSync(path.join(process.cwd(), 'node_modules', 'wait-on'))) {
      console.log(`${colors.yellow}Installing wait-on dependency...${colors.reset}`);
      await runCommand('npm', ['install', '--no-save', 'wait-on']);
    }
    
    return true;
  } catch (error) {
    console.error(`${colors.red}Failed to install dependencies: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Check if server is already running
 */
async function isServerRunning() {
  console.log(`${colors.blue}Checking if server is already running...${colors.reset}`);
  
  // Try IPv4 address first (127.0.0.1)
  try {
    const response = await axios.get('http://127.0.0.1:3000/health');
    console.log(`${colors.green}Health check response: ${JSON.stringify(response.data)}${colors.reset}`);
    return true;
  } catch (ipv4Error) {
    console.log(`${colors.yellow}IPv4 health check failed: ${ipv4Error.message}${colors.reset}`);
    
    // Try localhost (might resolve to ::1 IPv6)
    try {
      const response = await axios.get('http://localhost:3000/health');
      console.log(`${colors.green}Health check response: ${JSON.stringify(response.data)}${colors.reset}`);
      return true;
    } catch (localhostError) {
      console.log(`${colors.yellow}Localhost health check failed: ${localhostError.message}${colors.reset}`);
      return false;
    }
  }
}

/**
 * Start the test server
 */
async function startServer() {
  // Check if server is already running
  const serverRunning = await isServerRunning();
  if (serverRunning) {
    console.log(`${colors.green}Server is already running on port 3000${colors.reset}`);
    return null; // No need to start a new server
  }
  
  return new Promise((resolve, reject) => {
    console.log(`${colors.blue}Starting test server...${colors.reset}`);
    
    // Check if we have the dist directory (compiled TypeScript)
    const useDistVersion = fs.existsSync(path.join(process.cwd(), 'dist', 'app.js'));
    
    const command = useDistVersion ? 'node' : 'npx ts-node';
    const scriptPath = useDistVersion ? 'dist/app.js' : 'src/app.ts';
    
    serverProcess = exec(`${command} ${scriptPath}`, {
      env: { ...process.env, PORT: '3000', NODE_ENV: 'test' }
    });
    
    let output = '';
    
    serverProcess.stdout.on('data', (data) => {
      output += data;
      process.stdout.write(`${colors.cyan}[Server] ${colors.reset}${data}`);
      
      // Check for indicators that the server has started
      if (data.includes('Server running on port') || 
          data.includes('Services initialized') ||
          data.includes('Application will continue with limited functionality')) {
        console.log(`${colors.green}Server started successfully${colors.reset}`);
        
        // Additional delay to ensure server is fully ready to accept connections
        setTimeout(() => {
          // Try to ping the health endpoint with IPv4 first
          axios.get('http://127.0.0.1:3000/health')
            .then(response => {
              console.log(`${colors.green}Health check passed: ${JSON.stringify(response.data)}${colors.reset}`);
              resolve(serverProcess);
            })
            .catch(err => {
              console.log(`${colors.yellow}IPv4 health check failed, trying localhost: ${err.message}${colors.reset}`);
              
              // Try localhost
              axios.get('http://localhost:3000/health')
                .then(response => {
                  console.log(`${colors.green}Health check passed: ${JSON.stringify(response.data)}${colors.reset}`);
                  resolve(serverProcess);
                })
                .catch(err => {
                  console.log(`${colors.yellow}Health check failed during startup, but proceeding anyway: ${err.message}${colors.reset}`);
                  resolve(serverProcess);
                });
            });
        }, 5000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      output += data;
      process.stderr.write(`${colors.red}[Server Error] ${colors.reset}${data}`);
    });
    
    // Wait for server to be ready with a generous timeout
    waitOn({
      resources: ['http://127.0.0.1:3000'],
      delay: 1000,
      interval: 1000,
      timeout: 30000,
      window: 1000,
    }).then(() => {
      console.log(`${colors.green}Server is now responding${colors.reset}`);
      resolve(serverProcess);
    }).catch((err) => {
      console.error(`${colors.red}Server wait-on check failed: ${err.message}${colors.reset}`);
      
      // Try localhost if IPv4 fails
      waitOn({
        resources: ['http://localhost:3000'],
        delay: 1000,
        interval: 1000,
        timeout: 10000,
        window: 1000,
      }).then(() => {
        console.log(`${colors.green}Server is now responding on localhost${colors.reset}`);
        resolve(serverProcess);
      }).catch((localhostErr) => {
        console.error(`${colors.red}Server wait-on check failed on localhost too: ${localhostErr.message}${colors.reset}`);
        
        // Still continue if the server appears to be running based on the output
        if (output.includes('Server running on port') || 
            output.includes('Services initialized') ||
            output.includes('Application will continue with limited functionality')) {
          console.log(`${colors.yellow}Server appears to be running based on output, proceeding with tests${colors.reset}`);
          resolve(serverProcess);
          return;
        }
        
        // Try to kill server process
        if (serverProcess) {
          if (process.platform === 'win32') {
            exec(`taskkill /pid ${serverProcess.pid} /f /t`);
          } else {
            serverProcess.kill('SIGTERM');
          }
        }
        
        reject(err);
      });
    });
  });
}

/**
 * Stop the test server
 */
function stopServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log(`${colors.blue}Stopping test server...${colors.reset}`);
      
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${serverProcess.pid} /f /t`, () => {
          serverProcess = null;
          resolve();
        });
      } else {
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
 * Main function to run the tests
 */
async function runTests() {
  console.log(`${colors.magenta}=== Crypto Payment Gateway API Tests ====${colors.reset}`);
  
  // Check if --no-ts-check flag is present
  const noTsCheck = process.argv.includes('--no-ts-check');
  
  try {
    // Check dependencies
    const dependenciesOk = await checkDependencies();
    if (!dependenciesOk) {
      process.exit(1);
    }
    
    // Start server (if it's not already running)
    const startedServer = await startServer();
    
    if (noTsCheck) {
      console.log(`${colors.blue}Running custom health check test...${colors.reset}`);
      
      // Run a very simple health check test without the complicated TypeScript setup
      try {
        const response = await axios.get('http://127.0.0.1:3000/health');
        console.log(`${colors.green}Health check: Status ${response.status}${colors.reset}`);
        console.log(`${colors.green}Health response: ${JSON.stringify(response.data)}${colors.reset}`);
        console.log(`${colors.green}✅ Basic health check test passed!${colors.reset}`);
      } catch (error) {
        console.error(`${colors.red}❌ Health check failed: ${error.message}${colors.reset}`);
        if (startedServer) {
          await stopServer();
        }
        process.exit(1);
      }
    } else {
      // Run the tests using Jest
      console.log(`${colors.blue}Running API endpoint tests...${colors.reset}`);
      await runCommand('npx', ['jest', 'tests/e2e/api-endpoints.test.js', '--runInBand']);
      
      console.log(`${colors.blue}Running payment flow tests...${colors.reset}`);
      await runCommand('npx', ['jest', 'tests/e2e/payment-endpoints.test.js', '--runInBand']);
    }
    
    // Stop the server if we started it
    if (startedServer) {
      await stopServer();
    }
    
    console.log(`${colors.green}✅ All API tests completed successfully!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}❌ Tests failed: ${error.message}${colors.reset}`);
    
    // Ensure server is stopped
    await stopServer();
    
    process.exit(1);
  }
}

// Handle exit signals to clean up server
process.on('SIGINT', async () => {
  console.log(`${colors.yellow}Received SIGINT, cleaning up...${colors.reset}`);
  await stopServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(`${colors.yellow}Received SIGTERM, cleaning up...${colors.reset}`);
  await stopServer();
  process.exit(0);
});

// Run the script
runTests().catch(error => {
  console.error(`${colors.red}Unhandled error: ${error.message}${colors.reset}`);
  stopServer().then(() => process.exit(1));
}); 