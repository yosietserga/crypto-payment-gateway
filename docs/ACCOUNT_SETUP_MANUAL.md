# Crypto Payment Gateway - Account Setup Manual

## 2. Account Setup Requirements

### 2.1 Binance Account Setup

#### 2.1.1 Create Binance Account
1. Visit https://www.binance.com
2. Click "Register" and follow these steps:
   - Enter your email address
   - Create a strong password
   - Complete the verification process
   - Set up 2FA (Two-Factor Authentication) using Google Authenticator

#### 2.1.2 Complete KYC Verification
1. Log in to your Binance account
2. Go to "User Center" → "Verification"
3. Choose "Verified" level (required for API access)
4. Provide required documents:
   - Government-issued ID
   - Selfie with ID
   - Proof of address
5. Wait for verification approval (usually 24-48 hours)

#### 2.1.3 Create API Keys
1. Log in to your Binance account
2. Navigate to "API Management":
   - Go to "User Center"
   - Click "API Management"
   - Click "Create API"

3. Configure API Key settings:
   ```
   Name: Crypto Payment Gateway
   Access Restrictions:
   - Enable Reading
   - Enable Trading
   - Enable Withdrawals
   - Disable Futures
   - Disable Margin
   ```

4. Set IP restrictions:
   - Add your server's IP address
   - Add your development team's IP addresses
   - Add your monitoring system IPs

5. Save API credentials securely:
   ```
   API Key: [Save this immediately]
   Secret Key: [Save this immediately]
   ```

6. Additional security measures:
   - Enable "Withdrawals Whitelist"
   - Set withdrawal limits
   - Enable email notifications for withdrawals
   - Enable SMS notifications for withdrawals

### 2.2 Blockchain Node Access Setup

#### 2.2.1 Option 1: Using a Node Provider Service
1. Choose a reliable BSC node provider:
   - QuickNode (https://www.quicknode.com)
   - GetBlock (https://getblock.io)
   - Ankr (https://www.ankr.com)

2. Sign up for an account:
   - Create account
   - Select BSC Mainnet
   - Choose appropriate plan
   - Add payment method

3. Create and configure node:
   ```
   Network: BSC Mainnet
   Node Type: Dedicated
   Location: Choose closest to your server
   ```

4. Get node credentials:
   ```
   HTTP Endpoint: https://your-node-url
   WebSocket Endpoint: wss://your-node-url
   ```

#### 2.2.2 Option 2: Running Your Own BSC Node
1. Hardware Requirements:
   ```
   CPU: 8+ cores
   RAM: 16GB minimum
   Storage: 1TB SSD
   Network: 100Mbps minimum
   ```

2. Install BSC Node Software:
   ```bash
   # Install geth
   sudo add-apt-repository -y ppa:ethereum/ethereum
   sudo apt-get update
   sudo apt-get install ethereum

   # Initialize BSC node
   geth --datadir ./bsc-node init genesis.json
   ```

3. Configure node settings:
   ```json
   {
     "network": "mainnet",
     "syncmode": "full",
     "http": true,
     "http.addr": "0.0.0.0",
     "http.port": 8545,
     "http.api": "eth,net,web3,personal,admin",
     "http.corsdomain": "*"
   }
   ```

4. Start the node:
   ```bash
   geth --config ./config.toml --datadir ./bsc-node
   ```

#### 2.2.3 Option 3: Multiple Public RPC Endpoints
1. Configure multiple RPC endpoints in your `.env`:
   ```
   BSC_MAINNET_RPC_URL_1=https://bsc-dataseed.binance.org/
   BSC_MAINNET_RPC_URL_2=https://bsc-dataseed1.defibit.io/
   BSC_MAINNET_RPC_URL_3=https://bsc-dataseed1.ninicoin.io/
   BSC_MAINNET_RPC_URL_4=https://bsc-dataseed2.defibit.io/
   ```

2. Configure WebSocket endpoints:
   ```
   BSC_MAINNET_WS_URL_1=wss://bsc-ws-node.nariox.org:443
   BSC_MAINNET_WS_URL_2=wss://bsc-mainnet.nodereal.io/ws
   ```

### 2.3 Wallet Setup

#### 2.3.1 Hot Wallet Configuration
1. Generate a new HD wallet:
   ```bash
   # Using ethers.js
   const wallet = ethers.Wallet.createRandom();
   console.log("Mnemonic:", wallet.mnemonic.phrase);
   console.log("Address:", wallet.address);
   ```

2. Secure the mnemonic:
   - Store in a secure password manager
   - Create encrypted backups
   - Never store in plain text

3. Configure hot wallet parameters:
   ```
   HOT_WALLET_THRESHOLD=10000  # Maximum USDT in hot wallet
   ADDRESS_EXPIRATION_TIME=86400000  # 24 hours in milliseconds
   ```

#### 2.3.2 Cold Wallet Setup
1. Create a cold wallet:
   - Use a hardware wallet (Ledger/Trezor)
   - Generate new addresses
   - Document recovery process

2. Configure cold wallet parameters:
   ```
   COLD_WALLET_ADDRESS=your_cold_wallet_address
   COLD_WALLET_MIN_BALANCE=100000  # Minimum USDT to maintain
   ```

### 2.4 Security Setup

#### 2.4.1 API Security
1. Generate secure keys:
   ```bash
   # Generate JWT secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   
   # Generate webhook secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Generate encryption key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Configure rate limiting:
   ```
   API_RATE_LIMIT=100  # requests per minute
   API_TIMEOUT=30000  # milliseconds
   ```

#### 2.4.2 Network Security
1. Configure firewall rules:
   ```bash
   # Allow necessary ports
   sudo ufw allow 3000/tcp  # API server
   sudo ufw allow 5432/tcp  # PostgreSQL
   sudo ufw allow 6379/tcp  # Redis
   sudo ufw allow 5672/tcp  # RabbitMQ
   ```

2. Set up SSL/TLS:
   - Obtain SSL certificate
   - Configure HTTPS
   - Enable HSTS
   - Set up automatic renewal

### 2.5 Monitoring Setup

#### 2.5.1 System Monitoring
1. Set up monitoring tools:
   - Prometheus for metrics
   - Grafana for visualization
   - AlertManager for notifications

2. Configure alerts for:
   - Node health
   - Wallet balances
   - Transaction status
   - API performance

#### 2.5.2 Logging Configuration
1. Set up log rotation:
   ```bash
   /var/log/crypto-payment/*.log {
       daily
       rotate 14
       compress
       delaycompress
       missingok
       notifempty
       create 0640 www-data www-data
   }
   ```

2. Configure log levels:
   ```
   LOG_LEVEL=info
   LOG_DIRECTORY=/var/log/crypto-payment
   ```

## Important Notes

Remember to:
- Keep all credentials secure
- Regularly backup configuration
- Monitor system health
- Update security settings
- Test failover procedures
- Document all changes

This manual provides detailed steps for setting up all necessary accounts and services for the crypto payment gateway. Each section includes specific commands, configurations, and best practices for a production environment. 