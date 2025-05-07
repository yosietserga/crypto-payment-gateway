<?php
/**
 * Webhook Management Example
 * 
 * This example demonstrates how to create, list, update, and delete webhook configurations
 * for the Crypto Payment Gateway, as well as how to test webhook verification.
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

// Basic styling
echo "<style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; }
    h2 { color: #3498db; margin-top: 30px; }
    .container { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .warning { color: #f39c12; }
    .info { color: #3498db; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; }
    tr:hover { background-color: #f9f9f9; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type=text], input[type=url], select, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button, .button { padding: 10px 15px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover, .button:hover { background: #2980b9; }
    .actions { margin-top: 20px; }
    .webhook-events { margin: 10px 0; }
    .webhook-events label { display: inline-block; margin-right: 15px; font-weight: normal; }
</style>";

// Determine which example to run based on URL parameter
$action = isset($_GET['action']) ? $_GET['action'] : 'list';

echo "<h1>Webhook Management</h1>";
echo "<div class='actions'>";
echo "<a href='?action=list' class='button'>List Webhooks</a> ";
echo "<a href='?action=create' class='button'>Create Webhook</a> ";
echo "<a href='?action=test' class='button'>Test Webhook Verification</a>";
echo "</div>";

switch ($action) {
    case 'list':
        listWebhooks($client);
        break;
    case 'create':
        createWebhook($client);
        break;
    case 'update':
        updateWebhook($client, $_GET['id'] ?? '');
        break;
    case 'delete':
        deleteWebhook($client, $_GET['id'] ?? '');
        break;
    case 'test':
        testWebhookVerification($client);
        break;
    default:
        listWebhooks($client);
}

/**
 * List all webhooks
 * 
 * @param CryptoPaymentClient $client The API client
 */
