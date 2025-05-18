<?php
/**
 * Example: Create a payment with the Crypto Payment Gateway
 */

// Include the SDK
require_once '../CryptoPaymentSDK.php';

// Set API connection details
$apiUrl = 'https://eoscryptopago.com'; // Change to your API server URL
$email = 'merchant@example.com'; // Replace with actual merchant email
$password = 'your-secure-password'; // Replace with actual password

// Initialize the SDK with debug mode enabled
$sdk = new CryptoPaymentSDK($apiUrl, $email, $password, true);

try {
    // Authenticate with the API
    $sdk->authenticate();
    
    // Create a new payment address
    $payment = $sdk->generatePaymentAddress(
        100.00,                                      // Expected amount
        'USDT',                                      // IMPORTANT: Use cryptocurrency (not fiat) for currency
        'https://yourwebsite.com/payment-complete',  // Callback URL for redirecting the customer
        [
            'orderId' => 'ORD-12345',                // Custom order ID
            'customerEmail' => 'customer@example.com',
            'fiatCurrency' => 'USD',                 // Store original fiat currency in metadata
            'description' => 'Order #12345 payment',
            'reference' => 'INV-2025-001',            // Optional invoice reference
            'customerName' => 'John Doe'               // Optional customer name
        ]
    );
    
    // Access the data from the response structure
    $paymentData = $payment['data'];
    
    // Display the payment information
    echo "Payment created successfully!\n";
    echo "Payment ID: " . $paymentData['id'] . "\n";
    echo "Payment Address: " . $paymentData['address'] . "\n";
    echo "Expected Amount: " . $paymentData['expectedAmount'] . " " . $paymentData['currency'] . "\n";
    echo "Status: " . $paymentData['status'] . "\n";
    
    // QR code is now included in the response
    echo "QR Code: " . $paymentData['qrCode'] . "\n";
    
    // Provide a link for checkout
    echo "Checkout URL: " . $apiUrl . "/checkout/" . $paymentData['id'] . "\n";
    
    // Save the payment ID for later verification
    file_put_contents('last_payment_id.txt', $paymentData['id']);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
