<?php
/**
 * Crypto Payment Gateway PHP SDK
 * 
 * A PHP SDK for interacting with the Crypto Payment Gateway API
 */
class CryptoPaymentSDK {
    /**
     * Base URL for the API
     * @var string
     */
    private $baseUrl;
    
    /**
     * Email for authentication
     * @var string
     */
    private $email;
    
    /**
     * Password for authentication
     * @var string
     */
    private $password;
    
    /**
     * JWT token for authenticated requests
     * @var string
     */
    private $token;
    
    /**
     * Debug mode flag
     * @var bool
     */
    private $debug;
    
    /**
     * Constructor
     * 
     * @param string $baseUrl Base URL for the API (e.g. https://eoscryptopago.com)
     * @param string $email Email for authentication
     * @param string $password Password for authentication
     * @param bool $debug Enable debug mode
     */
    public function __construct($baseUrl, $email, $password, $debug = false) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->email = $email;
        $this->password = $password;
        $this->debug = $debug;
        $this->token = null;
    }
    
    /**
     * Authenticate with the API and get a JWT token
     * 
     * @return bool True if authentication was successful
     * @throws Exception If authentication fails
     */
    public function authenticate() {
        $endpoint = '/api/v1/auth/login';
        $data = [
            'email' => $this->email,
            'password' => $this->password
        ];
        
        try {
            $response = $this->sendRequest('POST', $endpoint, $data, false);
            if (isset($response['token'])) {
                $this->token = $response['token'];
                $this->log('Successfully authenticated as: ' . $this->email);
                return true;
            } else {
                throw new Exception('Authentication failed: No token received');
            }
        } catch (Exception $e) {
            $this->log('Authentication error: ' . $e->getMessage());
            throw $e;
        }
    }
    
    /**
     * Check if the SDK is authenticated
     * 
     * @return bool True if authenticated
     */
    public function isAuthenticated() {
        return !empty($this->token);
    }
    
    /**
     * Ensure the SDK is authenticated before making a request
     * 
     * @throws Exception If authentication fails
     */
    private function ensureAuthenticated() {
        if (!$this->isAuthenticated()) {
            $this->authenticate();
        }
    }
    
    /**
     * Generate a payment address for receiving cryptocurrency
     * 
     * @param float $amount Expected amount to be paid
     * @param string $currency Cryptocurrency code (e.g., BTC, ETH, USDT)
     * @param string $callbackUrl URL to receive payment status notifications
     * @param array $metadata Additional metadata for the payment
     * @return array Payment address data
     * @throws Exception If the request fails
     */
    public function generatePaymentAddress($amount, $currency, $callbackUrl, $metadata = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/merchant/payment-addresses';
        $data = [
            'expectedAmount' => (string) $amount,
            'currency' => $currency,
            'callbackUrl' => $callbackUrl,
            'metadata' => $metadata
        ];
        
        return $this->sendRequest('POST', $endpoint, $data);
    }
    
    /**
     * Get a payment by ID
     * 
     * @param string $paymentId Payment ID
     * @return array Payment data
     * @throws Exception If the request fails
     */
    public function getPaymentById($paymentId) {
        $this->ensureAuthenticated();
        
        $endpoint = "/api/v1/merchant/payment-addresses/{$paymentId}";
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get all payments with optional filtering
     * 
     * @param array $filters Filters (status, search, dateRange, page, limit, etc.)
     * @return array List of payments
     * @throws Exception If the request fails
     */
    public function getPayments($filters = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/merchant/payment-addresses';
        $queryParams = http_build_query($filters);
        
        if (!empty($queryParams)) {
            $endpoint .= '?' . $queryParams;
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Create a payout
     * 
     * @param string $currency Cryptocurrency code (e.g., BTC, ETH, USDT)
     * @param float $amount Amount to send
     * @param string $address Destination wallet address
     * @param string $network Network to use (e.g., ETH, BSC)
     * @param array $metadata Additional metadata for the payout
     * @return array Payout data
     * @throws Exception If the request fails
     */
    public function createPayout($currency, $amount, $address, $network, $metadata = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/merchant/payouts';
        $data = [
            'currency' => $currency,
            'amount' => (string) $amount,
            'address' => $address,
            'network' => $network
        ];
        
        if (!empty($metadata)) {
            $data['metadata'] = $metadata;
        }
        
        return $this->sendRequest('POST', $endpoint, $data);
    }
    
    /**
     * Get a payout by ID
     * 
     * @param string $payoutId Payout ID
     * @return array Payout data
     * @throws Exception If the request fails
     */
    public function getPayoutById($payoutId) {
        $this->ensureAuthenticated();
        
        $endpoint = "/api/v1/merchant/payouts/{$payoutId}";
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get all payouts with optional filtering
     * 
     * @param array $filters Filters (status, search, dateRange, page, limit, etc.)
     * @return array List of payouts
     * @throws Exception If the request fails
     */
    public function getPayouts($filters = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/merchant/payouts';
        $queryParams = http_build_query($filters);
        
        if (!empty($queryParams)) {
            $endpoint .= '?' . $queryParams;
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get all transactions with optional filtering
     * 
     * @param array $filters Filters (status, type, dateRange, etc.)
     * @return array List of transactions
     * @throws Exception If the request fails
     */
    public function getTransactions($filters = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/transactions';
        $queryParams = http_build_query($filters);
        
        if (!empty($queryParams)) {
            $endpoint .= '?' . $queryParams;
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get transaction by ID
     * 
     * @param string $transactionId Transaction ID
     * @return array Transaction data
     * @throws Exception If the request fails
     */
    public function getTransaction($transactionId) {
        $this->ensureAuthenticated();
        
        $endpoint = "/api/v1/transactions/{$transactionId}";
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get Binance account balances
     * 
     * @param array $assets List of asset codes to filter by
     * @return array Balances data
     * @throws Exception If the request fails
     */
    public function getBinanceBalances($assets = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/binance/balances';
        
        if (!empty($assets)) {
            $endpoint .= '?assets=' . implode(',', $assets);
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get Binance deposit history
     * 
     * @param array $filters Filters (coin, status, startTime, endTime, etc.)
     * @return array Deposit history
     * @throws Exception If the request fails
     */
    public function getBinanceDeposits($filters = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/binance/deposits';
        $queryParams = http_build_query($filters);
        
        if (!empty($queryParams)) {
            $endpoint .= '?' . $queryParams;
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get merchant profile information
     * 
     * @return array Merchant profile data
     * @throws Exception If the request fails
     */
    public function getMerchantProfile() {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/merchant/profile';
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Get Binance withdrawal history
     * 
     * @param array $filters Filters (coin, status, startTime, endTime, etc.)
     * @return array Withdrawal history
     * @throws Exception If the request fails
     */
    public function getBinanceWithdrawals($filters = []) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/binance/withdrawals';
        $queryParams = http_build_query($filters);
        
        if (!empty($queryParams)) {
            $endpoint .= '?' . $queryParams;
        }
        
        return $this->sendRequest('GET', $endpoint);
    }
    
    /**
     * Create a Binance withdrawal
     * 
     * @param string $coin Cryptocurrency code (e.g., BTC, ETH, USDT)
     * @param string $address Destination wallet address
     * @param float $amount Amount to withdraw
     * @param string $network Network to use (optional)
     * @param string $memo Memo/Tag for certain currencies (optional)
     * @return array Withdrawal data
     * @throws Exception If the request fails
     */
    public function createBinanceWithdrawal($coin, $address, $amount, $network = null, $memo = null) {
        $this->ensureAuthenticated();
        
        $endpoint = '/api/v1/binance/withdraw';
        $data = [
            'coin' => $coin,
            'address' => $address,
            'amount' => (string) $amount
        ];
        
        if (!empty($network)) {
            $data['network'] = $network;
        }
        
        if (!empty($memo)) {
            $data['memo'] = $memo;
        }
        
        return $this->sendRequest('POST', $endpoint, $data);
    }
    
    /**
     * Send a request to the API
     * 
     * @param string $method HTTP method (GET, POST, etc.)
     * @param string $endpoint API endpoint
     * @param array $data Request data
     * @param bool $authenticated Whether the request needs authentication
     * @return array Response data
     * @throws Exception If the request fails
     */
    private function sendRequest($method, $endpoint, $data = [], $authenticated = true) {
        $url = $this->baseUrl . $endpoint;
        
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json'
        ];
        
        if ($authenticated && $this->token) {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }
        
        $ch = curl_init();
        
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        } else if ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if (!empty($data)) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            }
        }
        
        if ($this->debug) {
            $this->log("Making {$method} request to {$url}");
            if (!empty($data)) {
                $this->log("Request data: " . json_encode($data, JSON_PRETTY_PRINT));
            }
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if ($this->debug) {
            $this->log("Response code: {$httpCode}");
            $this->log("Response body: {$response}");
        }
        
        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new Exception("cURL Error: {$error}");
        }
        
        curl_close($ch);
        
        $responseData = json_decode($response, true);
        
        if ($httpCode >= 400) {
            $errorMessage = isset($responseData['message']) ? $responseData['message'] : 'Unknown error';
            $errorDetails = isset($responseData['error']) ? $responseData['error'] : '';
            
            throw new Exception("API Error ({$httpCode}): {$errorMessage} {$errorDetails}");
        }
        
        return $responseData;
    }
    
    /**
     * Log a message
     * 
     * @param string $message Message to log
     */
    private function log($message) {
        if ($this->debug) {
            echo "[CryptoPaymentSDK] " . date('Y-m-d H:i:s') . " - {$message}\n";
        }
    }
}