function listWebhooks($client) {
    try {
        echo "<h2>Your Webhooks</h2>";
        
        // Get webhooks list
        $webhooks = $client->getWebhooks();
        
        if (empty($webhooks['data'])) {
            echo "<p>No webhooks found. <a href='?action=create'>Create your first webhook</a>.</p>";
            return;
        }
        
        echo "<table>";
        echo "<tr>";
        echo "<th>ID</th>";
        echo "<th>URL</th>";
        echo "<th>Events</th>";
        echo "<th>Status</th>";
        echo "<th>Actions</th>";
        echo "</tr>";
        
        foreach ($webhooks['data'] as $webhook) {
            echo "<tr>";
            echo "<td>{$webhook['id']}</td>";
            echo "<td>{$webhook['url']}</td>";
            echo "<td>" . implode(', ', $webhook['events']) . "</td>";
            echo "<td>{$webhook['status']}</td>";
            echo "<td>";
            echo "<a href='?action=update&id={$webhook['id']}'>Edit</a> | ";
            echo "<a href='?action=delete&id={$webhook['id']}' onclick='return confirm(\"Are you sure?\")'>Delete</a>";
            echo "</td>";
            echo "</tr>";
        }
        
        echo "</table>";
        
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Create a new webhook
 * 
 * @param CryptoPaymentClient $client The API client
 */
function createWebhook($client) {
    echo "<h2>Create New Webhook</h2>";
    
    // Available webhook events
    $availableEvents = [
        'payment.received' => 'Payment Received (unconfirmed)',
        'payment.completed' => 'Payment Completed (confirmed)',
        'payment.failed' => 'Payment Failed',
        'address.expired' => 'Payment Address Expired',
        'refund.created' => 'Refund Created',
        'refund.completed' => 'Refund Completed',
        'refund.failed' => 'Refund Failed'
    ];
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['url'])) {
        try {
            // Get form data
            $url = $_POST['url'];
            $description = $_POST['description'] ?? '';
            $events = $_POST['events'] ?? [];
            
            if (empty($url)) {
                throw new Exception('Webhook URL is required');
            }
            
            if (empty($events)) {
                throw new Exception('At least one event must be selected');
            }
            
            // Create the webhook
            $webhook = $client->createWebhook($url, $events, $description);
            
            echo "<div class='container success'>";
            echo "<h3>Webhook Created Successfully</h3>";
            echo "<p>Webhook ID: {$webhook['data']['id']}</p>";
            echo "<p>URL: {$webhook['data']['url']}</p>";
            echo "<p>Events: " . implode(', ', $webhook['data']['events']) . "</p>";
            echo "<p>Status: {$webhook['data']['status']}</p>";
            echo "<p><a href='?action=list'>Back to Webhook List</a></p>";
            echo "</div>";
            
            // Show webhook security information
            echo "<div class='container info'>";
            echo "<h3>Webhook Security Information</h3>";
            echo "<p>Your webhook will receive the following headers with each request:</p>";
            echo "<ul>";
            echo "<li><strong>X-Signature</strong>: HMAC-SHA256 signature of the payload</li>";
            echo "<li><strong>X-Timestamp</strong>: Unix timestamp when the webhook was sent</li>";
            echo "<li><strong>X-Nonce</strong>: Unique identifier for this webhook request</li>";
            echo "</ul>";
            echo "<p>You should verify the signature to ensure the webhook is authentic. See the 'Test Webhook Verification' section for an example.</p>";
            echo "</div>";
            
            return;
            
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
            displayError("Error", $e->getMessage());
        }
    }
    
    // Display the form
    echo "<div class='container'>";
    echo "<form method='post'>";
    
    echo "<div class='form-group'>";
    echo "<label for='url'>Webhook URL:</label>";
    echo "<input type='url' id='url' name='url' required placeholder='https://example.com/webhook-handler'>";
    echo "<small>This is the endpoint that will receive webhook notifications</small>";
    echo "</div>";
    
    echo "<div class='form-group'>";
    echo "<label>Events to Subscribe:</label>";
    echo "<div class='webhook-events'>";
    foreach ($availableEvents as $eventKey => $eventName) {
        echo "<div>";
        echo "<input type='checkbox' id='event-{$eventKey}' name='events[]' value='{$eventKey}'>";
        echo "<label for='event-{$eventKey}'>{$eventName}</label>";
        echo "</div>";
    }
    echo "</div>";
    echo "</div>";
    
    echo "<div class='form-group'>";
    echo "<label for='description'>Description (optional):</label>";
    echo "<textarea id='description' name='description' rows='3' placeholder='Optional description for this webhook'></textarea>";
    echo "</div>";
    
    echo "<button type='submit'>Create Webhook</button>";
    echo " <a href='?action=list'>Cancel</a>";
    echo "</form>";
    echo "</div>";
    
    // Show implementation tips
    echo "<div class='container info'>";
    echo "<h3>Implementation Tips</h3>";
    echo "<ol>";
    echo "<li>Your webhook endpoint should respond with a 200 status code quickly to acknowledge receipt.</li>";
    echo "<li>Process the webhook asynchronously if it requires time-consuming operations.</li>";
    echo "<li>Always verify the webhook signature to ensure it's authentic.</li>";
    echo "<li>Implement idempotency to handle potential duplicate webhook deliveries.</li>";
    echo "<li>The webhook URL must be publicly accessible (not localhost).</li>";
    echo "</ol>";
    echo "</div>";
}

/**
 * Update an existing webhook
 * 
 * @param CryptoPaymentClient $client The API client
 * @param string              $id     Webhook ID
 */
