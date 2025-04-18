# Binance Payout Integration

## Overview

The Crypto Payment Gateway now supports automated payouts via Binance, allowing merchants to programmatically send cryptocurrency to their customers or vendors. This document describes how to use and integrate with the payout functionality.

## Prerequisites

- Binance account with API access enabled
- Sufficient funds in your Binance wallet
- API keys with withdrawal permissions
- Whitelisted withdrawal addresses in Binance settings

## Configuration

### 1. Set up Binance API credentials

Add the following environment variables to your `.env` file:

```
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
BINANCE_PAYOUT_ENABLED=true
```

### 2. Whitelist withdrawal addresses

For security reasons, Binance requires all withdrawal addresses to be whitelisted. Add recipient addresses through the Binance web interface before attempting withdrawals.

## Making a Payout

### API Endpoint

```
POST /api/v1/payout
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| amount | string | Yes | Amount to withdraw (example: "0.05") |
| currency | string | Yes | Currency code (example: "USDT", "BTC") |
| network | string | Yes | Blockchain network (example: "BSC", "ETH", "BTC") |
| recipientAddress | string | Yes | Recipient wallet address |
| merchantId | string | Yes | Your merchant ID |
| webhookUrl | string | No | URL to receive status updates |
| callbackUrl | string | No | URL for redirect after completion |
| metadata | object | No | Custom metadata for your reference |

### Example Request

```json
{
  "amount": "50.00",
  "currency": "USDT",
  "network": "BSC",
  "recipientAddress": "0x123456789abcdef...",
  "merchantId": "mer_abc123",
  "webhookUrl": "https://your-domain.com/webhooks/crypto",
  "metadata": {
    "orderId": "order_123",
    "customerName": "John Doe"
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "tx_d3f4c5e6f7",
    "status": "PENDING",
    "amount": "50.00",
    "currency": "USDT",
    "network": "BSC",
    "recipientAddress": "0x123456789abcdef...",
    "createdAt": "2025-04-18T00:00:00.000Z"
  }
}
```

## Webhook Events

The system will send webhook notifications with the following events:

| Event | Description |
|-------|-------------|
| PAYOUT_PENDING | Payout has been created and is pending processing |
| PAYOUT_PROCESSING | Payout is being processed by Binance |
| PAYOUT_COMPLETED | Payout has been completed successfully |
| PAYOUT_FAILED | Payout failed to process |

### Webhook Payload Example

```json
{
  "event": "PAYOUT_COMPLETED",
  "data": {
    "id": "tx_d3f4c5e6f7",
    "status": "COMPLETED",
    "amount": "50.00",
    "currency": "USDT",
    "network": "BSC",
    "recipientAddress": "0x123456789abcdef...",
    "txHash": "0xabcdef1234567890...",
    "completedAt": "2025-04-18T00:05:00.000Z"
  }
}
```

## Error Handling

Payout processing is handled through a queue system with fallback mechanisms:

1. If RabbitMQ is available, payouts are processed through the `binance.payout` queue
2. If RabbitMQ is unavailable, the system enters "fallback mode" and processes payouts directly
3. Failed payouts result in the transaction status being set to `FAILED` and a webhook notification

Common error scenarios:

- Insufficient funds in Binance wallet
- Invalid recipient address
- Network congestion or timeouts
- Binance API rate limiting
- Recipient address not whitelisted in Binance

## Web Interface

The Crypto Payment Gateway includes a web interface for initiating payouts. Access it through:

```
/payment-webapp/index.html
```

Select the "Send Payout" tab to use the payout functionality.

## Transaction Status Flow

Payouts follow this status progression:

1. `PENDING` - Initial state when payout is created
2. `CONFIRMING` (labeled as PROCESSING in webhooks) - Being processed by Binance
3. `COMPLETED` - Successfully processed
4. `FAILED` - Processing failed

## Limitations

- Withdrawal minimums are determined by Binance's policies
- Withdrawal fees are set by Binance and may vary by currency and network
- Binance may temporarily disable withdrawals for maintenance 