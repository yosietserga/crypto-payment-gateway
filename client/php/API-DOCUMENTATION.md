# Crypto Payment Gateway API Documentation

This document provides detailed information about the Crypto Payment Gateway API endpoints and how to use them with the PHP client library.

## Authentication

All API requests require authentication using API keys. Each request must include the following security elements:

- **API Key**: Included in the `X-API-Key` header
- **Timestamp**: Current Unix timestamp in the `X-Timestamp` header
- **Nonce**: Random string to prevent replay attacks in the `X-Nonce` header
- **Signature**: HMAC-SHA256 signature in the `X-Signature` header

The PHP client handles all of these authentication details automatically.

## API Endpoints

### Payment Addresses

#### Generate Payment Address

```
POST /merchant/payment-addresses
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| currency | string | Currency code (e.g., 'USDT') |
| expectedAmount | string | Expected payment amount |
| expiresIn | integer | Expiration time in seconds (default: 3600) |
| metadata | object | Optional metadata for the payment |

**PHP Example:**

```php
$paymentAddress = $client->generatePaymentAddress(
    'USDT',           // Currency
    100.50,           // Expected amount
    3600,             // Expires in (seconds)
    [                 // Optional metadata
        'orderId' => '12345',
        'customerEmail' => 'customer@example.com'
    ]
);
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "9890c5f9-2f35-404b-adc0-2dba4038ff53",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "currency": "USDT",
    "expectedAmount": "100.50",
    "status": "ACTIVE",
    "expiresAt": "2023-06-01T12:00:00Z",
    "createdAt": "2023-06-01T11:00:00Z",
    "metadata": {
      "orderId": "12345",
      "customerEmail": "customer@example.com"
    }
  }
}
```

#### Get Payment Address

```
GET /merchant/payment-addresses/{addressId}
```

**PHP Example:**

```php
$addressDetails = $client->getPaymentAddress('9890c5f9-2f35-404b-adc0-2dba4038ff53');
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "9890c5f9-2f35-404b-adc0-2dba4038ff53",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "currency": "USDT",
    "expectedAmount": "100.50",
    "status": "ACTIVE",
    "expiresAt": "2023-06-01T12:00:00Z",
    "createdAt": "2023-06-01T11:00:00Z",
    "isMonitored": true,
    "transactions": [
      {
        "id": "7890c5f9-2f35-404b-adc0-2dba4038ff54",
        "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        "amount": "100.50",
        "status": "CONFIRMED",
        "confirmations": 6,
        "createdAt": "2023-06-01T11:15:00Z"
      }
    ],
    "metadata": {
      "orderId": "12345",
      "customerEmail": "customer@example.com"
    }
  }
}
```

#### List Payment Addresses

```
GET /merchant/payment-addresses
```

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 20, max: 100) |
| status | string | Filter by status (optional) |

**PHP Example:**

```php
$addresses = $client->getPaymentAddresses(1, 20, 'ACTIVE');
```

**Response:**

```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": "9890c5f9-2f35-404b-adc0-2dba4038ff53",
        "address": "0x1234567890abcdef1234567890abcdef12345678",
        "currency": "USDT",
        "expectedAmount": "100.50",
        "status": "ACTIVE",
        "expiresAt": "2023-06-01T12:00:00Z",
        "createdAt": "2023-06-01T11:00:00Z"
      }
      // More addresses...
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

### Transactions

#### List Transactions

```
GET /transactions
```

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 20, max: 100) |
| status | string | Filter by status (optional) |
| startDate | string | Filter by start date (ISO format, optional) |
| endDate | string | Filter by end date (ISO format, optional) |

**PHP Example:**

```php
$transactions = $client->getTransactions(
    1,                  // Page number
    20,                 // Items per page
    'COMPLETED',        // Optional: filter by status
    '2023-01-01',      // Optional: start date (ISO format)
    '2023-12-31'       // Optional: end date (ISO format)
);
```

