<?php
/**
 * Example: Webhook handler for Crypto Payment Gateway callbacks
 * 
 * This script should be hosted at a publicly accessible URL that you provide
 * as the callbackUrl when creating payments.
 * 
 * Example URL: https://yourdomain.com/webhook-handler.php
 */

// Log all incoming webhooks for debugging
$logFile = 'webhooks.log';
$rawInput = file_get_contents('php://input');
$method = $_SERVER['REQUEST_METHOD'];
$timestamp = date('Y-m-d H:i:s');

// Log the raw webhook data
file_put_contents($logFile, "[{$timestamp}] New webhook received ({$method}):\n{$rawInput}\n\n", FILE_APPEND);

// Parse the JSON payload
$payload = json_decode($rawInput, true);

if (!$payload) {
    // Invalid JSON or empty request
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid webhook payload']);
    exit;
}

// Verify the webhook signature if provided
// This is a security best practice to ensure webhooks are coming from your payment gateway
$signature = isset($_SERVER['HTTP_X_SIGNATURE']) ? $_SERVER['HTTP_X_SIGNATURE'] : null;

// In a production environment, you would verify the signature here
// using your API secret to ensure the webhook is legitimate
// $calculatedSignature = hash_hmac('sha256', $rawInput, 'your-api-secret');
// if ($signature !== $calculatedSignature) {
//     http_response_code(401);
//     echo json_encode(['status' => 'error', 'message' => 'Invalid signature']);
//     exit;
// }

// Process the webhook based on type
if (isset($payload['event'])) {
    $event = $payload['event'];
    $data = $payload['data'];
    
    // Log processing information
    file_put_contents($logFile, "[{$timestamp}] Processing event: {$event}\n", FILE_APPEND);
    
    switch ($event) {
        case 'payment.created':
            // A new payment has been created
            handlePaymentCreated($data);
            break;
            
        case 'payment.pending':
            // Payment transaction detected but waiting for confirmations
            handlePaymentPending($data);
            break;
            
        case 'payment.completed':
            // Payment has been completed (fully confirmed)
            handlePaymentCompleted($data);
            break;
            
        case 'payment.failed':
            // Payment failed or expired
            handlePaymentFailed($data);
            break;
            
        case 'payout.created':
            // A new payout has been created
            handlePayoutCreated($data);
            break;
            
        case 'payout.pending':
            // Payout is being processed
            handlePayoutPending($data);
            break;
            
        case 'payout.completed':
            // Payout has been completed
            handlePayoutCompleted($data);
            break;
            
        case 'payout.failed':
            // Payout has failed
            handlePayoutFailed($data);
            break;
            
        default:
            // Unknown event type
            file_put_contents($logFile, "[{$timestamp}] Unknown event type: {$event}\n", FILE_APPEND);
            break;
    }
    
    // Return success response
    http_response_code(200);
    echo json_encode(['status' => 'success', 'message' => "Processed {$event} event"]);
} else {
    // Invalid webhook format
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid webhook format']);
}

/**
 * Handle payment.created event
 */
function handlePaymentCreated($data) {
    // Extract payment data
    $paymentId = $data['id'];
    $currency = $data['currency'];
    $amount = $data['expectedAmount'];
    $address = $data['address'];
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get order ID from metadata if available
    $orderId = isset($metadata['orderId']) ? $metadata['orderId'] : 'unknown';
    
    // Log the payment creation
    file_put_contents('webhooks.log', "Payment created: {$paymentId} for order {$orderId} - {$amount} {$currency} to {$address}\n", FILE_APPEND);
    
    // Update your database to mark the order as awaiting payment
    // Example: updateOrderStatus($orderId, 'awaiting_payment', $paymentId);
}

/**
 * Handle payment.pending event
 */
function handlePaymentPending($data) {
    // Extract payment data
    $paymentId = $data['id'];
    $currency = $data['currency'];
    $receivedAmount = $data['receivedAmount'];
    $expectedAmount = $data['expectedAmount'];
    $confirmations = $data['confirmations'];
    $requiredConfirmations = $data['requiredConfirmations'];
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get order ID from metadata if available
    $orderId = isset($metadata['orderId']) ? $metadata['orderId'] : 'unknown';
    
    // Log the pending payment
    file_put_contents('webhooks.log', "Payment pending: {$paymentId} for order {$orderId} - Received: {$receivedAmount} {$currency} (Expected: {$expectedAmount}) - Confirmations: {$confirmations}/{$requiredConfirmations}\n", FILE_APPEND);
    
    // Update your database to mark the order as payment pending
    // Example: updateOrderStatus($orderId, 'payment_pending', $paymentId, $confirmations, $requiredConfirmations);
}

/**
 * Handle payment.completed event
 */
