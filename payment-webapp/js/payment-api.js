/**
 * Crypto Payment Gateway - Payment API Integration
 * 
 * This file handles the communication between the payment webapp and the backend API
 * Enhanced with multi-currency support, real-time exchange rates, and mobile features
 */

class PaymentAPI {
    constructor(apiBaseUrl, apiKey) {
        this.apiBaseUrl = apiBaseUrl || 'http://localhost:3000/api/v1';
        this.apiKey = apiKey;
        this.headers = {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
        };
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
    }

    /**
     * Generate a new payment address
     * @param {Object} paymentData - Payment data object
     * @param {string} paymentData.reference - Order reference ID
     * @param {string} paymentData.amount - Payment amount
     * @param {string} paymentData.currency - Currency code (e.g., 'USDT')
     * @param {string} paymentData.callbackUrl - Webhook callback URL
     * @returns {Promise<Object>} - Payment address data
     */
    async generatePaymentAddress(paymentData) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/addresses`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(paymentData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate payment address');
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('Error generating payment address:', error);
            throw error;
        }
    }

    /**
     * Check payment status
     * @param {string} reference - Order reference ID
     * @returns {Promise<Object>} - Payment status data
     */
    async checkPaymentStatus(reference) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/payments/${reference}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to check payment status');
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('Error checking payment status:', error);
            throw error;
        }
    }

    /**
     * Generate QR code for payment address
     * @param {string} address - Cryptocurrency address
     * @param {string} amount - Payment amount
     * @param {string} currency - Currency code
     * @param {string} network - Network (e.g., 'BEP20', 'ERC20')
     * @returns {string} - QR code data URL
     */
    generateQRCode(address, amount, currency, network = 'BEP20') {
        // Create appropriate URI scheme based on currency and network
        let qrData;
        
        switch(currency) {
            case 'BTC':
                qrData = `bitcoin:${address}?amount=${amount}`;
                break;
            case 'ETH':
                qrData = `ethereum:${address}?value=${amount}`;
                break;
            default:
                // For other tokens, include currency and network info
                qrData = `${address}?amount=${amount}&currency=${currency}&network=${network}`;
        }
        
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
    }
    
    /**
     * Initialize QR code scanner
     * @returns {Promise<Object>} - Scanner instance
     */
    async initQRScanner() {
        try {
            // Check if HTML5 QR scanner library is loaded
            if (!window.Html5Qrcode) {
                throw new Error('QR scanner library not loaded');
            }
            
            const scanner = new Html5Qrcode('qr-scanner');
            return scanner;
        } catch (error) {
            console.error('Error initializing QR scanner:', error);
            throw error;
        }
    }
    
    /**
     * Start QR code scanner
     * @param {Object} scanner - Scanner instance
     * @param {Function} onSuccess - Success callback
     * @returns {Promise<void>}
     */
    async startQRScanner(scanner, onSuccess) {
        try {
            const config = { fps: 10, qrbox: 250 };
            await scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    // Stop scanner after successful scan
                    scanner.stop();
                    
                    // Parse the QR code data
                    let address, amount, currency, network;
                    
                    if (decodedText.startsWith('bitcoin:')) {
                        // Bitcoin URI
                        const btcUri = new URL(decodedText);
                        address = btcUri.pathname.replace('//', '');
                        amount = btcUri.searchParams.get('amount') || '';
                        currency = 'BTC';
                        network = 'Bitcoin';
                    } else if (decodedText.startsWith('ethereum:')) {
                        // Ethereum URI
                        const ethUri = new URL(decodedText);
                        address = ethUri.pathname.replace('//', '');
                        amount = ethUri.searchParams.get('value') || '';
                        currency = 'ETH';
                        network = 'Ethereum';
                    } else if (decodedText.includes('?')) {
                        // Generic URI with parameters
                        const uri = new URL(`https://example.com/${decodedText}`);
                        address = decodedText.split('?')[0];
                        amount = uri.searchParams.get('amount') || '';
                        currency = uri.searchParams.get('currency') || this.preferredCurrency;
                        network = uri.searchParams.get('network') || this.preferredNetwork;
                    } else {
                        // Just an address
                        address = decodedText;
                        amount = '';
                        currency = this.preferredCurrency;
                        network = this.preferredNetwork;
                    }
                    
                    onSuccess({ address, amount, currency, network });
                },
                (errorMessage) => {
                    console.log(errorMessage);
                }
            );
        } catch (error) {
            console.error('Error starting QR scanner:', error);
            throw error;
        }
    }
    
    /**
     * Stop QR code scanner
     * @param {Object} scanner - Scanner instance
     * @returns {Promise<void>}
     */
    async stopQRScanner(scanner) {
        try {
            if (scanner) {
                await scanner.stop();
            }
        } catch (error) {
            console.error('Error stopping QR scanner:', error);
        }
    }

    /**
     * Format blockchain transaction hash for display
     * @param {string} hash - Transaction hash
     * @returns {string} - Formatted hash (truncated)
     */
    formatTransactionHash(hash) {
        if (!hash) return '';
        return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
    }

    /**
     * Get transaction explorer URL
     * @param {string} hash - Transaction hash
     * @returns {string} - Block explorer URL
     */
    getTransactionExplorerUrl(hash) {
        return `https://bscscan.com/tx/${hash}`;
    }

    /**
     * Format date for display
     * @param {string} isoDate - ISO date string
     * @returns {string} - Formatted date
     */
    formatDate(isoDate) {
        return new Date(isoDate).toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        });
    }

    /**
     * Get supported currencies
     * @returns {Array<string>} - List of supported currencies
     */
    getSupportedCurrencies() {
        return this.supportedCurrencies;
    }
    
    /**
     * Get supported networks for a currency
     * @param {string} currency - Currency code
     * @returns {Array<string>} - List of supported networks
     */
    getSupportedNetworks(currency) {
        return this.supportedNetworks[currency] || [];
    }

    /**
     * Set preferred currency
     * @param {string} currency - Currency code
     * @returns {boolean} - Success status
     */
    setPreferredCurrency(currency) {
        if (this.supportedCurrencies.includes(currency)) {
            this.preferredCurrency = currency;
            localStorage.setItem('preferredCurrency', currency);
            
            // Set default network for this currency if current network is not supported
            const networks = this.getSupportedNetworks(currency);
            if (networks.length > 0 && !networks.includes(this.preferredNetwork)) {
                this.setPreferredNetwork(networks[0]);
            }
            
            return true;
        }
        return false;
    }

    /**
     * Get preferred currency
     * @returns {string} - Preferred currency code
     */
    getPreferredCurrency() {
        return this.preferredCurrency;
    }
    
    /**
     * Set preferred network
     * @param {string} network - Network code
     * @returns {boolean} - Success status
     */
    setPreferredNetwork(network) {
        const networks = this.getSupportedNetworks(this.preferredCurrency);
        if (networks.includes(network)) {
            this.preferredNetwork = network;
            localStorage.setItem('preferredNetwork', network);
            return true;
        }
        return false;
    }
    
    /**
     * Get preferred network
     * @returns {string} - Preferred network code
     */
    getPreferredNetwork() {
        return this.preferredNetwork;
    }
    
    /**
     * Format currency amount with symbol
     * @param {string|number} amount - Amount to format
     * @param {string} currency - Currency code
     * @returns {string} - Formatted amount with symbol
     */
    formatCurrencyAmount(amount, currency) {
        const symbols = {
            'USDT': '₮',
            'BTC': '₿',
            'ETH': 'Ξ',
            'BNB': 'BNB',
            'BUSD': 'BUSD',
            'XRP': 'XRP',
            'ADA': 'ADA',
            'SOL': 'SOL',
            'DOT': 'DOT'
        };
        
        const symbol = symbols[currency] || currency;
        
        // Format based on currency
        if (currency === 'BTC') {
            // Show more decimal places for BTC
            return `${parseFloat(amount).toFixed(8)} ${symbol}`;
        } else {
            return `${parseFloat(amount).toFixed(2)} ${symbol}`;
        }
    }

    /**
     * Get exchange rates for a base currency
     * @param {string} baseCurrency - Base currency code
     * @param {boolean} forceRefresh - Force refresh the rates from API
     * @returns {Promise<Object>} - Exchange rates data
     */
    async getExchangeRates(baseCurrency = 'USDT', forceRefresh = false) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/exchange-rates?base=${baseCurrency}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch exchange rates');
            }

            const data = await response.json();
            // Update cache
            this.exchangeRatesCache = data.data;
            this.lastExchangeRatesUpdate = new Date();
            return data.data;
        } catch (error) {
            console.error('Error fetching exchange rates:', error);
            // Return some fallback rates to prevent UI breaking
            return {
                base: baseCurrency,
                rates: {
                    USDT: 1,
                    BTC: 0.000033,
                    ETH: 0.00042,
                    BNB: 0.0033,
                    BUSD: 1
                },
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Get cached exchange rates or fetch new ones if cache is expired
     * @param {string} baseCurrency - Base currency code
     * @returns {Promise<Object>} - Exchange rates data
     */
    async getCachedExchangeRates(baseCurrency = 'USDT') {
        // Check if we have cached rates and they're not expired (less than 5 minutes old)
        const now = new Date();
        if (this.exchangeRatesCache && this.lastExchangeRatesUpdate && 
            (now.getTime() - this.lastExchangeRatesUpdate.getTime() < 5 * 60 * 1000) &&
            this.exchangeRatesCache.base === baseCurrency) {
            return this.exchangeRatesCache;
        }
        
        // Fetch fresh rates
        return await this.getExchangeRates(baseCurrency, true);
    }
    
    /**
     * Get transaction history
     * @param {Object} options - Filter options
     * @param {number} options.limit - Maximum number of transactions to return
     * @param {string} options.status - Filter by status
     * @param {string} options.currency - Filter by currency
     * @returns {Promise<Object>} - Transaction history data
     */
    async getTransactionHistory(options = {}) {
        try {
            // In a real implementation, this would fetch from the API
            // For demo, we'll use the cached history with filters
            let transactions = [...this.transactionHistory];
            
            // Apply filters
            if (options.status) {
                transactions = transactions.filter(tx => tx.status === options.status);
            }
            
            if (options.currency) {
                transactions = transactions.filter(tx => tx.currency === options.currency);
            }
            
            // Sort by date (newest first)
            transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Apply limit
            if (options.limit && options.limit > 0) {
                transactions = transactions.slice(0, options.limit);
            }
            
            return {
                transactions,
                total: this.transactionHistory.length,
                filtered: transactions.length
            };
        } catch (error) {
            console.error('Error fetching transaction history:', error);
            throw error;
        }
    }
    
    /**
     * Add transaction to history
     * @param {Object} transaction - Transaction data
     */
    addTransactionToHistory(transaction) {
        // Add transaction to history if it doesn't exist
        const exists = this.transactionHistory.some(tx => tx.reference === transaction.reference);
        if (!exists) {
            this.transactionHistory.push(transaction);
            // Keep only the last 50 transactions
            if (this.transactionHistory.length > 50) {
                this.transactionHistory = this.transactionHistory.slice(-50);
            }
            localStorage.setItem('transactionHistory', JSON.stringify(this.transactionHistory));
        }
    }
    
    /**
     * Clear transaction history
     */
    clearTransactionHistory() {
        this.transactionHistory = [];
        localStorage.removeItem('transactionHistory');
    }
    
    /**
     * Add address to favorites
     * @param {Object} addressData - Address data
     * @param {string} addressData.address - Cryptocurrency address
     * @param {string} addressData.label - Address label
     * @param {string} addressData.currency - Currency code
     * @param {string} addressData.network - Network code
     * @returns {boolean} - Success status
     */
    addFavoriteAddress(addressData) {
        if (!addressData.address) return false;
        
        // Check if address already exists
        const exists = this.favoriteAddresses.some(a => a.address === addressData.address);
        if (!exists) {
            this.favoriteAddresses.push({
                ...addressData,
                id: Date.now().toString(),
                addedAt: new Date().toISOString()
            });
            localStorage.setItem('favoriteAddresses', JSON.stringify(this.favoriteAddresses));
            return true;
        }
        return false;
    }
    
    /**
     * Remove address from favorites
     * @param {string} addressId - Address ID
     * @returns {boolean} - Success status
     */
    removeFavoriteAddress(addressId) {
        const initialLength = this.favoriteAddresses.length;
        this.favoriteAddresses = this.favoriteAddresses.filter(a => a.id !== addressId);
        
        if (initialLength !== this.favoriteAddresses.length) {
            localStorage.setItem('favoriteAddresses', JSON.stringify(this.favoriteAddresses));
            return true;
        }
        return false;
    }
    
    /**
     * Get favorite addresses
     * @param {string} currency - Filter by currency
     * @returns {Array<Object>} - List of favorite addresses
     */
    getFavoriteAddresses(currency) {
        if (currency) {
            return this.favoriteAddresses.filter(a => a.currency === currency);
        }
        return this.favoriteAddresses;
    }
    
    /**
     * Get cached exchange rates or fetch new ones if cache is expired
     * @param {string} baseCurrency - Base currency code
     * @returns {Promise<Object>} - Exchange rates data
     */
    async getCachedExchangeRates(baseCurrency = 'USDT') {
        // If we have cached rates that are less than 5 minutes old, use them
        const cacheExpiryTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        if (this.exchangeRatesCache && 
            this.lastExchangeRatesUpdate && 
            (new Date() - this.lastExchangeRatesUpdate) < cacheExpiryTime &&
            this.exchangeRatesCache.base === baseCurrency) {
            return this.exchangeRatesCache;
        }
        
        // Otherwise fetch new rates
        return await this.getExchangeRates(baseCurrency, true);
    }

    /**
     * Get transaction history for a user or merchant
     * @param {Object} options - Query options
     * @param {number} options.limit - Number of transactions to return
     * @param {number} options.offset - Offset for pagination
     * @param {string} options.status - Filter by status
     * @returns {Promise<Object>} - Transaction history data
     */
    async getTransactionHistory(options = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (options.limit) queryParams.append('limit', options.limit);
            if (options.offset) queryParams.append('offset', options.offset);
            if (options.status) queryParams.append('status', options.status);
            
            const response = await fetch(`${this.apiBaseUrl}/transactions?${queryParams.toString()}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch transaction history');
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('Error fetching transaction history:', error);
            throw error;
        }
    }

    /**
     * Format currency amount with proper symbol
     * @param {string|number} amount - Amount to format
     * @param {string} currency - Currency code
     * @param {boolean} includeUsdValue - Whether to include USD equivalent value
     * @returns {string} - Formatted amount with currency symbol
     */
    async formatCurrencyAmount(amount, currency, includeUsdValue = false) {
        const symbols = {
            USDT: '₮',
            BTC: '₿',
            ETH: 'Ξ',
            BNB: 'BNB',
            BUSD: 'BUSD'
        };
        
        const symbol = symbols[currency] || currency;
        let formattedAmount = `${amount} ${symbol}`;
        
        if (includeUsdValue && currency !== 'USDT' && currency !== 'BUSD') {
            try {
                const rates = await this.getCachedExchangeRates('USDT');
                if (rates && rates.rates && rates.rates[currency]) {
                    const usdValue = (parseFloat(amount) / rates.rates[currency]).toFixed(2);
                    formattedAmount += ` (≈ $${usdValue})`;
                }
            } catch (error) {
                console.warn('Could not include USD value in formatting:', error);
            }
        }
        
        return formattedAmount;
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

    /**
     * Initialize the payment UI
     * @param {Object} paymentData - Payment data from the server
     */
    initialize(paymentData) {
        this.paymentData = paymentData;
        this.renderPaymentDetails();
        this.startCountdown();
        this.setupEventListeners();
        this.startStatusCheck();
        this.setupCurrencySelector();
        this.setupThemeToggle();
    }

    /**
     * Render payment details in the UI
     */
    renderPaymentDetails() {
        // Update amount
        document.querySelectorAll('.payment-amount').forEach(el => {
            el.textContent = `${this.paymentData.amount} ${this.paymentData.currency}`;
        });

        // Update order reference
        document.querySelectorAll('.payment-reference').forEach(el => {
            el.textContent = this.paymentData.reference;
        });

        // Update payment address
        document.querySelectorAll('.payment-address').forEach(el => {
            el.textContent = this.paymentData.address;
        });

        // Generate and update QR code
        const qrCodeUrl = this.paymentApi.generateQRCode(
            this.paymentData.address,
            this.paymentData.amount,
            this.paymentData.currency
        );
        document.querySelectorAll('.qr-code img').forEach(el => {
            el.src = qrCodeUrl;
            el.alt = `Pay ${this.paymentData.amount} ${this.paymentData.currency} to ${this.paymentData.address}`;
        });
    }

    /**
     * Start countdown timer
     */
    startCountdown() {
        const countdownEl = document.getElementById('countdown');
        if (!countdownEl) return;

        const expiryTime = new Date(this.paymentData.expiresAt).getTime();
        
        this.countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            const distance = expiryTime - now;
            
            if (distance <= 0) {
                this.stopCountdown();
                countdownEl.innerHTML = "Expired";
                this.showScreen('error-screen');
                document.getElementById('error-message').textContent = 'Payment time expired';
                return;
            }
            
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            
            countdownEl.innerHTML = 
                minutes.toString().padStart(2, '0') + ":" + 
                seconds.toString().padStart(2, '0');
        }, 1000);
    }

    /**
     * Stop countdown timer
     */
    stopCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    /**
     * Start periodic payment status check
     */
    startStatusCheck() {
        // Check status every 10 seconds
        this.statusCheckInterval = setInterval(() => {
            this.checkPaymentStatus();
        }, 10000);
    }

    /**
     * Stop periodic payment status check
     */
    stopStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    /**
     * Check payment status
     */
    async checkPaymentStatus() {
        try {
            const statusData = await this.paymentApi.checkPaymentStatus(this.paymentData.reference);
            
            // Store previous status to detect changes
            const previousStatus = this.paymentData.status;
            
            // Update payment data with latest status
            this.paymentData = {...this.paymentData, ...statusData};
            
            // Update UI based on payment status
            switch(statusData.status) {
                case 'pending':
                    // Still waiting for payment
                    break;
                    
                case 'confirming':
                    this.showScreen('confirming-screen');
                    this.updateConfirmationStatus(statusData);
                    
                    // Show notification if status just changed
                    if (previousStatus !== 'confirming') {
                        this.showNotification(
                            'Payment Detected', 
                            'Your payment has been detected and is being confirmed.'
                        );
                    }
                    break;
                    
                case 'confirmed':
                    this.stopStatusCheck();
                    this.stopCountdown();
                    this.showScreen('success-screen');
                    this.updateSuccessStatus(statusData);
                    
                    // Show notification if status just changed
                    if (previousStatus !== 'confirmed') {
                        this.showNotification(
                            'Payment Confirmed', 
                            'Your payment has been confirmed successfully!'
                        );
                    }
                    break;
                    
                case 'failed':
                    this.stopStatusCheck();
                    this.stopCountdown();
                    this.showScreen('error-screen');
                    document.getElementById('error-message').textContent = 
                        statusData.errorMessage || 'Payment failed';
                    
                    // Show notification if status just changed
                    if (previousStatus !== 'failed') {
                        this.showNotification(
                            'Payment Failed', 
                            statusData.errorMessage || 'Your payment has failed.'
                        );
                    }
                    break;
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
        }
    }

    /**
     * Update confirmation screen with status data
     * @param {Object} statusData - Payment status data
     */
    updateConfirmationStatus(statusData) {
        // Update transaction hash
        const hashElements = document.querySelectorAll('.transaction-hash');
        hashElements.forEach(el => {
            el.textContent = this.paymentApi.formatTransactionHash(statusData.txHash);
        });

        // Update confirmation count
        const confirmationCountEl = document.getElementById('confirmation-count');
        if (confirmationCountEl) {
            confirmationCountEl.textContent = statusData.confirmations || 0;
        }
    }

    /**
     * Update success screen with status data
     * @param {Object} statusData - Payment status data
     */
    updateSuccessStatus(statusData) {
        // Update transaction hash
        const hashElements = document.querySelectorAll('.transaction-hash');
        hashElements.forEach(el => {
            el.textContent = this.paymentApi.formatTransactionHash(statusData.txHash);
        });

        // Update confirmation date
        const dateEl = document.getElementById('confirmation-date');
        if (dateEl && statusData.confirmedAt) {
            dateEl.textContent = this.paymentApi.formatDate(statusData.confirmedAt);
        }
    }

    /**
     * Show a specific screen
     * @param {string} screenId - Screen ID to show
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Copy address button
        const copyBtn = document.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.copyToClipboard(this.paymentData.address);
            });
        }

        // Check status button
        const checkStatusBtn = document.querySelector('#payment-screen .payment-action .btn-primary');
        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => {
                this.checkPaymentStatus();
            });
        }

        // View transaction button
        const viewTxBtn = document.querySelector('#confirming-screen .payment-action .btn-outline-secondary');
        if (viewTxBtn) {
            viewTxBtn.addEventListener('click', () => {
                const txHash = this.paymentData.txHash;
                if (txHash) {
                    window.open(this.paymentApi.getTransactionExplorerUrl(txHash), '_blank');
                }
            });
        }

        // Return to merchant button
        const returnBtns = document.querySelectorAll('.btn-primary[onclick="returnToMerchant()"]');
        returnBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.returnToMerchant();
            });
        });

        // Try again button
        const tryAgainBtn = document.querySelector('#error-screen .btn-primary');
        if (tryAgainBtn) {
            tryAgainBtn.addEventListener('click', () => {
                this.showScreen('payment-screen');
                this.startCountdown();
                this.startStatusCheck();
            });
        }
        
        // View transaction history button (if exists)
        const historyBtn = document.querySelector('.view-history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.showTransactionHistory();
            });
        }
        
        // Notification toggle
        const notificationToggle = document.querySelector('#notification-toggle');
        if (notificationToggle) {
            notificationToggle.checked = this.paymentApi.notificationsEnabled;
            notificationToggle.addEventListener('change', (e) => {
                this.paymentApi.notificationsEnabled = e.target.checked;
                localStorage.setItem('notificationsEnabled', e.target.checked);
                
                if (e.target.checked) {
                    this.checkNotificationPermission();
                }
            });
        }
    }

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     */
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            const copyBtn = document.querySelector('.copy-btn');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="bi bi-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    /**
     * Return to merchant website
     */
    returnToMerchant() {
        if (this.merchantReturnUrl) {
            window.location.href = this.merchantReturnUrl;
        } else {
            alert('Redirecting to merchant site...');
        }
    }

    /**
     * Set up currency selector
     */
    setupCurrencySelector() {
        const currencySelector = document.querySelector('#currency-selector');
        if (!currencySelector) return;
        
        // Clear existing options
        currencySelector.innerHTML = '';
        
        // Add options for each supported currency
        const currencies = this.paymentApi.getSupportedCurrencies();
        currencies.forEach(currency => {
            const option = document.createElement('option');
            option.value = currency;
            option.textContent = currency;
            if (currency === this.paymentApi.getPreferredCurrency()) {
                option.selected = true;
            }
            currencySelector.appendChild(option);
        });
        
        // Add change event listener
        currencySelector.addEventListener('change', (e) => {
            const newCurrency = e.target.value;
            this.paymentApi.setPreferredCurrency(newCurrency);
            // Update displayed rates if we're showing them
            this.updateExchangeRateDisplay();
        });
    }
    
    /**
     * Set up theme toggle
     */
    setupThemeToggle() {
        const themeToggle = document.querySelector('#theme-toggle');
        if (!themeToggle) return;
        
        // Set initial state based on saved preference
        themeToggle.checked = this.paymentApi.isDarkMode;
        
        // Add change event listener
        themeToggle.addEventListener('change', (e) => {
            this.paymentApi.isDarkMode = e.target.checked;
            localStorage.setItem('darkMode', e.target.checked);
            this.applyTheme();
        });
    }
    
    /**
     * Apply theme based on current setting
     */
    applyTheme() {
        const root = document.documentElement;
        if (this.paymentApi.isDarkMode) {
            root.classList.add('dark-mode');
            // Update dark mode variables
            root.style.setProperty('--background-color', '#121212');
            root.style.setProperty('--text-color', '#e0e0e0');
            root.style.setProperty('--card-bg', '#1e1e1e');
            root.style.setProperty('--border-color', '#333');
        } else {
            root.classList.remove('dark-mode');
            // Reset to light mode variables
            root.style.setProperty('--background-color', '#f8f9fa');
            root.style.setProperty('--text-color', '#2c3e50');
            root.style.setProperty('--card-bg', '#ffffff');
            root.style.setProperty('--border-color', '#dee2e6');
        }
    }
    
    /**
     * Update exchange rate display
     */
    async updateExchangeRateDisplay() {
        const ratesContainer = document.querySelector('#exchange-rates');
        if (!ratesContainer) return;
        
        try {
            const baseCurrency = this.paymentApi.getPreferredCurrency();
            const rates = await this.paymentApi.getCachedExchangeRates(baseCurrency);
            
            // Clear existing rates
            ratesContainer.innerHTML = '';
            
            // Add header
            const header = document.createElement('div');
            header.className = 'rates-header';
            header.textContent = `Exchange Rates (${baseCurrency})`;
            ratesContainer.appendChild(header);
            
            // Add rates
            Object.entries(rates.rates).forEach(([currency, rate]) => {
                if (currency !== baseCurrency) {
                    const rateItem = document.createElement('div');
                    rateItem.className = 'rate-item';
                    rateItem.innerHTML = `<span>${currency}</span><span>${rate}</span>`;
                    ratesContainer.appendChild(rateItem);
                }
            });
            
            // Add timestamp
            const timestamp = document.createElement('div');
            timestamp.className = 'rates-timestamp';
            timestamp.textContent = `Updated: ${this.paymentApi.formatDate(rates.timestamp)}`;
            ratesContainer.appendChild(timestamp);
        } catch (error) {
            console.error('Error updating exchange rates display:', error);
            ratesContainer.innerHTML = '<div class="error">Could not load exchange rates</div>';
        }
    }
    
    /**
     * Show transaction history
     */
    async showTransactionHistory() {
        const historyContainer = document.querySelector('#transaction-history');
        if (!historyContainer) return;
        
        try {
            // Show loading state
            historyContainer.innerHTML = '<div class="loading">Loading transaction history...</div>';
            
            // Fetch transaction history
            const history = await this.paymentApi.getTransactionHistory({ limit: 10 });
            
            // Clear loading state
            historyContainer.innerHTML = '';
            
            if (!history || !history.transactions || history.transactions.length === 0) {
                historyContainer.innerHTML = '<div class="no-data">No transaction history available</div>';
                return;
            }
            
            // Create table
            const table = document.createElement('table');
            table.className = 'transaction-table';
            
            // Add header
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Status</th>
                </tr>
            `;
            table.appendChild(thead);
            
            // Add body
            const tbody = document.createElement('tbody');
            history.transactions.forEach(tx => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${this.paymentApi.formatDate(tx.createdAt)}</td>
                    <td>${tx.reference}</td>
                    <td>${this.paymentApi.formatCurrencyAmount(tx.amount, tx.currency)}</td>
                    <td><span class="status-${tx.status}">${tx.status}</span></td>
                `;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            
            historyContainer.appendChild(table);
        } catch (error) {
            console.error('Error showing transaction history:', error);
            historyContainer.innerHTML = '<div class="error">Could not load transaction history</div>';
        }
    }
    
    /**
     * Check notification permission
     */
    checkNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return;
        }
        
        if (Notification.permission === 'granted') {
            this.notificationPermissionGranted = true;
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.notificationPermissionGranted = true;
                }
            });
        }
    }
    
    /**
     * Show notification
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     */
    showNotification(title, message) {
        if (!this.paymentApi.notificationsEnabled) return;
        
        // Play sound notification
        try {
            this.notificationSound.play();
        } catch (e) {
            console.warn('Could not play notification sound:', e);
        }
        
        // Show browser notification if permission granted
        if (this.notificationPermissionGranted) {
            try {
                new Notification(title, {
                    body: message,
                    icon: '/favicon.ico'
                });
            } catch (e) {
                console.warn('Could not show browser notification:', e);
            }
        }
        
        // Show in-app notification
        const notificationEl = document.createElement('div');
        notificationEl.className = 'in-app-notification';
        notificationEl.innerHTML = `
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        
        document.body.appendChild(notificationEl);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notificationEl.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notificationEl);
            }, 500);
        }, 5000);
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.stopCountdown();
        this.stopStatusCheck();
    }
}

// Export classes for use in other files
window.PaymentAPI = PaymentAPI;
window.PaymentUI = PaymentUI;