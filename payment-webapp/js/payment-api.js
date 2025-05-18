/**
 * Crypto Payment Gateway - Payment API Integration
 * 
 * This file handles the communication between the payment webapp and the backend API
 * Enhanced with multi-currency support, real-time exchange rates, and mobile features
 */

class PaymentAPI {
    constructor(apiBaseUrl, apiKey) {
        // Set the API base URL based on current location
        // For local testing, use http://localhost:3000/api/v1
        // For production, use the current domain with /api/v1
        this.apiBaseUrl = apiBaseUrl || (window.location.hostname === 'localhost' ? 
            'http://localhost:3000/api/v1' : 
            window.location.origin + '/api/v1');
        this.apiKey = apiKey;
        
        // Set up default headers with content type and API key if provided
        this.headers = {
            'Content-Type': 'application/json'
        };
        
        // Only add API key header if one was provided
        if (this.apiKey) {
            this.headers['X-API-Key'] = this.apiKey;
        }
        
        this.supportedCurrencies = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD', 'XRP', 'ADA', 'SOL', 'DOT'];
        this.supportedNetworks = {
            'USDT': ['BEP20', 'ERC20', 'TRC20'],
            'BTC': ['Bitcoin'],
            'ETH': ['Ethereum'],
            'BNB': ['BEP20'],
            'BUSD': ['BEP20'],
            'XRP': ['Ripple'],
            'ADA': ['Cardano'],
            'SOL': ['Solana'],
            'DOT': ['Polkadot']
        };
        
        this.preferredCurrency = localStorage.getItem('preferredCurrency') || 'USDT';
        this.preferredNetwork = localStorage.getItem('preferredNetwork') || 'BEP20';
        this.isDarkMode = localStorage.getItem('darkMode') === 'true' || false;
        this.notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true' || true;
        this.lastExchangeRatesUpdate = null;
        this.exchangeRatesCache = null;
        this.transactionHistory = JSON.parse(localStorage.getItem('transactionHistory')) || [];
        this.favoriteAddresses = JSON.parse(localStorage.getItem('favoriteAddresses')) || [];
        
        // Define API endpoints for various resources
        this.endpoints = {
            auth: '/auth',
            addresses: '/merchant/payment-addresses', // Updated to include merchant prefix
            payments: '/payments', // Updated to include merchant prefix
            payouts: '/payouts', // Updated to include merchant prefix
            transactions: '/transactions',
            webhooks: '/webhooks',
            apiKeys: '/api-keys',
            settings: '/settings',
            exchangeRates: '/exchange-rates'
        };
        
        // Initialize the authentication token from localStorage
        this.updateAuthToken();
    }
    
    /**
     * Update the authentication token from localStorage
     */
    updateAuthToken() {
        const token = localStorage.getItem('jwt_token');
        if (token) {
            this.authToken = token;
        } else {
            this.authToken = null;
        }
    }
    
    /**
     * Make an API request with proper authentication
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Data to send in the request body (for POST/PUT requests)
     * @returns {Promise<Object>} Response from the API
     */
    async apiRequest(method, endpoint, data = null) {
        const url = this.apiBaseUrl + endpoint;
        
        // Update auth token before making request
        this.updateAuthToken();
        
        const headers = { ...this.headers };
        
        // Add JWT auth token if available
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        const options = {
            method,
            headers
        };
        
        // Add body for POST/PUT requests
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            
            // Log the request for debugging
            console.log(`API ${method} ${endpoint}: ${response.status}`);
            
            // Parse response
            const contentType = response.headers.get('Content-Type');
            let responseData;
            
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                responseData = await response.text();
            }
            
            // Check for error status codes
            if (!response.ok) {
                console.error(`API Request Error [${method} ${endpoint}]:`, responseData);
                
                // Create a custom error with detailed information from the API response
                const errorMessage = responseData.error && responseData.error.message
                    ? responseData.error.message
                    : `API request failed with status ${response.status}`;
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.responseData = responseData;
                error.details = responseData.error?.details || '';
                throw error;
            }
            