function updateWebhook($client, $id) {
    if (empty($id)) {
        displayError("Missing parameter", "Webhook ID is required");
        return;
    }
    
    echo "<h2>Update Webhook</h2>";
    
    // Available webhook events
    $availableEvents = [
        'payment.received' => 'Payment Received (unconfirmed)',
        'payment.completed' => 'Payment Completed (confirmed)',
        'payment.failed' => 'Payment Failed',
        'address.expired' => 'Payment Address Expired',
        'refund.created' => 'Refund Created',
        'refund.completed' => 'Refund Completed',
        'refund.failed' => 'Refund Failed'
    ];
    
    try {
        // Get current webhook details
        $webhook = $client->getWebhook($id);
        
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['url'])) {
            // Get form data
            $url = $_POST['url'];
            $description = $_POST['description'] ?? '';
            $events = $_POST['events'] ?? [];
            $status = $_POST['status'] ?? 'ACTIVE';
            
            if (empty($url)) {
                throw new Exception('Webhook URL is required');
            }
            
            if (empty($events)) {
                throw new Exception('At least one event must be selected');
            }
            
            // Update the webhook
            $updatedWebhook = $client->updateWebhook($id, [
                'url' => $url,
                'events' => $events,
                'description' => $description,
                'status' => $status
            ]);
            
            echo "<div class='container success'>";
            echo "<h3>Webhook Updated Successfully</h3>";
            echo "<p>Webhook ID: {$updatedWebhook['data']['id']}</p>";
            echo "<p>URL: {$updatedWebhook['data']['url']}</p>";
            echo "<p>Events: " . implode(', ', $updatedWebhook['data']['events']) . "</p>";
            echo "<p>Status: {$updatedWebhook['data']['status']}</p>";
            echo "<p><a href='?action=list'>Back to Webhook List</a></p>";
            echo "</div>";
            
            return;
        }
        
        // Display the form with current values
        echo "<div class='container'>";
        echo "<form method='post'>";
        
        echo "<div class='form-group'>";
        echo "<label for='url'>Webhook URL:</label>";
        echo "<input type='url' id='url' name='url' required value='{$webhook['data']['url']}'>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label>Events to Subscribe:</label>";
        echo "<div class='webhook-events'>";
        foreach ($availableEvents as $eventKey => $eventName) {
            $checked = in_array($eventKey, $webhook['data']['events']) ? 'checked' : '';
            echo "<div>";
            echo "<input type='checkbox' id='event-{$eventKey}' name='events[]' value='{$eventKey}' {$checked}>";
            echo "<label for='event-{$eventKey}'>{$eventName}</label>";
            echo "</div>";
        }
        echo "</div>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='description'>Description (optional):</label>";
        echo "<textarea id='description' name='description' rows='3'>{$webhook['data']['description']}</textarea>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='status'>Status:</label>";
        echo "<select id='status' name='status'>";
        echo "<option value='ACTIVE'" . ($webhook['data']['status'] === 'ACTIVE' ? ' selected' : '') . ">Active</option>";
        echo "<option value='INACTIVE'" . ($webhook['data']['status'] === 'INACTIVE' ? ' selected' : '') . ">Inactive</option>";
        echo "</select>";
        echo "</div>";
        
        echo "<button type='submit'>Update Webhook</button>";
        echo " <a href='?action=list'>Cancel</a>";
        echo "</form>";
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
        displayError("Error", $e->getMessage());
    }
}

/**
 * Delete a webhook
 * 
 * @param CryptoPaymentClient $client The API client
 * @param string              $id     Webhook ID
 */
function deleteWebhook($client, $id) {
    if (empty($id)) {
        displayError("Missing parameter", "Webhook ID is required");
        return;
    }
    
    try {
        // Delete the webhook
        $client->deleteWebhook($id);
        
        echo "<div class='container success'>";
        echo "<h3>Webhook Deleted Successfully</h3>";
        echo "<p>The webhook has been deleted.</p>";
        echo "<p><a href='?action=list'>Back to Webhook List</a></p>";
        echo "</div>";
        
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Error", $e->getMessage());
    }
}

/**
 * Test webhook signature verification
 * 
 * @param CryptoPaymentClient $client The API client
 */
