<?php
/**
 * Payment Example
 * 
 * This example demonstrates how to generate a payment address, check transaction status,
 * verify webhooks, and handle different payment scenarios using the Crypto Payment Gateway PHP client.
 */

require_once '../CryptoPaymentClient.php'; // Adjust path as needed
require_once '../CryptoPaymentException.php'; // Include exception classes
// Or if using Composer: require_once 'vendor/autoload.php';

use CryptoPaymentGateway\CryptoPaymentClient;
use CryptoPaymentGateway\CryptoPaymentException;
use CryptoPaymentGateway\CryptoPaymentRateLimitException;
use CryptoPaymentGateway\CryptoPaymentValidationException;

// Load configuration (in a real application, use environment variables or a secure config system)
// SECURITY NOTE: Never hardcode API credentials in production code
$apiKey = getenv('CRYPTO_PAYMENT_API_KEY') ?: 'your_api_key';
$apiSecret = getenv('CRYPTO_PAYMENT_API_SECRET') ?: 'your_api_secret';

// Initialize the client
try {
    $client = new CryptoPaymentClient($apiKey, $apiSecret);
    
    // Configure client settings
    $client->setTimeout(60)           // Set request timeout (in seconds)
           ->setVerifySsl(true)       // Enable/disable SSL verification
           ->setMaxRetries(3)         // Set maximum number of retries for rate-limited requests
           ->setRetryDelay(1000);     // Set base delay between retries in milliseconds
} catch (CryptoPaymentException $e) {
    die("Error initializing client: {$e->getMessage()}\n");
}

// Example order data
$orderId = 'ORDER-' . rand(10000, 99999);
$amount = 100.50;
$currency = 'USDT';
$customerEmail = 'customer@example.com';

// Determine which example to run based on URL parameter
$example = isset($_GET['example']) ? $_GET['example'] : 'generate';

switch ($example) {
    case 'generate':
        generatePaymentAddress($client, $orderId, $amount, $currency, $customerEmail);
        break;
    case 'check':
        checkPaymentStatus($client, $_GET['addressId'] ?? '');
        break;
    case 'webhook':
        handleWebhook($client);
        break;
    case 'refund':
        processRefund($client, $_GET['transactionId'] ?? '');
        break;
    default:
        echo "<h1>Crypto Payment Gateway Examples</h1>";
        echo "<ul>";
        echo "<li><a href='?example=generate'>Generate Payment Address</a></li>";
        echo "<li><a href='?example=webhook'>Webhook Handler</a></li>";
        echo "</ul>";
}

/**
 * Generate a payment address for a new order
 * 
 * @param CryptoPaymentClient $client        The API client
 * @param string              $orderId       Order identifier
 * @param float               $amount        Payment amount
 * @param string              $currency      Currency code
 * @param string              $customerEmail Customer email
 */
