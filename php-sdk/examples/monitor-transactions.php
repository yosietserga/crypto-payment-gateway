<?php
/**
 * Example: Monitor transactions with the Crypto Payment Gateway
 * This script can be run periodically via a cron job to check for new transactions
 */

// Include the SDK
require_once '../CryptoPaymentSDK.php';

// Set API credentials
$apiUrl = 'http://localhost:3000'; // Change to your API server URL
$apiKey = 'your-api-key';
$apiSecret = 'your-api-secret';

// Initialize the SDK
$sdk = new CryptoPaymentSDK($apiUrl, $apiKey, $apiSecret, true);

// Optional: Load the last check time
$lastCheckFile = 'last_transaction_check.txt';
$startTime = null;

if (file_exists($lastCheckFile)) {
    $startTime = (int)file_get_contents($lastCheckFile);
}

$endTime = time() * 1000; // Current time in milliseconds

try {
    // Authenticate with the API
    $sdk->authenticate();
    
    // Get recent transactions
    $filters = [
        'type' => 'PAYMENT', // PAYMENT, PAYOUT, or ALL
        'status' => 'COMPLETED' // PENDING, COMPLETED, FAILED, or ALL
    ];
    
    // Add date range if we have a last check time
    if ($startTime) {
        $filters['startTime'] = $startTime;
        $filters['endTime'] = $endTime;
    }
    
    $transactions = $sdk->getTransactions($filters);
    
    echo "Found " . count($transactions['items']) . " transactions\n";
    
    // Process each transaction
    foreach ($transactions['items'] as $transaction) {
        echo "Transaction ID: " . $transaction['id'] . "\n";
        echo "Type: " . $transaction['type'] . "\n";
        echo "Status: " . $transaction['status'] . "\n";
        echo "Amount: " . $transaction['amount'] . " " . $transaction['currency'] . "\n";
        echo "Timestamp: " . date('Y-m-d H:i:s', $transaction['timestamp'] / 1000) . "\n";
        
        if (isset($transaction['reference'])) {
            echo "Reference: " . $transaction['reference'] . "\n";
        }
        
        if (isset($transaction['txId'])) {
            echo "Blockchain TxID: " . $transaction['txId'] . "\n";
        }
        
        echo "----------------------------\n";
        
        // Here you would typically update your database or trigger business logic
        // based on the transaction details
        
        // Example: updateOrderStatus($transaction['reference'], 'paid');
    }
    
    // Save the current time as the last check time
    file_put_contents($lastCheckFile, $endTime);
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
