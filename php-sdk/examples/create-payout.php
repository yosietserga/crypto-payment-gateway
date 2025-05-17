<?php
/**
 * Example: Create a payout with the Crypto Payment Gateway
 */

// Include the SDK
require_once '../CryptoPaymentSDK.php';

// Set API credentials
$apiUrl = 'http://localhost:3000'; // Change to your API server URL
$apiKey = 'your-api-key';
$apiSecret = 'your-api-secret';

// Initialize the SDK
$sdk = new CryptoPaymentSDK($apiUrl, $apiKey, $apiSecret, true);

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
            'referenceId' => 'payout-' . time(),     // Custom reference ID
            'description' => 'Vendor payment',
            'vendorId' => 'V12345',
            'notes' => 'Monthly payment for April 2025'
        ]
    );
    
    // Display the payout information
    echo "Payout created successfully!\n";
    echo "Payout ID: " . $payout['id'] . "\n";
    echo "Currency: " . $payout['currency'] . "\n";
    echo "Amount: " . $payout['amount'] . "\n";
    echo "Address: " . $payout['address'] . "\n";
    echo "Network: " . $payout['network'] . "\n";
    echo "Status: " . $payout['status'] . "\n";
    if (isset($payout['txId'])) {
        echo "Transaction ID: " . $payout['txId'] . "\n";
    }
    
    // Save the payout ID for later verification
    file_put_contents('last_payout_id.txt', $payout['id']);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
