<?php
/**
 * Example: Create a payout with the Crypto Payment Gateway
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
    
    // Create a new payout
    $payout = $sdk->createPayout(
        'USDT',                                      // Currency
        50.00,                                       // Amount
        '0x123456789abcdef123456789abcdef123456789', // Destination wallet address
        'BSC',                                       // Network (BSC, ETH, etc.)
        [
            'reference' => 'PAYOUT-' . date('YmdHis'),  // Custom reference ID
            'description' => 'Vendor payment',
            'recipientName' => 'Acme Corp',             // Name of recipient 
            'recipientEmail' => 'vendor@acmecorp.com',  // Email of recipient
            'notes' => 'Monthly payment for April 2025'
        ]
    );
    
    // Access the data from the response structure
    $payoutData = $payout['data'];
    
    // Display the payout information
    echo "Payout created successfully!\n";
    echo "Payout ID: " . $payoutData['id'] . "\n";
    echo "Currency: " . $payoutData['currency'] . "\n";
    echo "Amount: " . $payoutData['amount'] . "\n";
    echo "Address: " . $payoutData['destinationAddress'] . "\n";
    echo "Network: " . $payoutData['network'] . "\n";
    echo "Status: " . $payoutData['status'] . "\n";
    echo "Created At: " . $payoutData['createdAt'] . "\n";
    
    if (isset($payoutData['transactionId'])) {
        echo "Transaction ID: " . $payoutData['transactionId'] . "\n";
    }
    
    // Save the payout ID for later verification
    file_put_contents('last_payout_id.txt', $payoutData['id']);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
