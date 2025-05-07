<?php

namespace CryptoPaymentGateway;

/**
 * CryptoPaymentClient - PHP client for the Crypto Payment Gateway API
 *
 * This client handles authentication, request signing, and provides methods
 * for interacting with all available API endpoints.
 */
class CryptoPaymentClient
{
    /** @var string API key */
    private $apiKey;
    
    /** @var string API secret */
    private $apiSecret;
    
    /** @var string Base URL for API requests */
    private $baseUrl;
    
    /** @var int Request timeout in seconds */
    private $timeout = 30;
    
    /** @var array Default headers sent with every request */
    private $defaultHeaders = [];
    
    /** @var bool Whether to verify SSL certificates */
    private $verifySsl = true;
    
    /** @var int Maximum number of retries for rate-limited requests */
    private $maxRetries = 3;
    
    /** @var int Base delay between retries in milliseconds */
    private $retryDelay = 1000;
    
    /** @var string Version of the client library */
    const VERSION = '1.0.0';
    
    /**
     * Constructor
     *
     * @param string $apiKey    Your API key
     * @param string $apiSecret Your API secret
     * @param string $baseUrl   Base URL for the API (default: production URL)
     */
    public function __construct(string $apiKey, string $apiSecret, string $baseUrl = 'https://api.example.com/v1')
    {
        if (empty($apiKey) || empty($apiSecret)) {
            throw new CryptoPaymentException('API key and secret are required');
        }
        
        $this->apiKey = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->baseUrl = rtrim($baseUrl, '/');
        
        // Set default headers
        $this->defaultHeaders = [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'User-Agent' => 'CryptoPaymentGateway-PHP/' . self::VERSION,
            'X-API-Key' => $this->apiKey
        ];
    }
    
    /**
     * Set request timeout
     *
     * @param int $seconds Timeout in seconds
     * @return self
     */
    public function setTimeout(int $seconds): self
    {
        $this->timeout = max(1, $seconds);
        return $this;
    }
    
    /**
     * Set whether to verify SSL certificates
     *
     * @param bool $verify Whether to verify SSL certificates
     * @return self
     */
    public function setVerifySsl(bool $verify): self
    {
        $this->verifySsl = $verify;
        return $this;
    }
    
    /**
     * Generate a payment address
     *
     * @param string $currency       Currency code (e.g., 'USDT')
     * @param float  $expectedAmount Expected payment amount
     * @param int    $expiresIn      Expiration time in seconds (default: 3600)
     * @param array  $metadata       Optional metadata for the payment
     * @return array Payment address details
     */
    public function generatePaymentAddress(string $currency, float $expectedAmount, int $expiresIn = 3600, array $metadata = []): array
    {
        $payload = [
            'currency' => $currency,
            'expectedAmount' => (string) $expectedAmount,
            'expiresIn' => $expiresIn,
            'metadata' => $metadata
        ];
        
        return $this->request('POST', '/merchant/payment-addresses', $payload);
    }
    
    /**
     * Get payment address details
     *
     * @param string $addressId Payment address ID
     * @return array Payment address details
     */
    public function getPaymentAddress(string $addressId): array
    {
        return $this->request('GET', "/merchant/payment-addresses/{$addressId}");
    }
    
    /**
     * Get payment addresses list
     *
     * @param int    $page   Page number (default: 1)
     * @param int    $limit  Items per page (default: 20)
     * @param string $status Filter by status (optional)
     * @return array List of payment addresses
     */
    public function getPaymentAddresses(int $page = 1, int $limit = 20, string $status = null): array
    {
        $query = ['page' => $page, 'limit' => $limit];
        
        if ($status !== null) {
            $query['status'] = $status;
        }
        
        return $this->request('GET', '/merchant/payment-addresses', null, $query);
    }
    
    /**
     * Get transactions list
     *
     * @param int    $page      Page number (default: 1)
     * @param int    $limit     Items per page (default: 20)
     * @param string $status    Filter by status (optional)
     * @param string $startDate Filter by start date (ISO format, optional)
     * @param string $endDate   Filter by end date (ISO format, optional)
     * @return array List of transactions
     */
    public function getTransactions(int $page = 1, int $limit = 20, string $status = null, string $startDate = null, string $endDate = null): array
    {
        $query = ['page' => $page, 'limit' => $limit];
        
        if ($status !== null) {
            $query['status'] = $status;
        }
        
        if ($startDate !== null) {
            $query['startDate'] = $startDate;
        }
        
        if ($endDate !== null) {
            $query['endDate'] = $endDate;
        }
        
        return $this->request('GET', '/transactions', null, $query);
    }
    
    /**
     * Get transaction details
     *
     * @param string $transactionId Transaction ID
     * @return array Transaction details
     */
    public function getTransaction(string $transactionId): array
    {
        return $this->request('GET', "/transactions/{$transactionId}");
    }
    
    /**
     * Get merchant dashboard data
     *
     * @return array Dashboard data
     */
    public function getDashboardData(): array
    {
        return $this->request('GET', '/merchant/dashboard');
    }
    
