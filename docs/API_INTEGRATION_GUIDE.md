# Crypto Payment Gateway - API Integration Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
5. [Webhooks](#webhooks)
6. [Testing](#testing)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)
9. [Sample Implementations](#sample-implementations)
10. [Troubleshooting](#troubleshooting)

## Introduction

This guide provides comprehensive instructions for integrating with the Crypto Payment Gateway API at [https://eoscryptopago.com/](https://eoscryptopago.com/). Our API allows you to accept cryptocurrency payments, manage transactions, and automate settlements through a simple RESTful interface.

### Key Features

- Accept USDT and other BEP20 token payments
- Real-time payment notifications
- Automated settlement to your wallet
- Comprehensive transaction reporting
- Secure API with HMAC authentication

## Getting Started

### Prerequisites

Before you begin integration, ensure you have:

1. A merchant account on [https://eoscryptopago.com/](https://eoscryptopago.com/)
2. API credentials (API key and secret)
3. Basic understanding of RESTful APIs and JSON
4. A publicly accessible endpoint for receiving webhooks

### Registration Process

1. Visit [https://eoscryptopago.com/register](https://eoscryptopago.com/register)
2. Complete the merchant registration form
3. Verify your email address
4. Complete the KYC/KYB verification process
5. Generate API credentials from your merchant dashboard

## Authentication

All API requests must be authenticated using HMAC signatures.

### Headers Required

```
X-API-KEY: your_api_key
X-TIMESTAMP: current_timestamp_in_milliseconds
X-SIGNATURE: hmac_signature
```

### Generating HMAC Signature

```javascript
// JavaScript example
const crypto = require('crypto');

function generateSignature(apiSecret, timestamp, requestBody) {
  const message = timestamp + (requestBody ? JSON.stringify(requestBody) : '');
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

const timestamp = Date.now().toString();
const signature = generateSignature('your_api_secret', timestamp, requestBody);
```

```php
// PHP example
function generateSignature($apiSecret, $timestamp, $requestBody) {
  $message = $timestamp . ($requestBody ? json_encode($requestBody) : '');
  return hash_hmac('sha256', $message, $apiSecret);
}

$timestamp = (string)time() * 1000;
$signature = generateSignature('your_api_secret', $timestamp, $requestBody);
```

## API Endpoints

The base URL for all API requests is: `https://eoscryptopago.com/api/v1`

### Create Payment Address

```
POST /payment-addresses
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| currency | string | Yes | Currency code (e.g., "USDT") |
| expectedAmount | string | Yes | Expected payment amount |
| expiresAt | string | No | Expiration timestamp (ISO format) |
| callbackUrl | string | No | URL to receive payment notifications |
| metadata | object | No | Custom data to associate with this payment |

**Example Request:**

```json
{
  "currency": "USDT",
  "expectedAmount": "100.00",
  "expiresAt": "2023-12-31T23:59:59Z",
  "callbackUrl": "https://your-website.com/payment-callback",
  "metadata": {
    "orderId": "ORD-12345",
    "customerEmail": "customer@example.com"
  }
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "addr_1a2b3c4d5e",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "currency": "USDT",
    "expectedAmount": "100.00",
    "status": "ACTIVE",
    "expiresAt": "2023-12-31T23:59:59Z",
    "createdAt": "2023-06-01T12:00:00Z"
  }
}
```

### Get Payment Address

```
GET /payment-addresses/{addressId}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "addr_1a2b3c4d5e",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "currency": "USDT",
    "expectedAmount": "100.00",
    "status": "ACTIVE",
    "expiresAt": "2023-12-31T23:59:59Z",
    "createdAt": "2023-06-01T12:00:00Z"
  }
}
```

### List Transactions

```
GET /transactions
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status (e.g., "PENDING", "CONFIRMED") |
| fromDate | string | No | Start date (ISO format) |
| toDate | string | No | End date (ISO format) |
| page | number | No | Page number (default: 1) |
| limit | number | No | Results per page (default: 20, max: 100) |

**Example Response:**

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "tx_1a2b3c4d5e",
        "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        "status": "CONFIRMED",
        "type": "PAYMENT",
        "amount": "100.00",
        "currency": "USDT",
        "fromAddress": "0x0987654321fedcba0987654321fedcba09876543",
        "toAddress": "0x1234567890abcdef1234567890abcdef12345678",
        "confirmations": 12,
        "createdAt": "2023-06-01T12:30:00Z",
        "updatedAt": "2023-06-01T12:45:00Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
}
```

### Get Transaction

```
GET /transactions/{transactionId}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "tx_1a2b3c4d5e",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "status": "CONFIRMED",
    "type": "PAYMENT",
    "amount": "100.00",
    "currency": "USDT",
    "fromAddress": "0x0987654321fedcba0987654321fedcba09876543",
    "toAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "confirmations": 12,
    "createdAt": "2023-06-01T12:30:00Z",
    "updatedAt": "2023-06-01T12:45:00Z",
    "metadata": {
      "orderId": "ORD-12345",
      "customerEmail": "customer@example.com"
    }
  }
}
```

### Create Payout

```
POST /payouts
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| amount | string | Yes | Amount to withdraw |
| currency | string | Yes | Currency code (e.g., "USDT") |
| network | string | Yes | Blockchain network (e.g., "BSC") |
| recipientAddress | string | Yes | Recipient wallet address |
| webhookUrl | string | No | URL to receive status updates |
| metadata | object | No | Custom data for your reference |

**Example Request:**

```json
{
  "amount": "50.00",
  "currency": "USDT",
  "network": "BSC",
  "recipientAddress": "0x0987654321fedcba0987654321fedcba09876543",
  "webhookUrl": "https://your-website.com/payout-webhook",
  "metadata": {
    "withdrawalId": "WD-67890",
    "userId": "user_12345"
  }
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": "payout_1a2b3c4d5e",
    "status": "PENDING",
    "amount": "50.00",
    "currency": "USDT",
    "network": "BSC",
    "recipientAddress": "0x0987654321fedcba0987654321fedcba09876543",
    "createdAt": "2023-06-02T10:00:00Z"
  }
}
```

## Webhooks

Webhooks allow your application to receive real-time notifications about payment events.

### Setting Up Webhooks

1. Navigate to your merchant dashboard at [https://eoscryptopago.com/dashboard](https://eoscryptopago.com/dashboard)
2. Go to "Settings" > "Webhooks"
3. Add your webhook endpoint URL
4. Select the events you want to receive
5. Save your webhook configuration

### Webhook Events

| Event | Description |
|-------|-------------|
| PAYMENT_RECEIVED | A payment has been detected on the blockchain |
| PAYMENT_CONFIRMED | A payment has received enough confirmations |
| PAYMENT_COMPLETED | A payment has been fully processed |
| PAYMENT_FAILED | A payment has failed |
| PAYOUT_PENDING | A payout has been created |
| PAYOUT_COMPLETED | A payout has been completed |
| PAYOUT_FAILED | A payout has failed |

### Webhook Payload

```json
{
  "event": "PAYMENT_CONFIRMED",
  "data": {
    "id": "tx_1a2b3c4d5e",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "status": "CONFIRMED",
    "type": "PAYMENT",
    "amount": "100.00",
    "currency": "USDT",
    "fromAddress": "0x0987654321fedcba0987654321fedcba09876543",
    "toAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "confirmations": 12,
    "createdAt": "2023-06-01T12:30:00Z",
    "updatedAt": "2023-06-01T12:45:00Z",
    "metadata": {
      "orderId": "ORD-12345",
      "customerEmail": "customer@example.com"
    }
  },
  "timestamp": "2023-06-01T12:45:00Z"
}
```

### Verifying Webhook Signatures

All webhook requests include a signature in the `X-WEBHOOK-SIGNATURE` header. Verify this signature to ensure the webhook came from our system:

```javascript
// JavaScript example
function verifyWebhook(webhookBody, receivedSignature, webhookSecret) {
  const expectedSignature = crypto.createHmac('sha256', webhookSecret)
    .update(JSON.stringify(webhookBody))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  );
}
```

```php
// PHP example
function verifyWebhook($webhookBody, $receivedSignature, $webhookSecret) {
  $expectedSignature = hash_hmac('sha256', json_encode($webhookBody), $webhookSecret);
  return hash_equals($expectedSignature, $receivedSignature);
}
```

## Testing

### Sandbox Environment

Use our sandbox environment for testing your integration without real transactions:

```
Base URL: https://sandbox.eoscryptopago.com/api/v1
```

To access the sandbox:

1. Log in to your merchant dashboard
2. Go to "Settings" > "API & Developers"
3. Toggle to "Sandbox Mode"
4. Generate sandbox API credentials

### Test Wallets

The sandbox environment provides test wallets with pre-loaded funds for testing:

| Currency | Test Wallet Address | Private Key |
|----------|---------------------|-------------|
| USDT (BSC) | 0xTestWallet1 | Available in sandbox dashboard |
| BNB | 0xTestWallet2 | Available in sandbox dashboard |

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be greater than zero",
    "details": {
      "field": "amount",
      "value": "-10.00"
    }
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| AUTHENTICATION_FAILED | Invalid API credentials or signature |
| INVALID_PARAMETER | One or more parameters are invalid |
| INSUFFICIENT_FUNDS | Not enough funds for the operation |
| RATE_LIMIT_EXCEEDED | Too many requests in a short period |
| RESOURCE_NOT_FOUND | The requested resource does not exist |
| INTERNAL_ERROR | An unexpected error occurred on our side |

## Best Practices

1. **Implement Idempotency**: Use unique identifiers in your metadata to prevent duplicate operations
2. **Handle Webhooks Properly**: Acknowledge webhook receipt quickly and process asynchronously
3. **Implement Retry Logic**: Use exponential backoff for failed API requests
4. **Monitor Transaction Status**: Don't rely solely on webhooks; periodically check transaction status
5. **Secure API Credentials**: Never expose your API secret in client-side code
6. **Validate All Inputs**: Sanitize and validate all user inputs before sending to the API
7. **Implement Proper Error Handling**: Display user-friendly error messages

## Sample Implementations

### Payment Flow Implementation

```javascript
// Node.js example with Express
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const API_KEY = 'your_api_key';
const API_SECRET = 'your_api_secret';
const BASE_URL = 'https://eoscryptopago.com/api/v1';

// Create a payment address
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, orderId, customerEmail } = req.body;
    
    const requestBody = {
      currency: 'USDT',
      expectedAmount: amount,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      callbackUrl: 'https://your-website.com/payment-callback',
      metadata: {
        orderId,
        customerEmail
      }
    };
    
    const timestamp = Date.now().toString();
    const signature = generateSignature(API_SECRET, timestamp, requestBody);
    
    const response = await axios.post(`${BASE_URL}/payment-addresses`, requestBody, {
      headers: {
        'X-API-KEY': API_KEY,
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': signature,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      success: true,
      paymentAddress: response.data.data.address,
      expiresAt: response.data.data.expiresAt,
      amount: response.data.data.expectedAmount
    });
  } catch (error) {
    console.error('Payment creation error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment'
    });
  }
});

// Webhook handler
app.post('/payment-callback', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const webhookSecret = 'your_webhook_secret';
  
  // Verify signature
  if (!verifyWebhook(req.body, signature, webhookSecret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Acknowledge receipt quickly
  res.status(200).send('Webhook received');
  
  // Process the webhook asynchronously
  const { event, data } = req.body;
  
  if (event === 'PAYMENT_CONFIRMED') {
    // Update order status in your database
    const { metadata, amount, currency } = data;
    await updateOrderStatus(metadata.orderId, 'PAID', { amount, currency });
    
    // Send confirmation email to customer
    await sendPaymentConfirmationEmail(metadata.customerEmail, amount, currency);
  }
});

function generateSignature(apiSecret, timestamp, requestBody) {
  const message = timestamp + (requestBody ? JSON.stringify(requestBody) : '');
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

function verifyWebhook(webhookBody, receivedSignature, webhookSecret) {
  const expectedSignature = crypto.createHmac('sha256', webhookSecret)
    .update(JSON.stringify(webhookBody))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature)
  );
}

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Ensure your API key and secret are correct
   - Check that your system clock is synchronized (timestamp issues)
   - Verify the HMAC signature is being generated correctly

2. **Webhook Not Receiving Events**
   - Confirm your webhook URL is publicly accessible
   - Check server logs for any errors in processing webhooks
   - Verify the webhook is registered correctly in your dashboard

3. **Transactions Not Appearing**
   - Verify the sender sent to the correct address
   - Check if the transaction has enough confirmations
   - Ensure you're using the correct network (BSC, ETH, etc.)

### Support Resources

If you encounter issues not covered in this guide:

1. Check our [Developer Forum](https://eoscryptopago.com/forum)
2. Email our developer support at [dev-support@eoscryptopago.com](mailto:dev-support@eoscryptopago.com)
3. Open a support ticket from your merchant dashboard

---

For the latest updates to our API, please refer to our [API Changelog](https://eoscryptopago.com/api-changelog).