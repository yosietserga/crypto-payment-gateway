# Crypto Payment Gateway PHP SDK

This PHP SDK provides a simple way to integrate with the Crypto Payment Gateway API. It allows you to create payments, process payouts, monitor transactions, and handle webhook notifications.

## Features

- Create cryptocurrency payment addresses for customers
- Monitor payment status and transaction confirmations
- Create payouts to external wallet addresses
- Retrieve transaction history and account balances
- Process webhook notifications for real-time updates
- Support for Binance API integration

## Requirements

- PHP 7.2 or higher
- cURL extension
- JSON extension

## Installation

Simply copy the `CryptoPaymentSDK.php` file to your project, or include it via Composer.

## Quick Start

```php
<?php
// Include the SDK
require_once 'CryptoPaymentSDK.php';

// Initialize with your API credentials
$sdk = new CryptoPaymentSDK(
    'http://localhost:3000',  // API base URL
    'your-api-key',           // API key
    'your-api-secret',        // API secret
    true                      // Enable debug mode
);

// Authenticate with the API
$sdk->authenticate();

// Generate a payment address
$payment = $sdk->generatePaymentAddress(
    100.00,                                     // Amount
    'USDT',                                     // Currency
    'https://yourwebsite.com/crypto-webhook',   // Callback URL
    [
        'orderId' => '12345',                   // Custom metadata
        'customerEmail' => 'customer@example.com'
    ]
);

// Display the payment information
echo "Payment created: {$payment['id']}\n";
echo "Address: {$payment['address']}\n";
```

## API Reference

### Authentication

```php
// Initialize the SDK
$sdk = new CryptoPaymentSDK($baseUrl, $apiKey, $apiSecret, $debug);

// Authenticate with the API (automatically called when needed)
$sdk->authenticate();

// Check if authenticated
if ($sdk->isAuthenticated()) {
    // Make API calls
}
```

### Payments

```php
// Create a new payment address
$payment = $sdk->generatePaymentAddress($amount, $currency, $callbackUrl, $metadata);

// Check payment status
$payment = $sdk->getPaymentById($paymentId);

// List payments with optional filtering
$payments = $sdk->getPayments([
    'status' => 'PENDING',    // Filter by status
    'search' => '0x1234',     // Search term (address or ID)
    'startDate' => '2025-01-01',
    'endDate' => '2025-12-31',
    'page' => 1,
    'limit' => 50
]);
```

### Payouts

```php
// Create a new payout
$payout = $sdk->createPayout($currency, $amount, $address, $network, $metadata);

// Check payout status
$payout = $sdk->getPayoutById($payoutId);

// List payouts with optional filtering
$payouts = $sdk->getPayouts([
    'status' => 'COMPLETED',  // Filter by status
    'search' => '0x1234',     // Search term (address or ID)
    'startDate' => '2025-01-01',
    'endDate' => '2025-12-31',
    'page' => 1,
    'limit' => 50
]);
```

### Transactions

```php
// List transactions with optional filtering
$transactions = $sdk->getTransactions([
    'type' => 'PAYMENT',      // PAYMENT, PAYOUT, or ALL
    'status' => 'COMPLETED',  // PENDING, COMPLETED, FAILED, or ALL
    'startTime' => 1714590000000,
    'endTime' => 1715590000000
]);

// Get transaction details
$transaction = $sdk->getTransaction($transactionId);
```

### Binance API Integration

```php
// Get account balances
$balances = $sdk->getBinanceBalances(['BTC', 'ETH', 'USDT']);

// Get deposit history
$deposits = $sdk->getBinanceDeposits([
    'coin' => 'USDT',
    'status' => 1,
    'startTime' => 1714590000000,
    'endTime' => 1715590000000
]);

// Get withdrawal history
$withdrawals = $sdk->getBinanceWithdrawals([
    'coin' => 'USDT',
    'status' => 6,
    'startTime' => 1714590000000,
    'endTime' => 1715590000000
]);

// Create a withdrawal
$withdrawal = $sdk->createBinanceWithdrawal(
    'USDT',                                     // Coin
    '0x123456789abcdef123456789abcdef123456789', // Address
    100.00,                                     // Amount
    'BSC',                                      // Network
    null                                        // Memo/Tag (if needed)
);
```

## Handling Webhooks

Create a webhook endpoint on your server to receive real-time payment notifications:

```php
<?php
// Raw webhook data
$payload = file_get_contents('php://input');
$data = json_decode($payload, true);

// Process based on event type
$event = $data['event'];
$paymentData = $data['data'];

switch ($event) {
    case 'payment.completed':
        // Payment is confirmed, update order status
        $orderId = $paymentData['metadata']['orderId'];
        updateOrderStatus($orderId, 'paid');
        break;
        
    case 'payment.failed':
        // Payment failed or expired
        $orderId = $paymentData['metadata']['orderId'];
        updateOrderStatus($orderId, 'payment_failed');
        break;
}

// Return 200 OK response
http_response_code(200);
echo json_encode(['status' => 'success']);
```

See the `examples/webhook-handler.php` file for a complete implementation.

## Example Scripts

The SDK includes several example scripts:

- `examples/create-payment.php` - Create a payment address
- `examples/check-payment-status.php` - Check payment status
- `examples/create-payout.php` - Create a payout
- `examples/monitor-transactions.php` - Monitor transactions
- `examples/webhook-handler.php` - Handle webhook notifications

## Security Best Practices

- Always store your API credentials securely
- Validate webhook signatures to ensure they come from your payment gateway
- Use HTTPS for all API communications
- Keep the SDK up to date with the latest version

## Error Handling

The SDK throws exceptions for API errors. Always wrap your API calls in try/catch blocks:

```php
try {
    $payment = $sdk->generatePaymentAddress($amount, $currency, $callbackUrl);
} catch (Exception $e) {
    // Handle the error
    echo "Error: " . $e->getMessage();
}
```

## License

This SDK is provided under the MIT License.
