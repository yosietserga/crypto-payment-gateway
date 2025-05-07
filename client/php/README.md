# Crypto Payment Gateway PHP Client

A comprehensive PHP client library for interacting with the Crypto Payment Gateway API. This client handles authentication, request signing, rate limiting, and provides methods for all available API endpoints.

## Requirements

- PHP 7.2 or higher
- cURL extension
- JSON extension

## Installation

### Via Composer (Recommended)

```bash
composer require crypto-payment-gateway/php-client
```

### Manual Installation

1. Download the library files
2. Include the `CryptoPaymentClient.php` file in your project

## Features

- API key authentication with request signing
- Automatic handling of rate limits with exponential backoff
- Comprehensive error handling with custom exceptions
- Webhook signature verification with replay protection
- Methods for all API endpoints (payments, transactions, webhooks, refunds, etc.)

## Usage

### Initialization

```php
<?php
require_once 'vendor/autoload.php'; // If using Composer
// OR
// require_once 'path/to/CryptoPaymentClient.php'; // If installed manually
// require_once 'path/to/CryptoPaymentException.php'; // If installed manually

use CryptoPaymentGateway\CryptoPaymentClient;
use CryptoPaymentGateway\CryptoPaymentException;
use CryptoPaymentGateway\CryptoPaymentRateLimitException;
use CryptoPaymentGateway\CryptoPaymentValidationException;

// Initialize the client with your API credentials
$client = new CryptoPaymentClient(
    'your_api_key',
    'your_api_secret',
    'https://api.example.com/v1' // Optional: defaults to production URL
);

// Optional: Configure client settings
$client->setTimeout(60)           // Set request timeout (in seconds)
       ->setVerifySsl(true)       // Enable/disable SSL verification
       ->setMaxRetries(3)         // Set maximum number of retries for rate-limited requests
       ->setRetryDelay(1000);     // Set base delay between retries in milliseconds
```

### Generate a Payment Address

```php
// Generate a new payment address
try {
    $paymentAddress = $client->generatePaymentAddress(
        'USDT',           // Currency
        100.50,           // Expected amount
        3600,             // Expires in (seconds, default: 1 hour)
        [                 // Optional metadata
            'orderId' => '12345',
            'customerEmail' => 'customer@example.com'
        ]
    );
    
    echo "Payment address created: {$paymentAddress['data']['address']}\n";
    echo "Expected amount: {$paymentAddress['data']['expectedAmount']} {$paymentAddress['data']['currency']}\n";
    echo "Expires at: {$paymentAddress['data']['expiresAt']}\n";
} catch (\Exception $e) {
    echo "Error: {$e->getMessage()}\n";
}
```

### Get Payment Address Details

```php
try {
    $addressDetails = $client->getPaymentAddress('payment_address_id');
    print_r($addressDetails);
} catch (\Exception $e) {
    echo "Error: {$e->getMessage()}\n";
}
```

### List Transactions

```php
try {
    $transactions = $client->getTransactions(
        1,                  // Page number
        20,                 // Items per page
        'COMPLETED',        // Optional: filter by status
        '2023-01-01',      // Optional: start date (ISO format)
        '2023-12-31'       // Optional: end date (ISO format)
    );
    
    foreach ($transactions['data']['transactions'] as $transaction) {
        echo "Transaction ID: {$transaction['id']}\n";
        echo "Amount: {$transaction['amount']} {$transaction['currency']}\n";
        echo "Status: {$transaction['status']}\n";
        echo "Created at: {$transaction['createdAt']}\n";
        echo "-----------------------------------\n";
    }
} catch (\Exception $e) {
    echo "Error: {$e->getMessage()}\n";
}
```

### Verify Webhook Signatures

```php
// Get the webhook payload and signature
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? null;

try {
    // Verify the signature with timestamp for replay protection
    if ($client->verifyWebhookSignature($payload, $signature, $timestamp)) {
        // Signature is valid, process the webhook
        $data = json_decode($payload, true);
        
        // Handle different webhook events
        switch ($data['event']) {
            case 'payment.received':
                // Process payment received
                break;
            case 'payment.confirmed':
                // Process payment confirmed
                break;
            // Handle other events...
        }
        
        http_response_code(200);
        echo json_encode(['status' => 'success']);
    } else {
        // Invalid signature
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Invalid signature']);
    }
} catch (CryptoPaymentException $e) {
    // Handle verification error (e.g., expired timestamp)
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
```

## Error Handling

The client uses custom exception classes for different types of errors:

- `CryptoPaymentException`: Base exception class for all errors
- `CryptoPaymentAuthException`: Authentication errors (401 Unauthorized)
- `CryptoPaymentRateLimitException`: Rate limit errors (429 Too Many Requests)
- `CryptoPaymentValidationException`: Validation errors (422 Unprocessable Entity)

```php
try {
    $result = $client->someMethod();
    // Process result
} catch (CryptoPaymentRateLimitException $e) {
    // Handle rate limiting
    $resetTime = $e->getResetTime();
    $secondsUntilReset = $e->getSecondsUntilReset();
    echo "Rate limit exceeded. Try again in {$secondsUntilReset} seconds.\n";
} catch (CryptoPaymentValidationException $e) {
    // Handle validation errors
    echo "Validation error: {$e->getMessage()}\n";
    $errors = $e->getValidationErrors();
    foreach ($errors as $field => $messages) {
        echo "- {$field}: " . implode(', ', $messages) . "\n";
    }
} catch (CryptoPaymentAuthException $e) {
    // Handle authentication errors
    echo "Authentication error: {$e->getMessage()}\n";
    // Prompt for new credentials or notify admin
} catch (CryptoPaymentException $e) {
    // Handle other API errors
    echo "API error ({$e->getCode()}): {$e->getMessage()}\n";
    // Log error, notify admin, etc.
}
```

## Additional API Methods

### Webhook Management

```php
// Create a webhook
$webhook = $client->createWebhook(
    'https://example.com/webhook',  // Webhook URL
    ['payment.completed', 'payment.failed'],  // Events to subscribe to
    'Payment notifications'  // Optional description
);

// Get webhook details
$webhook = $client->getWebhook('webhook_id');

// List all webhooks
$webhooks = $client->getWebhooks(1, 20);

// Update a webhook
$updatedWebhook = $client->updateWebhook('webhook_id', [
    'events' => ['payment.completed', 'payment.failed', 'refund.completed'],
    'description' => 'Updated payment notifications'
]);

// Delete a webhook
$client->deleteWebhook('webhook_id');
```

### Refund Management

```php
// Create a refund
$refund = $client->createRefund(
    'transaction_id',  // Transaction to refund
    50.25,             // Amount to refund (optional, defaults to full amount)
    'Customer requested refund'  // Reason for refund
);

// Get refund details
$refund = $client->getRefund('refund_id');

// List all refunds
$refunds = $client->getRefunds(
    1,                  // Page number
    20,                 // Items per page
    'COMPLETED',        // Optional: filter by status
    '2023-01-01',      // Optional: start date (ISO format)
    '2023-12-31'       // Optional: end date (ISO format)
);
```

### Currency and Exchange Rates

```php
// Get supported currencies
$currencies = $client->getSupportedCurrencies();

// Get current exchange rates
$rates = $client->getExchangeRates('USD');
```

## Security Considerations

- Store your API key and secret securely
- Use environment variables or a secure configuration system
- Never expose your API secret in client-side code
- Always verify webhook signatures to prevent tampering
- The client includes replay protection for webhooks using timestamps

## License

MIT License