**Response:**

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "7890c5f9-2f35-404b-adc0-2dba4038ff54",
        "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        "paymentAddressId": "9890c5f9-2f35-404b-adc0-2dba4038ff53",
        "amount": "100.50",
        "currency": "USDT",
        "status": "COMPLETED",
        "type": "PAYMENT",
        "confirmations": 6,
        "createdAt": "2023-06-01T11:15:00Z",
        "completedAt": "2023-06-01T11:45:00Z"
      }
      // More transactions...
    ],
    "pagination": {
      "total": 67,
      "page": 1,
      "limit": 20,
      "pages": 4
    }
  }
}
```

#### Get Transaction

```
GET /transactions/{transactionId}
```

**PHP Example:**

```php
$transaction = $client->getTransaction('7890c5f9-2f35-404b-adc0-2dba4038ff54');
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "7890c5f9-2f35-404b-adc0-2dba4038ff54",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "paymentAddressId": "9890c5f9-2f35-404b-adc0-2dba4038ff53",
    "amount": "100.50",
    "currency": "USDT",
    "status": "COMPLETED",
    "type": "PAYMENT",
    "confirmations": 6,
    "createdAt": "2023-06-01T11:15:00Z",
    "completedAt": "2023-06-01T11:45:00Z",
    "metadata": {
      "orderId": "12345",
      "customerEmail": "customer@example.com"
    },
    "paymentAddress": {
      "address": "0x1234567890abcdef1234567890abcdef12345678",
      "currency": "USDT"
    }
  }
}
```

### Merchant

#### Get Dashboard Data

```
GET /merchant/dashboard
```

**PHP Example:**

```php
$dashboardData = $client->getDashboardData();
```

**Response:**

```json
{
  "success": true,
  "data": {
    "merchant": {
      "id": "1234c5f9-2f35-404b-adc0-2dba4038ff53",
      "businessName": "Example Business",
      "email": "business@example.com",
      "status": "ACTIVE",
      "createdAt": "2023-01-01T00:00:00Z"
    },
    "stats": {
      "totalTransactions": 156,
      "totalVolume": "15600.50",
      "activeAddresses": 12,
      "statsByStatus": [
        {
          "status": "COMPLETED",
          "count": 145,
          "volume": "14500.25"
        },
        {
          "status": "PENDING",
          "count": 8,
          "volume": "800.25"
        },
        {
          "status": "FAILED",
          "count": 3,
          "volume": "300.00"
        }
      ]
    },
    "recentTransactions": [
      // Recent transactions...
    ]
  }
}
```

#### Update Merchant Profile

```
PATCH /merchant/profile
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| businessName | string | Business name (optional) |
| email | string | Email address (optional) |
| phone | string | Phone number (optional) |
| address | string | Physical address (optional) |
| city | string | City (optional) |
| state | string | State/Province (optional) |
| country | string | Country (optional) |
| zipCode | string | ZIP/Postal code (optional) |

**PHP Example:**

```php
$updatedProfile = $client->updateMerchantProfile([
    'businessName' => 'Updated Business Name',
    'phone' => '+1234567890',
    'address' => '123 Main St',
    'city' => 'New York',
    'country' => 'US'
]);
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "1234c5f9-2f35-404b-adc0-2dba4038ff53",
    "businessName": "Updated Business Name",
    "email": "business@example.com",
    "phone": "+1234567890",
    "address": "123 Main St",
    "city": "New York",
    "state": null,
    "country": "US",
    "zipCode": null,
    "status": "ACTIVE",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-06-01T12:00:00Z"
  }
}
```

## Webhooks

Webhooks are used to notify your application about events that happen in your account. The Crypto Payment Gateway sends webhook events for the following events:

| Event | Description |
|-------|-------------|
| payment.received | Payment has been received but not confirmed yet |
| payment.confirmed | Payment has been confirmed on the blockchain |
| payment.completed | Payment has been fully processed |
| payment.failed | Payment has failed |
| address.expired | Payment address has expired |

### Webhook Payload

Webhook payloads are sent as JSON in the request body. Each webhook includes:

- Event type
- Timestamp
- Data relevant to the event

**Example Payload:**

```json
{
  "event": "payment.confirmed",
  "timestamp": "2023-06-01T11:30:00Z",
  "data": {
    "merchant": {
      "id": "1234c5f9-2f35-404b-adc0-2dba4038ff53"
    },
    "transaction": {
      "id": "7890c5f9-2f35-404b-adc0-2dba4038ff54",
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "amount": "100.50",
      "currency": "USDT",
      "status": "CONFIRMED",
      "confirmations": 3,
      "metadata": {
        "orderId": "12345"
      }
    }
  }
}
```

### Webhook Signature

Each webhook request includes a signature in the `X-Signature` header. This signature is a HMAC-SHA256 hash of the request body, using your API secret as the key.

You should always verify this signature to ensure the webhook is legitimate:

```php
// Get the raw webhook payload
$payload = file_get_contents('php://input');

// Get the signature from the headers
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';

// Verify the signature
if ($client->verifyWebhookSignature($payload, $signature)) {
    // Signature is valid, process the webhook
    // ...
} else {
    // Invalid signature, reject the webhook
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Invalid signature']);
    exit;
}
```

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of a request:

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid API key or signature |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

Error responses include a message explaining what went wrong:

```json
{
  "success": false,
  "error": {
    "code": "invalid_parameter",
    "message": "Expected amount must be greater than zero",
    "details": {
      "field": "expectedAmount"
    }
  }
}
```

The PHP client throws exceptions when API requests fail, so you should always wrap API calls in try-catch blocks:

```php
try {
    $result = $client->someMethod();
    // Process result
} catch (\Exception $e) {
    // Handle error
    echo "Error: {$e->getMessage()}\n";
}
```

## Rate Limits

The API enforces rate limits to prevent abuse. Current limits are:

- 100 requests per minute per API key
- 5,000 requests per day per API key

If you exceed these limits, you'll receive a 429 Too Many Requests response with a Retry-After header indicating how long to wait before making another request.

## Best Practices

1. **Always verify webhook signatures** to prevent fraudulent requests
2. **Store your API key and secret securely** and never expose them in client-side code
3. **Implement idempotency** for critical operations to prevent duplicate processing
4. **Handle rate limits gracefully** by respecting the Retry-After header
5. **Monitor webhook deliveries** and implement a retry mechanism for failed webhook processing
6. **Use appropriate error handling** to gracefully handle API errors
7. **Keep your client library updated** to benefit from the latest features and security improvements