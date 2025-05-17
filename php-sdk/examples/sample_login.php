<?php
/**
 * Example PHP script to authenticate with the EOSCryptoPago API
 */

// API endpoint for authentication
$apiUrl = 'https://eoscryptopago.com/api/v1/auth/login';

// User credentials
$email = 'your-email@example.com';  // Replace with actual email
$password = 'your-password';        // Replace with actual password

// Prepare the request data
$postData = json_encode([
    'email' => $email,
    'password' => $password
]);

// Initialize cURL session
$ch = curl_init($apiUrl);

// Set cURL options
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Content-Length: ' . strlen($postData)
]);

// Execute the request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Check for errors
if (curl_errno($ch)) {
    echo "cURL Error: " . curl_error($ch);
    exit;
}

// Close cURL session
curl_close($ch);

// Process the response
if ($httpCode === 200) {
    $responseData = json_decode($response, true);
    
    if (isset($responseData['token'])) {
        echo "Authentication successful!\n";
        echo "Token: " . $responseData['token'] . "\n";
        
        // You can now store this token for subsequent API calls
        // For example:
        // $_SESSION['api_token'] = $responseData['token'];
        
        // Display user information if available
        if (isset($responseData['user'])) {
            echo "User ID: " . $responseData['user']['id'] . "\n";
            echo "Email: " . $responseData['user']['email'] . "\n";
            echo "Role: " . $responseData['user']['role'] . "\n";
            
            if (isset($responseData['user']['merchant'])) {
                echo "Merchant ID: " . $responseData['user']['merchant']['id'] . "\n";
                echo "Company: " . $responseData['user']['merchant']['companyName'] . "\n";
            }
        }
    } else {
        echo "Authentication failed: Token not found in response\n";
    }
} else {
    echo "Authentication failed with HTTP code: $httpCode\n";
    echo "Response: $response\n";
}
?>
