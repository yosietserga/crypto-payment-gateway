# Setup Instructions for Crypto Payment Gateway

## Prerequisites

- Node.js (v16.x or later)
- npm (v8.x or later)
- PostgreSQL (v13.x or later)
- Redis (v6.x or later)
- RabbitMQ (v3.9.x or later)

## Installation Steps

### 1. Clone the repository

If you haven't already cloned the repository, do so with:

```bash
git clone <repository-url>
cd crypto-payment-gateway-trae
```

### 2. Install dependencies

Run the following command to install all required dependencies:

```bash
npm install
```

This will install all dependencies defined in the package.json file, including:

- ethers.js for blockchain interactions
- Express for the API server
- TypeORM and pg for PostgreSQL database connections
- Redis for caching
- amqplib for RabbitMQ message queue
- And all other required packages

### 3. Set up environment variables

Copy the example environment file to create your own:

```bash
cp .env.example .env
```

Then edit the `.env` file to configure your:
- Database connection details
- Blockchain node URLs
- Contract addresses
- Wallet settings (HD Wallet and/or Binance API)
- Security keys
- Other configuration parameters

### 4. Binance API Configuration (New)

For using the Binance exchange wallet instead of a local HD wallet, configure the following settings in your `.env` file:

```
# Binance API Configuration
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
BINANCE_API_URL=https://api.binance.com
# Set to 'true' to use Binance wallet for all operations, 'false' to use local HD wallet
USE_BINANCE_WALLET=false
```

Make sure your Binance API key has the following permissions:
- Enable Reading
- Enable Trading
- Enable Withdrawals
- IP restriction recommended for production

### 5. Build the project

Compile the TypeScript code to JavaScript:

```bash
npm run build
```

### 6. Start the development server

For development with hot-reloading:

```bash
npm run dev
```

For production:

```bash
npm start
```

## Database Setup

1. Create a PostgreSQL database:

```sql
CREATE DATABASE crypto_payment_gateway;
```

2. The application will automatically create the necessary tables on startup through TypeORM migrations.

## Webapp Configuration

The gateway includes a payment processing web application located in the `payment-webapp` directory. To use it:

1. Configure your API key in `payment-webapp/js/app.js`
2. Host the webapp on your web server or a CDN
3. Use the webapp for both receiving payments and sending payouts

## Payment Flow Features

### Receiving Payments

The system supports receiving cryptocurrency payments from customers:

1. An external app sends an HTTP request to create a payment address
2. Customer pays to the generated USDT/BEP20 address
3. System monitors the blockchain for incoming transactions
4. Transaction status updates are sent via webhooks
5. Merchant receives confirmation when payment is complete

### Sending Payouts (New)

The system now supports sending payouts to customers:

1. Send an HTTP request to `/api/v1/transactions/payout` with:
   - Amount to send
   - Recipient address (USDT/BEP20)
   - Merchant callback URL
   - Webhook notification URL
2. System processes the payout request
3. Transaction status updates are sent via webhooks
4. Payout is confirmed once transaction is processed

## Webhook Notifications

The system sends webhook notifications at various stages of the payment/payout process:

### Payment Webhooks
- `payment.received` - Initial payment received
- `payment.confirmed` - Payment confirmed on blockchain
- `payment.completed` - Payment fully processed
- `payment.failed` - Payment processing failed

### Payout Webhooks (New)
- `payout.initiated` - Payout request received
- `payout.processing` - Payout is being processed
- `payout.completed` - Payout successfully sent
- `payout.failed` - Payout failed to process

## Additional Configuration

### Blockchain Configuration

Ensure you have proper access to BSC nodes. For production, it's recommended to use dedicated node providers or run your own nodes.

### Wallet Security

For production environments, ensure your HD wallet mnemonic, private keys, and Binance API credentials are properly secured and never committed to the repository.

### Message Queue

Make sure RabbitMQ is running and accessible with the credentials specified in your .env file.

## Troubleshooting

If you encounter any issues during setup:

1. Check that all required services (PostgreSQL, Redis, RabbitMQ) are running
2. Verify your environment variables are correctly set
3. Check the logs for specific error messages
4. Ensure blockchain nodes are accessible and responding
5. Verify network connectivity for all external services
6. For Binance API issues, confirm API key permissions and IP restrictions

## Development Commands

- `npm run lint` - Run code linting
- `npm test` - Run tests
- `npm run build` - Build the project
- `npm run dev` - Start development server with hot-reloading
- `npm start` - Start production server

## Monitoring and Maintenance

The application generates detailed logs in the `logs/` directory. Review these files regularly to detect potential issues:

- `combined.log` - All logs
- `error.log` - Errors only

For more advanced monitoring, consider implementing a solution like ELK Stack (Elasticsearch, Logstash, Kibana) or Prometheus with Grafana.