/**
 * Binance API Integration Module
 * Provides binance.com integration for the payment gateway
 */

// Utility Functions

/**
 * Format crypto amount with appropriate precision
 * @param {string|number} amount - Amount to format
 * @param {string} asset - Crypto asset symbol
 * @returns {string} - Formatted amount
 */
function formatCryptoAmount(amount, asset = '') {
    if (!amount) return '0';
    
    const numAmount = parseFloat(amount);
    
    // Use different precision based on the asset type
    if (['BTC'].includes(asset)) {
        return numAmount.toFixed(8);
    } else if (['ETH', 'BNB'].includes(asset)) {
        return numAmount.toFixed(6);
    } else if (['USDT', 'USDC', 'BUSD', 'DAI'].includes(asset)) {
        return numAmount.toFixed(2);
    } else {
        // Default precision for other tokens
        return numAmount.toFixed(4);
    }
}

/**
 * Format timestamp to readable date/time
 * @param {number} timestamp - Unix timestamp (ms)
 * @returns {string} - Formatted date/time
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString();
}

/**
 * Get a cryptocurrency icon HTML
 * @param {string} currency - Currency code
 * @returns {string} - HTML for the currency icon
 */
function getCurrencyIcon(currency) {
    const lowerCurrency = (currency || '').toLowerCase();
    
    // Common cryptocurrency icons
    const icons = {
        'btc': '<i class="bi bi-currency-bitcoin text-warning"></i>',
        'eth': '<i class="bi bi-ethereum text-primary"></i>',
        'usdt': '<i class="bi bi-cash-coin text-success"></i>',
        'usdc': '<i class="bi bi-cash text-primary"></i>',
        'busd': '<i class="bi bi-cash-stack text-warning"></i>',
        'bnb': '<i class="bi bi-coin text-warning"></i>',
        'xrp': '<i class="bi bi-currency-exchange text-info"></i>',
        'sol': '<i class="bi bi-sun text-primary"></i>',
        'ada': '<i class="bi bi-shield text-danger"></i>',
        'doge': '<i class="bi bi-currency-dollar text-warning"></i>',
        'dot': '<i class="bi bi-record-circle text-danger"></i>',
        'dai': '<i class="bi bi-currency-dollar text-warning"></i>',
    };
    
    return icons[lowerCurrency] || `<i class="bi bi-coin text-secondary"></i>`;
}

/**
 * Get transaction status text based on status code
 * @param {Object} tx - Transaction object with status property
 * @returns {string} - Status text
 */
function getTransactionStatus(tx) {
    // For deposits
    if (tx.type === 'deposit' || (tx.status !== undefined && (tx.txId || tx.insertTime))) {
        // Binance deposit status codes
        const depositStatuses = {
            0: 'Pending',
            1: 'Success',
            2: 'Processing',
            3: 'Failed',
            4: 'Refunded',
        };
        return depositStatuses[tx.status] || 'Unknown';
    }
    
    // For withdrawals
    if (tx.type === 'withdrawal' || (tx.status !== undefined && tx.applyTime)) {
        // Binance withdrawal status codes
        const withdrawalStatuses = {
            0: 'Email Sent',
            1: 'Cancelled',
            2: 'Awaiting Approval',
            3: 'Rejected',
            4: 'Processing',
            5: 'Failed',
            6: 'Completed',
        };
        return withdrawalStatuses[tx.status] || 'Unknown';
    }
    
    // For payment requests
    if (tx.status && typeof tx.status === 'string') {
        return tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
    }
    
    // Default fallback
    return 'Unknown';
}

/**
 * Get status class for badges based on status text
 * @param {string} status - Status text
 * @returns {string} - Bootstrap class name
 */
function getStatusClass(status) {
    const statusLower = status.toLowerCase();
    
    if (['success', 'completed', 'confirmed'].includes(statusLower)) {
        return 'bg-success';
    } else if (['pending', 'processing', 'awaiting approval', 'email sent'].includes(statusLower)) {
        return 'bg-warning';
    } else if (['cancelled', 'rejected', 'failed', 'error', 'refunded'].includes(statusLower)) {
        return 'bg-danger';
    } else {
        return 'bg-info';
    }
}