function handlePaymentCompleted($data) {
    // Extract payment data
    $paymentId = $data['id'];
    $currency = $data['currency'];
    $receivedAmount = $data['receivedAmount'];
    $expectedAmount = $data['expectedAmount'];
    $txIds = isset($data['txIds']) ? $data['txIds'] : [];
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get order ID from metadata if available
    $orderId = isset($metadata['orderId']) ? $metadata['orderId'] : 'unknown';
    
    // Log the completed payment
    file_put_contents('webhooks.log', "Payment completed: {$paymentId} for order {$orderId} - Received: {$receivedAmount} {$currency} (Expected: {$expectedAmount})\n", FILE_APPEND);
    
    // Update your database to mark the order as paid
    // Example: updateOrderStatus($orderId, 'paid', $paymentId);
    
    // Process the order fulfillment
    // Example: processOrderFulfillment($orderId);
    
    // Send confirmation email to customer
    // Example: sendPaymentConfirmationEmail($metadata['customerEmail'], $orderId, $receivedAmount, $currency);
}

/**
 * Handle payment.failed event
 */
function handlePaymentFailed($data) {
    // Extract payment data
    $paymentId = $data['id'];
    $currency = $data['currency'];
    $expectedAmount = $data['expectedAmount'];
    $reason = isset($data['failureReason']) ? $data['failureReason'] : 'unknown';
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get order ID from metadata if available
    $orderId = isset($metadata['orderId']) ? $metadata['orderId'] : 'unknown';
    
    // Log the failed payment
    file_put_contents('webhooks.log', "Payment failed: {$paymentId} for order {$orderId} - Reason: {$reason}\n", FILE_APPEND);
    
    // Update your database to mark the order as payment failed
    // Example: updateOrderStatus($orderId, 'payment_failed', $paymentId, $reason);
    
    // Notify customer about failed payment
    // Example: sendPaymentFailedEmail($metadata['customerEmail'], $orderId, $reason);
}

/**
 * Handle payout.created event
 */
function handlePayoutCreated($data) {
    // Extract payout data
    $payoutId = $data['id'];
    $currency = $data['currency'];
    $amount = $data['amount'];
    $address = $data['address'];
    $network = $data['network'];
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get reference ID from metadata if available
    $referenceId = isset($metadata['referenceId']) ? $metadata['referenceId'] : 'unknown';
    
    // Log the payout creation
    file_put_contents('webhooks.log', "Payout created: {$payoutId} ref {$referenceId} - {$amount} {$currency} to {$address} on {$network}\n", FILE_APPEND);
    
    // Update your database to mark the payout as created
    // Example: updatePayoutStatus($referenceId, 'created', $payoutId);
}

/**
 * Handle payout.pending event
 */
function handlePayoutPending($data) {
    // Extract payout data
    $payoutId = $data['id'];
    $currency = $data['currency'];
    $amount = $data['amount'];
    $txId = isset($data['txId']) ? $data['txId'] : null;
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get reference ID from metadata if available
    $referenceId = isset($metadata['referenceId']) ? $metadata['referenceId'] : 'unknown';
    
    // Log the pending payout
    file_put_contents('webhooks.log', "Payout pending: {$payoutId} ref {$referenceId} - {$amount} {$currency}" . ($txId ? " (TxID: {$txId})" : "") . "\n", FILE_APPEND);
    
    // Update your database to mark the payout as pending
    // Example: updatePayoutStatus($referenceId, 'pending', $payoutId, $txId);
}

/**
 * Handle payout.completed event
 */
function handlePayoutCompleted($data) {
    // Extract payout data
    $payoutId = $data['id'];
    $currency = $data['currency'];
    $amount = $data['amount'];
    $txId = isset($data['txId']) ? $data['txId'] : null;
    $blockExplorerUrl = isset($data['blockExplorerUrl']) ? $data['blockExplorerUrl'] : null;
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get reference ID from metadata if available
    $referenceId = isset($metadata['referenceId']) ? $metadata['referenceId'] : 'unknown';
    
    // Log the completed payout
    file_put_contents('webhooks.log', "Payout completed: {$payoutId} ref {$referenceId} - {$amount} {$currency}" . ($txId ? " (TxID: {$txId})" : "") . "\n", FILE_APPEND);
    
    // Update your database to mark the payout as completed
    // Example: updatePayoutStatus($referenceId, 'completed', $payoutId, $txId);
    
    // Send confirmation email to vendor
    // Example: sendPayoutConfirmationEmail($metadata['vendorEmail'], $referenceId, $amount, $currency, $txId, $blockExplorerUrl);
}

/**
 * Handle payout.failed event
 */
function handlePayoutFailed($data) {
    // Extract payout data
    $payoutId = $data['id'];
    $currency = $data['currency'];
    $amount = $data['amount'];
    $reason = isset($data['failureReason']) ? $data['failureReason'] : 'unknown';
    $metadata = isset($data['metadata']) ? $data['metadata'] : [];
    
    // Get reference ID from metadata if available
    $referenceId = isset($metadata['referenceId']) ? $metadata['referenceId'] : 'unknown';
    
    // Log the failed payout
    file_put_contents('webhooks.log', "Payout failed: {$payoutId} ref {$referenceId} - {$amount} {$currency} - Reason: {$reason}\n", FILE_APPEND);
    
    // Update your database to mark the payout as failed
    // Example: updatePayoutStatus($referenceId, 'failed', $payoutId, null, $reason);
    
    // Notify administrator about failed payout
    // Example: sendPayoutFailedEmail($metadata['adminEmail'], $referenceId, $amount, $currency, $reason);
}
