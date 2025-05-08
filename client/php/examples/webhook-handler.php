<?php
/**
 * Webhook Handler Example
 * 
 * This example demonstrates how to handle incoming webhooks from the Crypto Payment Gateway.
 * It validates the webhook signature and processes different event types.
 */

require_once '../CryptoPaymentClient.php'; // Adjust path as needed
require_once '../CryptoPaymentException.php'; // Include exception classes
// Or if using Composer: require_once 'vendor/autoload.php';

use CryptoPaymentGateway\CryptoPaymentClient;
use CryptoPaymentGateway\CryptoPaymentException;

// Load configuration (in a real application, use environment variables or a secure config system)
$apiKey = getenv('CRYPTO_PAYMENT_API_KEY') ?: 'pk_941a83045834ad23c8e38587f2bbf90c';
$apiSecret = getenv('CRYPTO_PAYMENT_API_SECRET') ?: 'sk_1517e70a64bab54a0a9ea9f9376327dee76e8011f0b22e6d23d8e09e6b2485a6';
$apiBaseUrl = getenv('CRYPTO_PAYMENT_API_BASEURL') ?: 'https://eoscryptopago.com/api/v1';

// Initialize the client
$client = new CryptoPaymentClient($apiKey, $apiSecret, $apiBaseUrl);

// Get the raw webhook payload
$payload = file_get_contents('php://input');

// Get the signature and timestamp from the headers
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? null;

// Log the incoming webhook (optional)
file_put_contents('webhook_log.txt', date('Y-m-d H:i:s') . " - Received webhook\n", FILE_APPEND);
file_put_contents('webhook_log.txt', "Payload: {$payload}\n", FILE_APPEND);
file_put_contents('webhook_log.txt', "Signature: {$signature}\n", FILE_APPEND);
file_put_contents('webhook_log.txt', "Timestamp: {$timestamp}\n\n", FILE_APPEND);

try {
    // Verify the webhook signature with timestamp for replay protection
    if (!$client->verifyWebhookSignature($payload, $signature, $timestamp)) {
        // Invalid signature - reject the webhook
        http_response_code(401);
        echo json_encode([
            'status' => 'error',
            'message' => 'Invalid signature'
        ]);
        exit;
    }
} catch (CryptoPaymentException $e) {
    // Handle verification error (e.g., expired timestamp)
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
        'code' => $e->getCode()
    ]);
    exit;
}

// Parse the payload
$data = json_decode($payload, true);
if (!$data) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload'
    ]);
    exit;
}

// Extract event type
$event = $data['event'] ?? '';

// Process different event types
switch ($event) {
    case 'payment.received':
        // Payment has been received but not confirmed yet
        handlePaymentReceived($data);
        break;
        
    case 'payment.confirmed':
        // Payment has been confirmed on the blockchain
        handlePaymentConfirmed($data);
        break;
        
    case 'payment.completed':
        // Payment has been fully processed
        handlePaymentCompleted($data);
        break;
        
    case 'payment.failed':
        // Payment has failed
        handlePaymentFailed($data);
        break;
        
    case 'address.expired':
        // Payment address has expired
        handleAddressExpired($data);
        break;
        
    default:
        // Unknown event type
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'Unknown event type: ' . $event
        ]);
        exit;
}

// Send success response
http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => 'Webhook processed successfully'
]);

/**
 * Handle payment received event
 */
function handlePaymentReceived(array $data): void
{
    // Extract relevant data
    $transactionId = $data['data']['transaction']['id'] ?? '';
    $amount = $data['data']['transaction']['amount'] ?? 0;
    $currency = $data['data']['transaction']['currency'] ?? '';
    $merchantId = $data['data']['merchant']['id'] ?? '';
    
    // Log the event
    file_put_contents('webhook_log.txt', "Payment received: {$amount} {$currency} (Transaction ID: {$transactionId})\n", FILE_APPEND);
    
    // TODO: Update your database to mark the payment as received
    // TODO: Notify your application about the payment
}

/**
 * Handle payment confirmed event
 */
function handlePaymentConfirmed(array $data): void
{
    // Extract relevant data
    $transactionId = $data['data']['transaction']['id'] ?? '';
    $amount = $data['data']['transaction']['amount'] ?? 0;
    $currency = $data['data']['transaction']['currency'] ?? '';
    $confirmations = $data['data']['transaction']['confirmations'] ?? 0;
    
    // Log the event
    file_put_contents('webhook_log.txt', "Payment confirmed: {$amount} {$currency} with {$confirmations} confirmations (Transaction ID: {$transactionId})\n", FILE_APPEND);
    
    // TODO: Update your database to mark the payment as confirmed
    // TODO: Notify your application about the confirmation
}

/**
 * Handle payment completed event
 */
function handlePaymentCompleted(array $data): void
{
    // Extract relevant data
    $transactionId = $data['data']['transaction']['id'] ?? '';
    $amount = $data['data']['transaction']['amount'] ?? 0;
    $currency = $data['data']['transaction']['currency'] ?? '';
    $metadata = $data['data']['transaction']['metadata'] ?? [];
    
    // Extract order ID from metadata if available
    $orderId = $metadata['orderId'] ?? 'unknown';
    
    // Log the event
    file_put_contents('webhook_log.txt', "Payment completed: {$amount} {$currency} for order {$orderId} (Transaction ID: {$transactionId})\n", FILE_APPEND);
    
    // TODO: Update your database to mark the payment as completed
    // TODO: Fulfill the order or provide access to purchased goods/services
    // TODO: Send confirmation email to customer
}

/**
 * Handle payment failed event
 */
function handlePaymentFailed(array $data): void
{
    // Extract relevant data
    $transactionId = $data['data']['transaction']['id'] ?? '';
    $reason = $data['data']['reason'] ?? 'Unknown reason';
    $metadata = $data['data']['transaction']['metadata'] ?? [];
    
    // Extract order ID from metadata if available
    $orderId = $metadata['orderId'] ?? 'unknown';
    
    // Log the event
    file_put_contents('webhook_log.txt', "Payment failed for order {$orderId}: {$reason} (Transaction ID: {$transactionId})\n", FILE_APPEND);
    
    // TODO: Update your database to mark the payment as failed
    // TODO: Notify customer about the failed payment
    // TODO: Provide instructions for alternative payment methods
}

/**
 * Handle address expired event
 */
function handleAddressExpired(array $data): void
{
    // Extract relevant data
    $addressId = $data['data']['address']['id'] ?? '';
    $address = $data['data']['address']['address'] ?? '';
    $metadata = $data['data']['address']['metadata'] ?? [];
    
    // Extract order ID from metadata if available
    $orderId = $metadata['orderId'] ?? 'unknown';
    
    // Log the event
    file_put_contents('webhook_log.txt', "Payment address expired: {$address} for order {$orderId} (Address ID: {$addressId})\n", FILE_APPEND);
    
    // TODO: Update your database to mark the payment address as expired
    // TODO: Notify customer that their payment window has expired
    // TODO: Provide instructions for generating a new payment address
}