// Binance API class
class BinanceAPI {
    constructor() {
        this.paymentApi = new PaymentAPI();
        this.apiBaseUrl = '/api/binance';
        this.loadApiKeys();
    }
    
    /**
     * Load API keys from local storage
     */
    loadApiKeys() {
        this.apiKey = localStorage.getItem('binance_api_key');
        this.apiSecret = localStorage.getItem('binance_api_secret');
        this.isConfigured = !!(this.apiKey && this.apiSecret);
    }
    
    /**
     * Save API keys to local storage
     * @param {string} apiKey - Binance API key
     * @param {string} apiSecret - Binance API secret
     * @returns {boolean} - Success flag
     */
    saveApiKeys(apiKey, apiSecret) {
        if (!apiKey || !apiSecret) return false;
        
        localStorage.setItem('binance_api_key', apiKey);
        localStorage.setItem('binance_api_secret', apiSecret);
        
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.isConfigured = true;
        
        return true;
    }
    
    /**
     * Test connection to Binance API
     * @returns {Promise<boolean>} - True if connection successful
     */
    async testConnection() {
        if (!this.isConfigured) return false;
        
        try {
            const result = await this.paymentApi.request(`${this.apiBaseUrl}/ping`, {
                headers: {
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                }
            });
            
            return result && result.success === true;
        } catch (error) {
            console.error('Binance connection test failed:', error);
            return false;
        }
    }
    
    /**
     * Get account balances
     * @returns {Promise<Array>} - Array of balance objects
     */
    async getBalances() {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/account/balances`, {
                headers: {
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                }
            });
            
            return data.balances || [];
        } catch (error) {
            console.error('Error fetching balances:', error);
            throw error;
        }
    }
    
    /**
     * Get deposit history
     * @param {Object} options - Filter options
     * @returns {Promise<Array>} - Array of deposit objects
     */
    async getDeposits(options = {}) {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/deposits`, {
                headers: {
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                }
            });
            
            return data.deposits || [];
        } catch (error) {
            console.error('Error fetching deposits:', error);
            throw error;
        }
    }
    
    /**
     * Get withdrawal history
     * @param {Object} options - Filter options
     * @returns {Promise<Array>} - Array of withdrawal objects
     */
    async getWithdrawals(options = {}) {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/withdrawals`, {
                headers: {
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                }
            });
            
            return data.withdrawals || [];
        } catch (error) {
            console.error('Error fetching withdrawals:', error);
            throw error;
        }
    }
    
    /**
     * Create a withdrawal
     * @param {Object} withdrawalData - Withdrawal details
     * @returns {Promise<Object>} - Created withdrawal object
     */
    async createWithdrawal(withdrawalData) {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/withdrawals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                },
                body: JSON.stringify(withdrawalData)
            });
            
            return data.withdrawal || null;
        } catch (error) {
            console.error('Error creating withdrawal:', error);
            throw error;
        }
    }
    
    /**
     * Get payment requests
     * @returns {Promise<Array>} - Array of payment request objects
     */
    async getPaymentRequests() {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/payment-requests`, {
                headers: {
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                }
            });
            
            return data.paymentRequests || [];
        } catch (error) {
            console.error('Error fetching payment requests:', error);
            throw error;
        }
    }
    
    /**
     * Create a payment request
     * @param {Object} paymentData - Payment request details
     * @returns {Promise<Object>} - Created payment request object
     */
    async createPaymentRequest(paymentData) {
        try {
            const data = await this.paymentApi.request(`${this.apiBaseUrl}/payment-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-binance-api-key': this.apiKey,
                    'x-binance-api-secret': this.apiSecret
                },
                body: JSON.stringify(paymentData)
            });
            
            return data.paymentRequest || null;
        } catch (error) {
            console.error('Error creating payment request:', error);
            throw error;
        }
    }
}
