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
- Wallet settings
- Security keys
- Other configuration parameters

### 4. Build the project

Compile the TypeScript code to JavaScript:

```bash
npm run build
```

### 5. Start the development server

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

## Additional Configuration

### Blockchain Configuration

Ensure you have proper access to BSC nodes. For production, it's recommended to use dedicated node providers or run your own nodes.

### Wallet Security

For production environments, ensure your HD wallet mnemonic and private keys are properly secured and never committed to the repository.

### Message Queue

Make sure RabbitMQ is running and accessible with the credentials specified in your .env file.

## Troubleshooting

If you encounter any issues during setup:

1. Check that all required services (PostgreSQL, Redis, RabbitMQ) are running
2. Verify your environment variables are correctly set
3. Check the logs for specific error messages

## Development Commands

- `npm run lint` - Run code linting
- `npm test` - Run tests
- `npm run build` - Build the project
- `npm run dev` - Start development server with hot-reloading
- `npm start` - Start production server