function generatePaymentAddress($client, $orderId, $amount, $currency, $customerEmail) {
    try {
        echo "<h1>Generating payment address for order {$orderId}</h1>";
        
        $paymentAddress = $client->generatePaymentAddress(
            $currency,
            $amount,
            3600, // Expires in 1 hour
            [
                'orderId' => $orderId,
                'customerEmail' => $customerEmail
            ]
        );
        
        // Extract payment details
        $addressId = $paymentAddress['data']['id'];
        $address = $paymentAddress['data']['address'];
        $expiresAt = $paymentAddress['data']['expiresAt'];
        
        // Display payment information
        displayPaymentInformation($addressId, $address, $amount, $currency, $expiresAt, $orderId);
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentValidationException $e) {
        $errors = $e->getValidationErrors();
        $errorDetails = [];
        foreach ($errors as $field => $messages) {
            $errorDetails[] = "- {$field}: " . implode(', ', $messages);
        }
        displayError("Validation error", $e->getMessage(), $errorDetails);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Check payment status for an address
 * 
 * @param CryptoPaymentClient $client    The API client
 * @param string              $addressId The payment address ID to check
 */
function checkPaymentStatus($client, $addressId) {
    if (empty($addressId)) {
        displayError("Missing parameter", "Address ID is required");
        return;
    }
    
    try {
        echo "<h1>Checking payment status</h1>";
        echo "<p>Address ID: {$addressId}</p>";
        
        // Get payment address details
        $addressDetails = $client->getPaymentAddress($addressId);
        
        echo "<div class='status-container'>";
        echo "<h2>Payment Status: <span class='status-{$addressDetails['data']['status']}'>{$addressDetails['data']['status']}</span></h2>";
        
        // Display address details
        echo "<div class='details-container'>";
        echo "<h3>Address Details</h3>";
        echo "<p>Blockchain Address: {$addressDetails['data']['address']}</p>";
        echo "<p>Expected Amount: {$addressDetails['data']['expectedAmount']} {$addressDetails['data']['currency']}</p>";
        echo "<p>Created At: {$addressDetails['data']['createdAt']}</p>";
        echo "<p>Expires At: {$addressDetails['data']['expiresAt']}</p>";
        echo "</div>";
        
        // If there are transactions, show them
        if (isset($addressDetails['data']['transactions']) && !empty($addressDetails['data']['transactions'])) {
            echo "<div class='transactions-container'>";
            echo "<h3>Transactions</h3>";
            echo "<table class='transactions-table'>";
            echo "<tr><th>Transaction ID</th><th>Amount</th><th>Status</th><th>Created At</th></tr>";
            
            foreach ($addressDetails['data']['transactions'] as $transaction) {
                $statusClass = strtolower($transaction['status']);
                echo "<tr>";
                echo "<td>{$transaction['id']}</td>";
                echo "<td>{$transaction['amount']} {$transaction['currency']}</td>";
                echo "<td class='status-{$statusClass}'>{$transaction['status']}</td>";
                echo "<td>{$transaction['createdAt']}</td>";
                echo "</tr>";
                
                // If the transaction is completed, show a success message
                if ($transaction['status'] === 'COMPLETED') {
                    echo "<tr><td colspan='4' class='success-message'>";
                    echo "<p>Payment completed successfully!</p>";
                    echo "<p>In a real application, you would:</p>";
                    echo "<ul>";
                    echo "<li>Update your order status in your database</li>";
                    echo "<li>Send a confirmation email to the customer</li>";
                    echo "<li>Redirect the customer to a success page</li>";
                    echo "</ul>";
                    echo "</td></tr>";
                }
            }
            
            echo "</table>";
            echo "</div>";
        } else {
            echo "<div class='no-transactions'>";
            echo "<h3>No transactions found yet</h3>";
            echo "<p>Waiting for payment...</p>";
            echo "<p>In a real application, you would either:</p>";
            echo "<ol>";
            echo "<li>Wait for a webhook notification (recommended)</li>";
            echo "<li>Periodically poll the API to check for updates</li>";
            echo "</ol>";
            echo "</div>";
        }
        
        echo "</div>";
        
        // Add refresh button and back link
        echo "<div class='actions'>";
        echo "<button onclick='location.reload()'>Refresh Status</button>";
        echo "<a href='?'>Back to Examples</a>";
        echo "</div>";
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentValidationException $e) {
        $errors = $e->getValidationErrors();
        $errorDetails = [];
        foreach ($errors as $field => $messages) {
            $errorDetails[] = "- {$field}: " . implode(', ', $messages);
        }
        displayError("Validation error", $e->getMessage(), $errorDetails);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Handle incoming webhook notifications
 * 
 * @param CryptoPaymentClient $client The API client
 */
function handleWebhook($client) {
    // Get the raw POST data
    $payload = file_get_contents('php://input');
    
    // Get headers
    $headers = getallheaders();
    $signature = $headers['X-Signature'] ?? '';
    $timestamp = $headers['X-Timestamp'] ?? '';
    
    try {
        // Verify webhook signature
        if (empty($signature)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing signature header']);
            return;
        }
        
        // Verify the webhook signature
        $isValid = $client->verifyWebhookSignature($payload, $signature, $timestamp);
        
        if (!$isValid) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid signature']);
            return;
        }
        
        // Parse the webhook payload
        $data = json_decode($payload, true);
        
        if (!$data) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON payload']);
            return;
        }
        
        // Process the webhook based on event type
        $eventType = $data['event'] ?? '';
        
        // Log webhook for debugging (in production, use proper logging)
        file_put_contents(
            'webhook_log.txt', 
            date('Y-m-d H:i:s') . " - Event: {$eventType}\n" . $payload . "\n\n", 
            FILE_APPEND
        );
        
        switch ($eventType) {
            case 'payment.received':
                // A new payment has been received but not yet confirmed
                $transactionId = $data['data']['transaction']['id'] ?? '';
                $status = $data['data']['transaction']['status'] ?? '';
                $amount = $data['data']['transaction']['amount'] ?? '';
                $currency = $data['data']['transaction']['currency'] ?? '';
                
                // In a real application, you would update your database
                // and potentially notify your systems about the pending payment
                
                break;
                
            case 'payment.completed':
                // Payment has been confirmed and is now complete
                $transactionId = $data['data']['transaction']['id'] ?? '';
                $addressId = $data['data']['address']['id'] ?? '';
                $metadata = $data['data']['address']['metadata'] ?? [];
                $orderId = $metadata['orderId'] ?? '';
                
                // In a real application, you would:
                // 1. Verify the payment amount matches the expected amount
                // 2. Update your order status to paid/complete
                // 3. Trigger fulfillment processes
                // 4. Send confirmation to the customer
                
                break;
                
            case 'payment.failed':
                // Payment has failed (e.g., insufficient funds)
                $transactionId = $data['data']['transaction']['id'] ?? '';
                $reason = $data['data']['reason'] ?? 'Unknown reason';
                
                // In a real application, you would update your order status
                // and potentially notify the customer
                
                break;
                
            case 'address.expired':
                // Payment address has expired without receiving full payment
                $addressId = $data['data']['address']['id'] ?? '';
                $metadata = $data['data']['address']['metadata'] ?? [];
                $orderId = $metadata['orderId'] ?? '';
                
                // In a real application, you would update your order status
                // and potentially notify the customer
                
                break;
        }
        
        // Respond with success
        http_response_code(200);
        echo json_encode(['status' => 'success']);
        
    } catch (CryptoPaymentException $e) {
        // Log the error (in production, use proper logging)
        file_put_contents(
            'webhook_error_log.txt', 
            date('Y-m-d H:i:s') . " - Error: {$e->getMessage()}\n", 
            FILE_APPEND
        );
        
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    } catch (Exception $e) {
        // Log the error (in production, use proper logging)
        file_put_contents(
            'webhook_error_log.txt', 
            date('Y-m-d H:i:s') . " - Error: {$e->getMessage()}\n", 
            FILE_APPEND
        );
        
        http_response_code(500);
        echo json_encode(['error' => 'Unexpected error']);
    }
}

/**
 * Process a refund for a transaction
 * 
 * @param CryptoPaymentClient $client        The API client
 * @param string              $transactionId The transaction ID to refund
 */
function processRefund($client, $transactionId) {
    if (empty($transactionId)) {
        displayError("Missing parameter", "Transaction ID is required");
        return;
    }
    
    try {
        echo "<h1>Processing Refund</h1>";
        echo "<p>Transaction ID: {$transactionId}</p>";
        
        // In a real application, you would get the refund amount from a form
        $amount = isset($_POST['amount']) ? (float)$_POST['amount'] : null;
        $reason = $_POST['reason'] ?? 'Customer requested refund';
        
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['confirm'])) {
            // Process the refund
            $refund = $client->createRefund($transactionId, $amount, $reason);
            
            echo "<div class='success-container'>";
            echo "<h2>Refund Processed Successfully</h2>";
            echo "<p>Refund ID: {$refund['data']['id']}</p>";
            echo "<p>Status: {$refund['data']['status']}</p>";
            echo "<p>Amount: {$refund['data']['amount']} {$refund['data']['currency']}</p>";
            echo "<p>Created At: {$refund['data']['createdAt']}</p>";
            echo "</div>";
            
            echo "<div class='actions'>";
            echo "<a href='?'>Back to Examples</a>";
            echo "</div>";
        } else {
            // Get transaction details first
            $transaction = $client->getTransaction($transactionId);
            
            echo "<div class='transaction-details'>";
            echo "<h2>Transaction Details</h2>";
            echo "<p>Amount: {$transaction['data']['amount']} {$transaction['data']['currency']}</p>";
            echo "<p>Status: {$transaction['data']['status']}</p>";
            echo "<p>Created At: {$transaction['data']['createdAt']}</p>";
            echo "</div>";
            
            // Show refund form
            echo "<form method='post' class='refund-form'>";
            echo "<h2>Refund Details</h2>";
            echo "<div class='form-group'>";
            echo "<label for='amount'>Amount to Refund:</label>";
            echo "<input type='number' id='amount' name='amount' step='0.01' max='{$transaction['data']['amount']}' placeholder='Leave empty for full amount'>";
            echo "</div>";
            echo "<div class='form-group'>";
            echo "<label for='reason'>Reason for Refund:</label>";
            echo "<textarea id='reason' name='reason' required>Customer requested refund</textarea>";
            echo "</div>";
            echo "<input type='hidden' name='confirm' value='1'>";
            echo "<div class='form-actions'>";
            echo "<button type='submit'>Process Refund</button>";
            echo "<a href='?'>Cancel</a>";
            echo "</div>";
            echo "</form>";
        }
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentValidationException $e) {
        $errors = $e->getValidationErrors();
        $errorDetails = [];
        foreach ($errors as $field => $messages) {
            $errorDetails[] = "- {$field}: " . implode(', ', $messages);
        }
        displayError("Validation error", $e->getMessage(), $errorDetails);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Display payment information with QR code
 * 
 * @param string $addressId   The payment address ID
 * @param string $address     The blockchain address
 * @param float  $amount      The payment amount
 * @param string $currency    The currency code
 * @param string $expiresAt   Expiration timestamp
 * @param string $orderId     Order identifier
 */
function displayPaymentInformation($addressId, $address, $amount, $currency, $expiresAt, $orderId) {
    // Basic styling
    echo "<style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        .payment-container { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .address-container { background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 15px 0; display: flex; align-items: center; }
        .address-container code { flex: 1; word-break: break-all; }
        .address-container button { margin-left: 10px; padding: 8px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .qr-code { text-align: center; margin: 20px 0; }
        .qr-code img { max-width: 200px; }
        .timer-container { text-align: center; margin: 20px 0; }
        .countdown { font-size: 24px; font-weight: bold; color: #e74c3c; }
        .status-link { display: block; margin: 20px 0; text-align: center; }
        .status-link a { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; }
    </style>";
    
    echo "<div class='payment-container'>";
    echo "<h2>Payment Details</h2>";
    echo "<p>Please send exactly <strong>{$amount} {$currency}</strong> to the following address:</p>";
    
    echo "<div class='address-container'>";
    echo "<code>{$address}</code>";
    echo "<button onclick='copyAddress()'>Copy</button>";
    echo "</div>";
    
    echo "<div class='qr-code'>";
    echo "<img src='https://api.qrserver.com/v1/create-qr-code/?data=" . urlencode($address) . "&size=200x200' alt='Payment QR Code'>";
    echo "</div>";
    
    echo "<div class='timer-container'>";
    echo "<p>This payment address will expire in:</p>";
    echo "<div class='countdown' id='countdown'>Loading...</div>";
    echo "</div>";
    
    echo "<div class='status-link'>";
    echo "<a href='?example=check&addressId={$addressId}'>Check Payment Status</a>";
    echo "</div>";
    echo "</div>";
    
    // JavaScript for countdown and copy functionality
    echo "<script>
        // Function to copy address to clipboard
        function copyAddress() {
            const addressText = '{$address}';
            navigator.clipboard.writeText(addressText)
                .then(() => alert('Address copied to clipboard!'))
                .catch(err => console.error('Error copying address:', err));
        }
        
        // Countdown timer
        const expiryTime = new Date('{$expiresAt}').getTime();
        const countdownEl = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            const now = new Date().getTime();
            const distance = expiryTime - now;
            
            if (distance <= 0) {
                clearInterval(timer);
                countdownEl.innerHTML = 'EXPIRED';
                // Show expired message
            } else {
                const hours = Math.floor(distance / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                countdownEl.innerHTML = `${hours}h ${minutes}m ${seconds}s`;
            }
        }, 1000);
        
        // Check payment status periodically (as a fallback to webhooks)
        const checkPaymentStatus = () => {
            fetch('?example=check&addressId={$addressId}&format=json')
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'COMPLETED') {
                        // Payment completed, redirect to success page
                        window.location.href = '?example=check&addressId={$addressId}';
                    }
                })
                .catch(err => console.error('Error checking payment status:', err));
        };
        
        // Check every 30 seconds
        setInterval(checkPaymentStatus, 30000);
    </script>";
}