    /**
     * Update merchant profile
     *
     * @param array $profileData Profile data to update
     * @return array Updated merchant profile
     */
    public function updateMerchantProfile(array $profileData): array
    {
        return $this->request('PATCH', '/merchant/profile', $profileData);
    }
    
    /**
     * Verify webhook signature
     *
     * @param string $payload   Raw webhook payload
     * @param string $signature Signature from X-Signature header
     * @param string $timestamp Timestamp from X-Timestamp header
     * @return bool Whether the signature is valid
     * @throws CryptoPaymentException If the timestamp is too old (replay protection)
     */
    public function verifyWebhookSignature(string $payload, string $signature, string $timestamp = null): bool
    {
        // If timestamp is provided, verify it's not too old (5 minute window)
        if ($timestamp !== null) {
            $now = time();
            $timestampInt = (int) $timestamp;
            $fiveMinutesAgo = $now - 300;
            
            if ($timestampInt < $fiveMinutesAgo) {
                throw new CryptoPaymentException('Webhook timestamp is too old', 400);
            }
            
            // Create signature with timestamp
            $signatureData = $timestamp . "\n" . $payload;
            $expectedSignature = hash_hmac('sha256', $signatureData, $this->apiSecret);
        } else {
            // Fallback to simple signature
            $expectedSignature = hash_hmac('sha256', $payload, $this->apiSecret);
        }
        
        return hash_equals($expectedSignature, $signature);
    }
    
    /**
     * Create a refund
     *
     * @param string $transactionId Transaction ID to refund
     * @param float  $amount        Amount to refund (optional, defaults to full amount)
     * @param string $reason        Reason for the refund
     * @return array Refund details
     */
    public function createRefund(string $transactionId, float $amount = null, string $reason = ''): array
    {
        $payload = ['reason' => $reason];
        
        if ($amount !== null) {
            $payload['amount'] = (string) $amount;
        }
        
        return $this->request('POST', "/transactions/{$transactionId}/refunds", $payload);
    }
    
    /**
     * Get refund details
     *
     * @param string $refundId Refund ID
     * @return array Refund details
     */
    public function getRefund(string $refundId): array
    {
        return $this->request('GET', "/refunds/{$refundId}");
    }
    
    /**
     * Get refunds list
     *
     * @param int    $page      Page number (default: 1)
     * @param int    $limit     Items per page (default: 20)
     * @param string $status    Filter by status (optional)
     * @param string $startDate Filter by start date (ISO format, optional)
     * @param string $endDate   Filter by end date (ISO format, optional)
     * @return array List of refunds
     */
    public function getRefunds(int $page = 1, int $limit = 20, string $status = null, string $startDate = null, string $endDate = null): array
    {
        $query = ['page' => $page, 'limit' => $limit];
        
        if ($status !== null) {
            $query['status'] = $status;
        }
        
        if ($startDate !== null) {
            $query['startDate'] = $startDate;
        }
        
        if ($endDate !== null) {
            $query['endDate'] = $endDate;
        }
        
        return $this->request('GET', '/refunds', null, $query);
    }
    
    /**
     * Get supported currencies
     *
     * @return array List of supported currencies
     */
    public function getSupportedCurrencies(): array
    {
        return $this->request('GET', '/currencies');
    }
    
    /**
     * Get current exchange rates
     *
     * @param string $baseCurrency Base currency code
     * @return array Exchange rates
     */
    public function getExchangeRates(string $baseCurrency = 'USD'): array
    {
        return $this->request('GET', '/exchange-rates', null, ['base' => $baseCurrency]);
    }
    
    /**
     * Set maximum number of retries for rate-limited requests
     *
     * @param int $retries Maximum number of retries
     * @return self
     */
    public function setMaxRetries(int $retries): self
    {
        $this->maxRetries = max(0, $retries);
        return $this;
    }
    
    /**
     * Set base delay between retries in milliseconds
     *
     * @param int $delayMs Base delay in milliseconds
     * @return self
     */
    public function setRetryDelay(int $delayMs): self
    {
        $this->retryDelay = max(100, $delayMs);
        return $this;
    }
    
    /**
     * Create a webhook configuration
     *
     * @param string $url         Webhook URL
     * @param array  $events      Events to subscribe to
     * @param string $description Optional description
     * @return array Webhook configuration details
     */
    public function createWebhook(string $url, array $events, string $description = ''): array
    {
        $payload = [
            'url' => $url,
            'events' => $events,
            'description' => $description
        ];
        
        return $this->request('POST', '/webhooks', $payload);
    }
    
    /**
     * Get webhook details
     *
     * @param string $webhookId Webhook ID
     * @return array Webhook details
     */
    public function getWebhook(string $webhookId): array
    {
        return $this->request('GET', "/webhooks/{$webhookId}");
    }
    
    /**
     * Get webhooks list
     *
     * @param int $page  Page number (default: 1)
     * @param int $limit Items per page (default: 20)
     * @return array List of webhooks
     */
    public function getWebhooks(int $page = 1, int $limit = 20): array
    {
        $query = ['page' => $page, 'limit' => $limit];
        return $this->request('GET', '/webhooks', null, $query);
    }
    
