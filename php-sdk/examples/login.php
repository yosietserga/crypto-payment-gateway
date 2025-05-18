<?php
/**
 * Example PHP script to authenticate with the EOSCryptoPago API using the SDK
 */

// Include the SDK class
require_once(__DIR__ . '/../CryptoPaymentSDK.php');

// API base URL
$baseUrl = 'https://eoscryptopago.com';

// User credentials
$email = 'merchant@example.com';  // Replace with actual email
$password = 'your-secure-password'; // Replace with actual password

try {
    // Initialize the SDK with email and password authentication
    $sdk = new CryptoPaymentSDK($baseUrl, $email, $password, true); // true enables debug mode
    
    // Authenticate with the API
    if ($sdk->authenticate()) {
        echo "Authentication successful!\n";
        echo "You can now use the SDK to make API calls.\n";
        
        // Example: Get merchant profile information
        try {
            // Note: We don't need to call authenticate() again as the SDK will handle this
            $profile = $sdk->getMerchantProfile();
            
            echo "\nMerchant Profile Information:\n";
            echo "ID: " . $profile['data']['id'] . "\n";
            echo "Business Name: " . $profile['data']['businessName'] . "\n";
            echo "Email: " . $profile['data']['email'] . "\n";
            echo "Status: " . $profile['data']['status'] . "\n";
            echo "Created At: " . $profile['data']['createdAt'] . "\n";
        } catch (Exception $e) {
            echo "Error getting merchant profile: " . $e->getMessage() . "\n";
        }
    }
} catch (Exception $e) {
    echo "Authentication error: " . $e->getMessage() . "\n";
}
?>
?>