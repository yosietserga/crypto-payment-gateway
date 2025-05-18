<?php
/**
 * Example: Check payment status with the Crypto Payment Gateway
 */

// Include the SDK
require_once '../CryptoPaymentSDK.php';

// Set API connection details
$apiUrl = 'https://eoscryptopago.com'; // Change to your API server URL
$email = 'merchant@example.com'; // Replace with actual merchant email
$password = 'your-secure-password'; // Replace with actual password

// Initialize the SDK with debug mode enabled
$sdk = new CryptoPaymentSDK($apiUrl, $email, $password, true);

// Get payment ID from command line argument or last payment
$paymentId = isset($argv[1]) ? $argv[1] : null;

// If no payment ID provided, try to get it from the saved file
if (!$paymentId && file_exists('last_payment_id.txt')) {
    $paymentId = trim(file_get_contents('last_payment_id.txt'));
}

if (!$paymentId) {
    die("Please provide a payment ID as a command line argument or create a payment first.\n");
}

try {
    // Authenticate with the API
    $sdk->authenticate();
    
    // Get payment details
    $response = $sdk->getPaymentById($paymentId);
    
    // Extract the payment data from the response
    $payment = $response['data'];
    
    // Display payment information
    echo "Payment ID: " . $payment['id'] . "\n";
    echo "Address: " . $payment['address'] . "\n";
    echo "Expected Amount: " . $payment['expectedAmount'] . " " . $payment['currency'] . "\n";
    echo "Status: " . $payment['status'] . "\n";
    echo "Created At: " . $payment['createdAt'] . "\n";
    
    if (isset($payment['receivedAmount'])) {
        echo "Received Amount: " . $payment['receivedAmount'] . " " . $payment['currency'] . "\n";
    }
    
    if (isset($payment['confirmations'])) {
        echo "Confirmations: " . $payment['confirmations'] . "\n";
    }
    
    if (isset($payment['transactions']) && !empty($payment['transactions'])) {
        echo "Transaction IDs:\n";
        foreach ($payment['transactions'] as $transaction) {
            echo "- " . $transaction['txId'] . " (" . $transaction['status'] . ")\n";
        }
    }
    
    if (isset($payment['metadata']) && !empty($payment['metadata'])) {
        echo "Metadata:\n";
        foreach ($payment['metadata'] as $key => $value) {
            echo "- {$key}: " . (is_string($value) ? $value : json_encode($value)) . "\n";
        }
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