/**
 * Display error message
 * 
 * @param string $title   Error title
 * @param string $message Error message
 * @param array  $details Additional error details
 */
function displayError($title, $message, array $details = []) {
    echo "<div class='error-container' style='border: 2px solid #e74c3c; border-radius: 8px; padding: 20px; margin: 20px 0; background-color: #fdf7f7;'>";
    echo "<h2 style='color: #e74c3c;'>{$title}</h2>";
    echo "<p>{$message}</p>";
    
    if (!empty($details)) {
        echo "<ul>";
        foreach ($details as $detail) {
            echo "<li>{$detail}</li>";
        }
        echo "</ul>";
    }
    
    echo "<a href='?'>Back to Examples</a>";
    echo "</div>";
}

/**
 * SECURITY CONSIDERATIONS:
 * 
 * 1. API Credentials:
 *    - Never hardcode API credentials in your code
 *    - Use environment variables or a secure configuration system
 *    - Restrict API key permissions to only what's needed
 * 
 * 2. Webhook Security:
 *    - Always verify webhook signatures to prevent forgery
 *    - Implement timestamp validation to prevent replay attacks
 *    - Use HTTPS for all webhook endpoints
 * 
 * 3. Payment Validation:
 *    - Always verify that the received amount matches the expected amount
 *    - Check that the payment is in the correct currency
 *    - Implement idempotency to prevent double-processing payments
 * 
 * 4. Error Handling:
 *    - Log errors but don't expose sensitive details to users
 *    - Implement proper exception handling for all API calls
 *    - Have fallback mechanisms for when the API is unavailable
 * 
 * 5. Data Storage:
 *    - Store payment details securely in your database
 *    - Encrypt sensitive information
 *    - Implement proper access controls
 * 
 * 6. User Experience:
 *    - Provide clear payment instructions to users
 *    - Show real-time updates on payment status when possible
 *    - Have clear error messages for failed payments
 */