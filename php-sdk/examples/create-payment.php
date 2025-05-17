<?php
/**
 * Example: Create a payment with the Crypto Payment Gateway
 */

// Include the SDK
require_once '../CryptoPaymentSDK.php';

// Set API credentials
$apiUrl = 'http://localhost:3000'; // Change to your API server URL
$apiKey = 'your-api-key';
$apiSecret = 'your-api-secret';

// Initialize the SDK with debug mode enabled
$sdk = new CryptoPaymentSDK($apiUrl, $apiKey, $apiSecret, true);

try {
    // Authenticate with the API
    $sdk->authenticate();
    
    // Create a new payment address
    $payment = $sdk->generatePaymentAddress(
        100.00,                                      // Amount
        'USDT',                                      // IMPORTANT: Use cryptocurrency (not fiat) for currency
        'https://yourwebsite.com/crypto-webhook',    // Callback URL
        [
            'orderId' => '12345',                    // Custom order ID
            'customerEmail' => 'customer@example.com',
            'originalCurrency' => 'USD',             // Store original fiat currency as metadata
            'description' => 'Order #12345 payment'
        ]
    );
    
    // Display the payment information
    echo "Payment created successfully!\n";
    echo "Payment ID: " . $payment['id'] . "\n";
    echo "Payment Address: " . $payment['address'] . "\n";
    echo "Expected Amount: " . $payment['expectedAmount'] . " " . $payment['currency'] . "\n";
    echo "Status: " . $payment['status'] . "\n";
    
    // Generate a QR code URL (optional)
    $qrCodeUrl = "https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=" . 
        urlencode($payment['currency'] . ":" . $payment['address'] . "?amount=" . $payment['expectedAmount']);
    
    echo "QR Code URL: " . $qrCodeUrl . "\n";
    
    // Save the payment ID for later verification
    file_put_contents('last_payment_id.txt', $payment['id']);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