    /**
     * Update webhook configuration
     *
     * @param string $webhookId   Webhook ID
     * @param array  $webhookData Webhook data to update
     * @return array Updated webhook details
     */
    public function updateWebhook(string $webhookId, array $webhookData): array
    {
        return $this->request('PUT', "/webhooks/{$webhookId}", $webhookData);
    }
    
    /**
     * Delete webhook configuration
     *
     * @param string $webhookId Webhook ID
     * @return array Deletion confirmation
     */
    public function deleteWebhook(string $webhookId): array
    {
        return $this->request('DELETE', "/webhooks/{$webhookId}");
    }
    
    /**
     * Send a request to the API
     *
     * @param string $method  HTTP method (GET, POST, etc.)
     * @param string $path    API endpoint path
     * @param array  $payload Request payload (for POST, PUT, PATCH)
     * @param array  $query   Query parameters (for GET)
     * @return array Response data
     * @throws CryptoPaymentException If the request fails
     */
    private function request(string $method, string $path, array $payload = null, array $query = []): array
    {
        $retries = 0;
        
        while (true) {
            try {
                return $this->executeRequest($method, $path, $payload, $query);
            } catch (CryptoPaymentException $e) {
                // If we've hit a rate limit and have retries left, wait and try again
                if ($e->getCode() === 429 && $retries < $this->maxRetries) {
                    $retries++;
                    $delay = $this->retryDelay * pow(2, $retries - 1); // Exponential backoff
                    usleep($delay * 1000); // Convert to microseconds
                    continue;
                }
                
                // Otherwise, rethrow the exception
                throw $e;
            }
        }
    }
    
    /**
     * Execute an API request
     *
     * @param string $method  HTTP method (GET, POST, etc.)
     * @param string $path    API endpoint path
     * @param array  $payload Request payload (for POST, PUT, PATCH)
     * @param array  $query   Query parameters (for GET)
     * @return array Response data
     * @throws CryptoPaymentException If the request fails
     */
    private function executeRequest(string $method, string $path, array $payload = null, array $query = []): array
    {
        $url = $this->baseUrl . $path;
        
        // Add query parameters if any
        if (!empty($query)) {
            $url .= '?' . http_build_query($query);
        }
        
        // Prepare request
        $timestamp = time();
        $nonce = bin2hex(random_bytes(16));
        
        // Create signature - Fix the newline format
        $signaturePayload = $timestamp . "\n" . $nonce . "\n" . $method . "\n" . $path;
        
        if ($payload !== null) {
            $signaturePayload .= "\n" . json_encode($payload);
        }
        
        $signature = hash_hmac('sha256', $signaturePayload, $this->apiSecret);
        
        // Set headers
        $headers = $this->defaultHeaders;
        $headers['X-Timestamp'] = $timestamp;
        $headers['X-Nonce'] = $nonce;
        $headers['X-Signature'] = $signature;
        
        // Format headers for cURL
        $curlHeaders = [];
        foreach ($headers as $key => $value) {
            $curlHeaders[] = $key . ': ' . $value;
        }
        
        // Initialize cURL
        $ch = curl_init();
        
        // Set cURL options
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $this->verifySsl);
        curl_setopt($ch, CURLOPT_HEADER, true); // To capture headers for rate limit info
        
        // Set method-specific options
        switch ($method) {
            case 'GET':
                break;
            case 'POST':
                curl_setopt($ch, CURLOPT_POST, true);
                if ($payload !== null) {
                    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
                }
                break;
            case 'PUT':
            case 'PATCH':
            case 'DELETE':
                curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
                if ($payload !== null) {
                    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
                }
                break;
        }
        
        // Execute request
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $error = curl_error($ch);
        
        curl_close($ch);
        
        // Handle errors
        if ($response === false) {
            throw new CryptoPaymentException('cURL error: ' . $error, 0);
        }
        
        // Split headers and body
        $headers = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);
        
        $responseData = json_decode($body, true);
        
        if ($responseData === null && $body !== '') {
            throw new CryptoPaymentException('Invalid JSON response: ' . $body, 0);
        }
        
        if ($httpCode >= 400) {
            $errorCode = $httpCode;
            $errorMessage = isset($responseData['message']) ? $responseData['message'] : 'Unknown error';
            
            // Check for rate limiting
            if ($httpCode === 429) {
                // Extract rate limit headers if available
                preg_match('/X-RateLimit-Reset: (\d+)/i', $headers, $resetMatches);
                $resetTime = isset($resetMatches[1]) ? (int)$resetMatches[1] : null;
                
                throw new CryptoPaymentRateLimitException(
                    'Rate limit exceeded. Try again after reset.',
                    429,
                    $resetTime
                );
            }
            
            throw new CryptoPaymentException('API error (' . $errorCode . '): ' . $errorMessage, $errorCode);
        }
        
        return $responseData ?? [];
    }
}