function testWebhookVerification($client) {
    echo "<h2>Test Webhook Verification</h2>";
    
    echo "<div class='container'>";
    echo "<p>This tool helps you test webhook signature verification. It simulates receiving a webhook and verifying its signature.</p>";
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['payload'])) {
        try {
            $payload = $_POST['payload'];
            $signature = $_POST['signature'];
            $timestamp = $_POST['timestamp'] ?: null;
            
            // Verify the signature
            $isValid = $client->verifyWebhookSignature($payload, $signature, $timestamp);
            
            if ($isValid) {
                echo "<div class='success'>";
                echo "<h3>✓ Signature Valid</h3>";
                echo "<p>The webhook signature is valid. This means the webhook is authentic and has not been tampered with.</p>";
                echo "</div>";
            } else {
                echo "<div class='error'>";
                echo "<h3>✗ Signature Invalid</h3>";
                echo "<p>The webhook signature is invalid. This could mean the webhook has been tampered with or the signature was generated with a different secret.</p>";
                echo "</div>";
            }
        } catch (CryptoPaymentException $e) {
            displayError("Verification error", $e->getMessage());
        } catch (Exception $e) {
            displayError("Error", $e->getMessage());
        }
    }
    
    // Sample webhook payload
    $samplePayload = json_encode([
        'event' => 'payment.completed',
        'data' => [
            'transaction' => [
                'id' => 'tx_' . bin2hex(random_bytes(8)),
                'amount' => '100.50',
                'currency' => 'USDT',
                'status' => 'COMPLETED',
                'createdAt' => date('c')
            ],
            'address' => [
                'id' => 'addr_' . bin2hex(random_bytes(8)),
                'address' => '0x' . bin2hex(random_bytes(20)),
                'metadata' => [
                    'orderId' => 'ORDER-12345'
                ]
            ]
        ]
    ], JSON_PRETTY_PRINT);
    
    // Generate a timestamp
    $timestamp = time();
    
    // Generate a signature
    $signatureData = $timestamp . "\n" . $samplePayload;
    $signature = hash_hmac('sha256', $signatureData, $apiSecret);
    
    echo "<form method='post'>";
    
    echo "<div class='form-group'>";
    echo "<label for='payload'>Webhook Payload (JSON):</label>";
    echo "<textarea id='payload' name='payload' rows='10' required>{$samplePayload}</textarea>";
    echo "<small>This is the raw JSON payload that would be sent to your webhook endpoint.</small>";
    echo "</div>";
    
    echo "<div class='form-group'>";
    echo "<label for='signature'>X-Signature Header:</label>";
    echo "<input type='text' id='signature' name='signature' required value='{$signature}'>";
    echo "<small>This is the HMAC-SHA256 signature of the payload, generated using your API secret.</small>";
    echo "</div>";
    
    echo "<div class='form-group'>";
    echo "<label for='timestamp'>X-Timestamp Header (optional):</label>";
    echo "<input type='text' id='timestamp' name='timestamp' value='{$timestamp}'>";
    echo "<small>Unix timestamp when the webhook was sent. Used for replay protection.</small>";
    echo "</div>";
    
    echo "<button type='submit'>Verify Signature</button>";
    echo "</form>";
    echo "</div>";
    
    // Show implementation code
    echo "<div class='container info'>";
    echo "<h3>PHP Implementation Code</h3>";
    echo "<p>Here's how to verify webhook signatures in your application:</p>";
    echo "<pre style='background: #f5f5f5; padding: 15px; overflow: auto;'>";
    echo htmlspecialchars("<?php
// Get the raw POST data
$payload = file_get_contents('php://input');

// Get headers
$headers = getallheaders();
$signature = $headers['X-Signature'] ?? '';
$timestamp = $headers['X-Timestamp'] ?? '';

// Verify the signature
$isValid = $client->verifyWebhookSignature($payload, $signature, $timestamp);

if (!$isValid) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// Process the webhook...
");
    echo "</pre>";
    echo "</div>";
}

/**
 * Display error message
 * 
 * @param string $title   Error title
 * @param string $message Error message
 * @param array  $details Additional error details
 */
function displayError($title, $message, array $details = []) {
    echo "<div class='container error'>";
    echo "<h3>{$title}</h3>";
    echo "<p>{$message}</p>";
    
    if (!empty($details)) {
        echo "<ul>";
        foreach ($details as $detail) {
            echo "<li>{$detail}</li>";
        }
        echo "</ul>";
    }
    
    echo "</div>";
}