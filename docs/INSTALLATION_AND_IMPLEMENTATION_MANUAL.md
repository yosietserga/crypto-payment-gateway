# Crypto Payment Gateway - Installation and Implementation Manual

## Table of Contents

1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation Process](#installation-process)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Blockchain Integration](#blockchain-integration)
   - [Node Connection](#node-connection)
   - [Wallet Management](#wallet-management)
7. [Binance Integration](#binance-integration)
   - [Payment Reception](#payment-reception)
   - [Payout Processing](#payout-processing)
8. [Security Configuration](#security-configuration)
9. [API Integration Guide](#api-integration-guide)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Monitoring and Maintenance](#monitoring-and-maintenance)
13. [Troubleshooting](#troubleshooting)
14. [Appendix](#appendix)

## Introduction

This manual provides comprehensive instructions for installing, configuring, and implementing the Crypto Payment Gateway system. The gateway enables businesses to accept USDT and other BEP20 token payments on the Binance Smart Chain (BSC) network.

### Key Features

- Secure HD wallet management
- Automated transaction monitoring
- Webhook notifications for payment events
- Merchant dashboard for transaction management
- Settlement system for fund transfers
- Comprehensive security features

## System Requirements

### Hardware Requirements

- **CPU**: 4+ cores recommended for production environments
- **RAM**: Minimum 8GB, 16GB recommended for production
- **Storage**: 100GB+ SSD storage recommended
- **Network**: Stable internet connection with low latency

### Software Prerequisites

- **Node.js**: v16.x or later
- **npm**: v8.x or later
- **PostgreSQL**: v13.x or later
- **Redis**: v6.x or later
- **RabbitMQ**: v3.9.x or later
- **Git**: Latest stable version

### Network Requirements

- Outbound access to BSC nodes (port 443/8545)
- Outbound access to npm registry
- Inbound access for API endpoints (configurable, default 3000)

## Installation Process

### 1. Prepare the Environment

Ensure all prerequisite software is installed and running:

```bash
# Verify Node.js and npm versions
node -v
npm -v

# Verify PostgreSQL is running
psql --version

# Verify Redis is running
redis-cli ping

# Verify RabbitMQ is running
rabbitmqctl status
```

### 2. Clone the Repository

```bash
git clone <repository-url>
cd crypto-payment-gateway-trae
```

### 3. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:

- **ethers.js**: For blockchain interactions
- **Express**: For the API server
- **TypeORM**: For database ORM
- **pg**: PostgreSQL client
- **redis**: Redis client
- **amqplib**: RabbitMQ client
- **winston**: For logging
- **jsonwebtoken**: For JWT authentication
- **bcrypt**: For password hashing

### 4. Configure Environment Variables

Create your environment configuration file:

```bash
cp .env.example .env
```

Edit the `.env` file with your specific configuration (see [Configuration](#configuration) section for details).

### 5. Build the Project

Compile TypeScript code to JavaScript:

```bash
npm run build
```

### 6. Database Setup

Create the PostgreSQL database:

```bash
psql -U postgres
CREATE DATABASE crypto_payment_gateway;
\q
```

The application will automatically create tables through TypeORM migrations on first startup.

To manually run migrations:

```bash
npm run migration:run
```

### 7. Start the Application

For development with hot-reloading:

```bash
npm run dev
```

For production:

```bash
npm start
```

## Configuration

### Environment Variables

The `.env` file contains all configuration parameters. Below is a detailed explanation of each setting:

#### Database Configuration

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=crypto_payment_gateway
DB_SSL=false
```

#### Blockchain Configuration

```
# BSC Node URLs (Multiple for redundancy)
BSC_NODE_URL_1=https://bsc-dataseed.binance.org/
BSC_NODE_URL_2=https://bsc-dataseed1.defibit.io/
BSC_NODE_URL_3=https://bsc-dataseed1.ninicoin.io/

# Contract addresses
USDT_CONTRACT_ADDRESS=0x55d398326f99059fF775485246999027B3197955

# Block confirmation threshold
BLOCK_CONFIRMATIONS_REQUIRED=12

# Blockchain polling interval (ms)
BLOCKCHAIN_POLLING_INTERVAL=15000
```

#### Wallet Configuration

```
# HD Wallet mnemonic (KEEP SECURE!)
HD_WALLET_MNEMONIC=your secure mnemonic phrase here

# Encryption key for wallet data
WALLET_ENCRYPTION_KEY=your_secure_encryption_key

# Hot wallet settings
HOT_WALLET_MAX_BALANCE=1000000000 # in smallest unit (wei)
HOT_WALLET_MIN_BALANCE=100000000 # in smallest unit (wei)
```

#### API Configuration

```
API_PORT=3000
API_HOST=0.0.0.0
API_RATE_LIMIT=100 # requests per minute
API_TIMEOUT=30000 # ms
```

#### Security Configuration

```
# JWT settings
JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRATION=86400 # seconds (24 hours)

# API key settings
API_KEY_ENCRYPTION_KEY=your_secure_api_key_encryption

# CORS settings
CORS_ORIGINS=https://your-frontend-domain.com,https://another-domain.com
```

#### Redis Configuration

```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

#### RabbitMQ Configuration

```
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_QUEUE_PREFIX=crypto_payment_
```

#### Webhook Configuration

```
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_INTERVAL=60000 # ms
WEBHOOK_TIMEOUT=10000 # ms
```

#### Logging Configuration

```
LOG_LEVEL=info # debug, info, warn, error
LOG_FILE_PATH=./logs
```

## Database Setup

### Database Schema

The system uses the following core tables:

- **merchants**: Stores merchant account information
- **api_keys**: API keys for merchant authentication
- **payment_addresses**: Generated payment addresses for merchants
- **transactions**: Blockchain transaction records
- **webhooks**: Webhook configuration and delivery status
- **settlements**: Settlement transaction records

### Database Migrations

The system uses TypeORM migrations for database schema management. Migration files are located in `src/db/migrations/`.

To create a new migration after entity changes:

```bash
npm run migration:generate -- -n MigrationName
```

To run pending migrations:

```bash
npm run migration:run
```

To revert the last migration:

```bash
npm run migration:revert
```

## Blockchain Integration

### Node Configuration

The system requires reliable access to BSC nodes. For production environments, consider:

1. **Dedicated Node Providers**:
   
   - QuickNode
   - Chainstack
   - GetBlock
   - Moralis

2. **Self-hosted Nodes**:
   
   - Requires significant resources
   - Provides maximum reliability and control

Configure multiple node endpoints for redundancy in the `.env` file.

### Contract Interaction

The system interacts with BEP20 token contracts (primarily USDT) using ethers.js. Key interactions include:

- **Balance Checking**: Monitoring address balances
- **Transaction Verification**: Validating incoming transactions
- **Settlement Transfers**: Moving funds to settlement addresses

### Transaction Monitoring

The `TransactionMonitorService` continuously monitors the blockchain for relevant transactions:

1. **Block Scanning**: Polls for new blocks at the configured interval
2. **Transaction Filtering**: Identifies transactions involving monitored addresses
3. **Confirmation Tracking**: Waits for the required number of confirmations
4. **Event Triggering**: Dispatches events for confirmed transactions

## Binance Integration

The Crypto Payment Gateway provides integration with Binance services for both receiving payments and processing payouts.

### Payment Reception

Binance payment reception functionality allows merchants to accept cryptocurrency payments through Binance's infrastructure.

For detailed setup instructions, refer to the payment reception documentation.

### Payout Processing

The Crypto Payment Gateway now supports automated payouts via Binance, allowing merchants to programmatically send cryptocurrency to their customers or vendors.

#### Prerequisites

- Binance account with API access enabled
- Sufficient funds in your Binance wallet
- API keys with withdrawal permissions
- Whitelisted withdrawal addresses in Binance settings

#### Configuration

1. **Set up Binance API credentials**
   Add the following environment variables to your `.env` file:
   
   ```
   BINANCE_API_KEY=your_binance_api_key
   BINANCE_API_SECRET=your_binance_api_secret
   BINANCE_PAYOUT_ENABLED=true
   ```

2. **Whitelist withdrawal addresses**
   For security reasons, Binance requires all withdrawal addresses to be whitelisted. Add recipient addresses through the Binance web interface before attempting withdrawals.

#### Implementation

The payout functionality is implemented through the `QueueService` class with a fault-tolerant design:

- When RabbitMQ is available, payout requests are processed through a dedicated queue
- If RabbitMQ is unavailable, the system falls back to direct processing
- Comprehensive error handling and status updates are provided through webhooks

For detailed implementation and API documentation, refer to the [Payout Integration Guide](./PAYOUT_INTEGRATION.md).

## Security Configuration

### Wallet Security

#### HD Wallet Management

The system uses a hierarchical deterministic (HD) wallet to generate unique addresses for each payment. The HD wallet mnemonic is the most sensitive piece of information in the system.

**Secure Storage Options:**

1. **Hardware Security Module (HSM)**
2. **AWS Secrets Manager or similar cloud service**
3. **Encrypted storage with strict access controls**

#### Key Encryption

All sensitive keys are encrypted at rest using AES-256 encryption. The encryption keys themselves should be securely managed.

### API Security

#### Authentication

The system supports multiple authentication methods:

1. **API Keys**: For merchant integrations
2. **JWT Tokens**: For admin dashboard access

#### Authorization

Role-based access control (RBAC) is implemented for different user types:

- **Merchants**: Access only to their own resources
- **Admins**: Full system access
- **Operators**: Limited administrative access

#### Request Security

- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: Validates all incoming data
- **CORS Protection**: Restricts cross-origin requests
- **HTTPS**: Required for all API communications

## API Integration Guide

### Authentication

All API requests must include authentication using one of the following methods:

#### API Key Authentication

```
X-API-Key: your_api_key
```

#### JWT Authentication (Admin Dashboard)

```
Authorization: Bearer your_jwt_token
```

### Core Endpoints

#### Generate Payment Address

```
POST /api/v1/addresses
Content-Type: application/json
X-API-Key: your_api_key

{
  "reference": "order_123",
  "amount": "100.50",
  "currency": "USDT",
  "callbackUrl": "https://your-callback-url.com/webhook"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "reference": "order_123",
    "amount": "100.50",
    "currency": "USDT",
    "expiresAt": "2023-12-31T23:59:59Z"
  }
}
```

#### Check Payment Status

```
GET /api/v1/payments/order_123
X-API-Key: your_api_key
```

Response:

```json
{
  "success": true,
  "data": {
    "reference": "order_123",
    "status": "confirmed",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "amount": "100.50",
    "amountReceived": "100.50",
    "currency": "USDT",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "confirmations": 12,
    "confirmedAt": "2023-12-30T15:30:45Z"
  }
}
```

#### Configure Webhooks

```
POST /api/v1/webhooks
Content-Type: application/json
X-API-Key: your_api_key

{
  "url": "https://your-callback-url.com/webhook",
  "events": ["payment.pending", "payment.confirmed", "payment.failed"],
  "secret": "your_webhook_secret"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "wh_123456",
    "url": "https://your-callback-url.com/webhook",
    "events": ["payment.pending", "payment.confirmed", "payment.failed"]
  }
}
```

### Webhook Events

The system sends webhook notifications for various events. Each webhook request includes:

- A signature header for verification
- Event type and timestamp
- Relevant event data

#### Webhook Signature Verification

Webhook requests include a `X-Signature` header that should be verified:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const calculatedSignature = hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(calculatedSignature),
    Buffer.from(signature)
  );
}
```

#### Example Webhook Payload

```json
{
  "event": "payment.confirmed",
  "timestamp": "2023-12-30T15:30:45Z",
  "data": {
    "reference": "order_123",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "amount": "100.50",
    "currency": "USDT",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "confirmations": 12
  }
}
```

## Testing

### Automated Tests

The system includes comprehensive test suites:

```bash
# Run all tests
npm test

# Run specific test category
npm test -- --grep="Blockchain"

# Run tests with coverage report
npm run test:coverage
```

### Manual Testing

#### Test Environment Setup

1. Configure the system to use BSC Testnet
2. Obtain testnet tokens from a faucet
3. Create test merchant accounts

#### Testing Scenarios

1. **Address Generation**: Verify unique addresses are generated
2. **Payment Processing**: Send test transactions and verify detection
3. **Webhook Delivery**: Confirm webhooks are delivered correctly
4. **Error Handling**: Test system response to various error conditions

## Deployment

### Development Environment

```bash
npm run dev
```

### Production Deployment

#### Prerequisites

- Node.js production environment
- PM2 or similar process manager
- Nginx or similar reverse proxy
- SSL certificate

#### Deployment Steps

1. Clone and build the application:

```bash
git clone <repository-url>
cd crypto-payment-gateway-trae
npm install --production
npm run build
```

2. Configure environment variables for production

3. Set up PM2 process management:

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
```

4. Configure Nginx as a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. Set up SSL with Let's Encrypt or similar provider

### Docker Deployment

The system can also be deployed using Docker:

```bash
# Build the Docker image
docker build -t crypto-payment-gateway .

# Run with Docker Compose
docker-compose up -d
```

## Monitoring and Maintenance

### Logging

The application generates detailed logs in the `logs/` directory:

- `combined.log`: All log messages
- `error.log`: Error messages only

Log levels can be configured in the `.env` file.

### Monitoring

#### Health Checks

The system provides health check endpoints:

```
GET /health
GET /health/db
GET /health/blockchain
GET /health/queue
```

#### Metrics

For advanced monitoring, consider implementing:

1. **Prometheus + Grafana**: For metrics collection and visualization
2. **ELK Stack**: For log aggregation and analysis
3. **Alerting**: Set up alerts for critical conditions

### Maintenance Tasks

#### Database Maintenance

- Regular backups
- Index optimization
- Data archiving for older records

#### Security Updates

- Regular dependency updates
- Security patch application
- Periodic security audits

## Troubleshooting

### Common Issues

#### Connection Issues

**Symptoms**: Unable to connect to database, Redis, or RabbitMQ

**Solutions**:

- Verify service is running
- Check connection credentials
- Ensure network connectivity
- Check firewall settings

#### Blockchain Synchronization Issues

**Symptoms**: Transactions not being detected or confirmed

**Solutions**:

- Verify BSC node connectivity
- Check node synchronization status
- Increase polling interval temporarily
- Try alternative node endpoints

#### Webhook Delivery Failures

**Symptoms**: Webhooks not being received by merchant systems

**Solutions**:

- Check webhook URL accessibility
- Verify webhook signature configuration
- Check webhook delivery logs
- Test webhook endpoint with manual requests

### Diagnostic Tools

#### Log Analysis

Examine logs for error patterns:

```bash
grep ERROR logs/error.log
```

#### Database Diagnostics

Check database connection and query performance:

```bash
npm run db:diagnostics
```

#### Blockchain Diagnostics

Verify blockchain connectivity and synchronization:

```bash
npm run blockchain:diagnostics
```

## Appendix

### API Reference

Complete API documentation is available at:

```
http://your-server:3000/api-docs
```

### Environment Variable Reference

See the [Configuration](#configuration) section for details on all available environment variables.

### Useful Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run linting
npm run lint

# Generate database migration
npm run migration:generate -- -n MigrationName

# Run database migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```



---

© 2023 Crypto Payment Gateway. All rights reserved.