            return {
                status: response.status,
                data: responseData
            };
        } catch (error) {
            console.error(`API Request Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    }
    
    /**
     * Get all webhooks
     * @returns {Promise<Array>} List of webhooks
     */
    async getWebhooks() {
        try {
            const response = await this.apiRequest('GET', this.endpoints.webhooks);
            // Make sure we always return an array
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching webhooks:', error);
            throw error;
        }
    }
    
    // Mock methods removed as per requirement
    
    /**
     * Create a webhook
     * @param {Object} webhookData - Data for the webhook to create
     * @returns {Promise<Object>} Created webhook
     */
    async createWebhook(webhookData) {
        try {
            // Validate webhook data
            if (!webhookData.url) {
                throw new Error('Webhook URL is required');
            }
            
            if (!webhookData.events || webhookData.events.length === 0) {
                throw new Error('At least one event must be specified');
            }
            
            // Ensure URL is well-formed
            try {
                new URL(webhookData.url);
            } catch (e) {
                throw new Error('Invalid webhook URL format');
            }
            
            const response = await this.apiRequest('POST', this.endpoints.webhooks, webhookData);
            console.info('Webhook created successfully:', webhookData.url);
            return response.data;
        } catch (error) {
            console.error('Error creating webhook:', error);
            // Enhance error message with more details if possible
            if (error.response && error.response.data && error.response.data.message) {
                throw new Error(`API error: ${error.response.data.message}`);
            }
            throw error;
        }
    }
    
    /**
     * Get a webhook by ID
     * @param {string} webhookId - ID of the webhook to get
     * @returns {Promise<Object>} Webhook details
     */
    async getWebhookById(webhookId) {
        try {
            const response = await this.apiRequest('GET', `${this.endpoints.webhooks}/${webhookId}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching webhook ${webhookId}:`, error);
            throw error;
        }
    }
    
    /**
     * Update a webhook
     * @param {string} webhookId - ID of the webhook to update
     * @param {Object} webhookData - New webhook data
     * @returns {Promise<Object>} Updated webhook
     */
    async updateWebhook(webhookId, webhookData) {
        try {
            const response = await this.apiRequest('PUT', `${this.endpoints.webhooks}/${webhookId}`, webhookData);
            return response.data;
        } catch (error) {
            console.error(`Error updating webhook ${webhookId}:`, error);
            throw error;
        }
    }
    
    /**
     * Delete a webhook
     * @param {string} webhookId - ID of the webhook to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteWebhook(webhookId) {
        try {
            if (!webhookId) {
                throw new Error('Webhook ID is required');
            }
            await this.apiRequest('DELETE', `${this.endpoints.webhooks}/${webhookId}`);
            return true;
        } catch (error) {
            console.error('Error deleting webhook:', error);
            throw error;
        }
    }
    
    /**
     * Get all API keys
     * @returns {Promise<Array>} List of API keys
     */
    async getApiKeys() {
        try {
            const response = await this.apiRequest('GET', this.endpoints.apiKeys);
            return response.data.data || [];
        } catch (error) {
            console.error('Error fetching API keys:', error);
            throw error;
        }
    }
    
    /**
     * Create a new API key
     * @param {Object} apiKeyData - Data for the API key to create
     * @param {string} apiKeyData.description - Description or name for the API key
     * @param {boolean} apiKeyData.readOnly - Whether the API key is read-only
     * @param {string} apiKeyData.ipRestrictions - Optional IP restrictions (comma-separated)
     * @param {Object} apiKeyData.permissions - Permissions for the API key
     * @returns {Promise<Object>} Created API key with sensitive data
     */
    async createApiKey(apiKeyData) {
        try {
            const response = await this.apiRequest('POST', this.endpoints.apiKeys, apiKeyData);
            return response.data.data;
        } catch (error) {
            console.error('Error creating API key:', error);
            throw error;
        }
    }
    
    /**
     * Delete (revoke) an API key
     * @param {string} apiKeyId - ID of the API key to revoke
     * @returns {Promise<Object>} Response data
     */
    async deleteApiKey(apiKeyId) {
        try {
            if (!apiKeyId) {
                throw new Error('API key ID is required');
            }
            const response = await this.apiRequest('DELETE', `${this.endpoints.apiKeys}/${apiKeyId}`);
            return response.data;
        } catch (error) {
            console.error('Error revoking API key:', error);
            throw error;
        }
    }
    
    /**
     * Update an API key
     * @param {string} apiKeyId - ID of the API key to update
     * @param {Object} updateData - New data for the API key
     * @returns {Promise<Object>} Updated API key
     */
    async updateApiKey(apiKeyId, updateData) {
        try {
            if (!apiKeyId) {
                throw new Error('API key ID is required');
            }
            const response = await this.apiRequest('PUT', `${this.endpoints.apiKeys}/${apiKeyId}`, updateData);
            return response.data.data;
        } catch (error) {
            console.error('Error updating API key:', error);
            throw error;
        }
    }
    

    
    /**
     * Get all payments
     * @param {Object} filters - Optional filters for payments
     * @returns {Promise<Array>} List of payments
     */
    async getPayments(filters = {}) {
        try {
            // Build query string from filters
            const queryParams = new URLSearchParams();
            
            for (const [key, value] of Object.entries(filters)) {
                if (value !== undefined && value !== null) {
                    queryParams.append(key, value);
                }
            }
            
            const queryString = queryParams.toString();
            const endpoint = this.endpoints.payments + (queryString ? `?${queryString}` : '');
            
            const response = await this.apiRequest('GET', endpoint);
            // Make sure we always return an array
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching payments:', error);
            throw error;
        }
    }
    
    // Mock methods removed as per requirement
    
    /**
     * Get all payouts
     * @param {Object} filters - Optional filters for payouts
     * @returns {Promise<Array>} List of payouts
     */
    async getPayouts(filters = {}) {
        try {
            // Build query string from filters
            const queryParams = new URLSearchParams();
            
            for (const [key, value] of Object.entries(filters)) {
                if (value !== undefined && value !== null) {
                    queryParams.append(key, value);
                }
            }
            
            const queryString = queryParams.toString();
            const endpoint = this.endpoints.payouts + (queryString ? `?${queryString}` : '');
            
            const response = await this.apiRequest('GET', endpoint);
            // Make sure we always return an array
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching payouts:', error);
            throw error;
        }
    }
    
    /**
     * Get a payout by ID
     * @param {string} payoutId - ID of the payout to retrieve
     * @returns {Promise<Object>} Payout details
     */
    async getPayoutById(payoutId) {
        try {
            if (!payoutId) {
                throw new Error('Payout ID is required');
            }
            
            const response = await this.apiRequest('GET', `${this.endpoints.payouts}/${payoutId}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching payout ${payoutId}:`, error);
            throw error;
        }
    }
    
    /**
     * Create a new payout
     * @param {Object} payoutData - Data for the payout to create
     * @param {number} payoutData.amount - Amount to send
     * @param {string} payoutData.currency - Cryptocurrency for payout (e.g., 'BTC', 'ETH', 'USDT')
     * @param {string} payoutData.network - Network for the transaction (e.g., 'BEP20', 'ERC20')
     * @param {string} payoutData.recipientAddress - Blockchain address to send funds to
     * @param {string} payoutData.webhookUrl - URL to notify when payout status changes
     * @param {string} payoutData.callbackUrl - URL to redirect after payout completion
     * @param {Object} payoutData.metadata - Additional metadata about the payout
     * @returns {Promise<Object>} Created payout details
     */
    async createPayout(payoutData) {
        try {
            console.log(payoutData)
            // Validate required fields
            if (!payoutData.amount || isNaN(payoutData.amount)) {
                throw new Error('Amount must be a valid number');
            }
            
            if (!payoutData.currency) {
                throw new Error('Currency is required');
            }
            
            if (!payoutData.network) {
                throw new Error('Network is required');
            }
            
            if (!payoutData.recipientAddress) {
                throw new Error('Recipient address is required');
            }
            
            // Prepare the data for the API
            const requestData = {
                amount: payoutData.amount,
                currency: payoutData.currency,
                network: payoutData.network,
                recipientAddress: payoutData.recipientAddress,
                webhookUrl: payoutData.webhookUrl || '',
                callbackUrl: payoutData.callbackUrl || '',
                metadata: payoutData.metadata || {}
            };
            
            // Create the payout
            const response = await this.apiRequest('POST', this.endpoints.payouts, requestData);
            console.info('Payout created successfully');
            return response.data;
        } catch (error) {
            console.error('Error creating payout:', error);
            // Extract more detailed error message if available
            if (error.response && error.response.data && error.response.data.message) {
                throw new Error(`API error: ${error.response.data.message}`);
            }
            throw error;
        }
    }
    
    // Mock methods removed as per requirement
    
    // Mock methods removed as per requirement
    
    /**
     * Create an API key
     * @param {Object} apiKeyData - Data for the API key to create
     * @returns {Promise<Object>} Created API key with key and secret values
     */
    async createApiKey(apiKeyData) {
        try {
            // Ensure we have all required fields
            if (!apiKeyData.description) {
                throw new Error('API key description is required');
            }
            
            // Check permissions - backend expects an object with permission names as keys
            if (!apiKeyData.permissions || Object.keys(apiKeyData.permissions).length === 0) {
                throw new Error('At least one permission must be specified');
            }
            
            const response = await this.apiRequest('POST', this.endpoints.apiKeys, apiKeyData);
            
            // Log success but not the actual key (for security)
            console.info('API key created successfully:', apiKeyData.description);
            
            return response.data;
        } catch (error) {
            console.error('Error creating API key:', error);
            // Enhance error message with more details if possible
            if (error.response && error.response.data && error.response.data.message) {
                throw new Error(`API error: ${error.response.data.message}`);
            }
            throw error;
        }
    }
    
    /**
     * Delete an API key
     * @param {string} keyId - API key ID to delete
     * @returns {Promise<void>}
     */
    async deleteApiKey(keyId) {
        try {
            if (!keyId) {
                throw new Error('API key ID is required');
            }
            
            await this.apiRequest('DELETE', `${this.endpoints.apiKeys}/${keyId}`);
            console.info('API key deleted successfully');
            return true;
        } catch (error) {
            console.error('Error deleting API key:', error);
            // Enhance error message with more details if possible
            if (error.response && error.response.data && error.response.data.message) {
                throw new Error(`API error: ${error.response.data.message}`);
            }
            throw error;
        }
    }
    
    /**
     * Get an API key by ID
     * @param {string} keyId - API key ID
     * @returns {Promise<Object>} API key details
     */
    async getApiKeyById(keyId) {
        try {
            const response = await this.apiRequest('GET', `${this.endpoints.apiKeys}/${keyId}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching API key ${keyId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get all payment addresses
     * @returns {Promise<Array>} List of payment addresses
     */
    async getAddresses() {
        try {
            const response = await this.apiRequest('GET', this.endpoints.addresses);
            // Make sure we always return an array
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching addresses:', error);
            throw error;
        }
    }
    
    /**
     * Get all payments with optional filtering
     * @param {string} filter - Filter payments by status (all, pending, completed, failed)
     * @param {string} search - Search term to filter payments 
     * @param {string} dateRange - Date range to filter payments (1d, 7d, 30d, 90d, custom)
     * @returns {Promise<Array>} List of payments
     */
    async getPayments(filter = 'all', search = '', dateRange = '7d') {
        try {
            // Build query parameters
            const queryParams = [];
            
            if (filter && filter !== 'all') {
                queryParams.push(`status=${encodeURIComponent(filter)}`);
            }
            
            if (search) {
                queryParams.push(`search=${encodeURIComponent(search)}`);
            }
            
            if (dateRange) {
                queryParams.push(`dateRange=${encodeURIComponent(dateRange)}`);
            }
            
            // Construct the endpoint with query parameters
            const endpoint = queryParams.length > 0 
                ? `${this.endpoints.payments}?${queryParams.join('&')}` 
                : this.endpoints.payments;
            
            const response = await this.apiRequest('GET', endpoint);
            
            // Make sure we always return an array
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('Error fetching payments:', error);
            throw error;
        }
    }
    
    /**
     * Get a payment by ID
     * @param {string} paymentId - ID of the payment to retrieve
     * @returns {Promise<Object>} Payment details
     */
    async getPaymentById(paymentId) {
        try {
            if (!paymentId) {
                throw new Error('Payment ID is required');
            }
            
            const response = await this.apiRequest('GET', `${this.endpoints.payments}/${paymentId}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching payment ${paymentId}:`, error);
            throw error;
        }
    }
    
    /**
     * Generate a new payment address for receiving cryptocurrency payments
     * @param {Object} paymentData - Data for the payment to create
     * @param {string} paymentData.currency - Cryptocurrency for payment (e.g., 'BTC', 'ETH', 'USDT')
     * @param {number} paymentData.expectedAmount - Expected amount in cryptocurrency
     * @param {string} paymentData.fiatCurrency - Fiat currency reference (e.g., 'USD', 'EUR')
     * @param {number} paymentData.fiatAmount - Amount in fiat currency (for reference)
     * @param {string} paymentData.reference - Reference or order ID
     * @param {Object} paymentData.metadata - Additional metadata about the payment
     * @param {string} paymentData.callbackUrl - URL to notify when payment status changes
     * @returns {Promise<Object>} Created payment address details
     */
    async generatePaymentAddress(paymentData) {
        try {
            // Validate required fields
            if (!paymentData.currency) {
                throw new Error('Cryptocurrency currency is required');
            }
            
            if (!paymentData.expectedAmount || isNaN(paymentData.expectedAmount)) {
                throw new Error('Expected amount must be a valid number');
            }
            
            if (!paymentData.metadata.reference) {
                throw new Error('Reference is required');
            }
            
            // Prepare the data for the API
            const requestData = {
                currency: paymentData.currency,
                expectedAmount: paymentData.expectedAmount,
                reference: paymentData.metadata.reference,
                metadata: paymentData.metadata || {},
                callbackUrl: paymentData.callbackUrl || ''
            };
            
            // Store fiat currency info in metadata if provided
            if (paymentData.fiatCurrency && paymentData.fiatAmount) {
                requestData.metadata.fiatCurrency = paymentData.fiatCurrency;
                requestData.metadata.fiatAmount = paymentData.fiatAmount;
            }
            
            // Create the payment address
            const response = await this.apiRequest('POST', this.endpoints.addresses, requestData);
            console.info('Payment address generated successfully');
            return response.data;
        } catch (error) {
            console.error('Error generating payment address:', error);
            // Extract more detailed error message if available
            if (error.response && error.response.data && error.response.data.message) {
                throw new Error(`API error: ${error.response.data.message}`);
            }
            throw error;
        }
    }
    
    /**
     * Get the exchange rates for supported currencies
     * @param {string} baseCurrency - Base currency to get rates for (e.g., 'USD')
     * @returns {Promise<Object>} Exchange rates
     */
    async getExchangeRates(baseCurrency = 'USD') {
        try {
            // Check if we have cached rates that are less than 5 minutes old
            const now = new Date();
            if (this.exchangeRatesCache && this.lastExchangeRatesUpdate && 
                (now.getTime() - this.lastExchangeRatesUpdate.getTime() < 5 * 60 * 1000)) {
                return this.exchangeRatesCache;
            }
            
            const response = await this.apiRequest('GET', `${this.endpoints.exchangeRates}?base=${baseCurrency}`);
            
            // Cache the rates
            this.exchangeRatesCache = response.data;
            this.lastExchangeRatesUpdate = now;
            
            return response.data;
        } catch (error) {
            console.error('Error fetching exchange rates:', error);
            
            // Return cached data if available
            if (this.exchangeRatesCache) {
                return this.exchangeRatesCache;
            }
            
            throw error;
        }
    }
    
}

/**
 * Payment UI Controller
 * Handles the UI interactions and state management for the payment process
 */
class PaymentUI {
    constructor(paymentApi, merchantReturnUrl) {
        this.paymentApi = paymentApi;
        this.merchantReturnUrl = merchantReturnUrl;
        this.paymentData = null;
        this.countdownInterval = null;
        this.statusCheckInterval = null;
        this.notificationSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-notification-951.mp3');
        this.notificationPermissionGranted = false;
        
        // Check if we can use browser notifications
        this.checkNotificationPermission();
        
        // Apply theme based on saved preference
        this.applyTheme();
    }
    
    // Initialize the payment UI
    // @param {Object} paymentData - Payment data from the server
    initialize(paymentData) {
        this.paymentData = paymentData;
        // Additional implementation for UI initialization
    }
    
    // Apply theme based on saved preference
    applyTheme() {
        if (this.paymentApi.isDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    // Check if we can use browser notifications
    checkNotificationPermission() {
        if (this.paymentApi.notificationsEnabled && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                this.notificationPermissionGranted = true;
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    this.notificationPermissionGranted = permission === 'granted';
                });
            }
        }
    }
}

// Export classes for use in other files
window.PaymentAPI = PaymentAPI;
window.PaymentUI = PaymentUI;
