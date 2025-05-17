/**
 * Binance Dashboard UI Implementation for Real API Data
 * Handles UI for the consolidated Binance section using real API data
 */

// Initialize Binance Dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Binance dashboard with real API data');
    window.binanceDashboard = new BinanceDashboardUI();
});

/**
 * Binance Dashboard UI Class
 * Manages the Binance dashboard interface with real API data
 */
class BinanceDashboardUI {
    constructor() {
        try {
            // Initialize with the API using server-side proxy
            if (typeof BinanceAPI === 'function') {
                this.binanceApi = new BinanceAPI();
            } else {
                console.error('BinanceAPI class not found. Make sure binance-real.js is loaded correctly.');
                this.binanceApi = {
                    // Fallback mock methods to prevent errors
                    getBalances: async () => [],
                    getDeposits: async () => [],
                    getWithdrawals: async () => [],
                    testConnection: async () => false
                };
            }
            
            // Initialize UI components
            this.initElements();
            
            // Set up event listeners
            this.addEventListeners();
            
            // Set initial connection status as connecting
            this.updateConnectionStatus('connecting', 'Connecting to Binance API...');
            
            // Check API status first
            this.checkApiStatus().then(() => {
                // Load initial data after checking API status
                this.loadInitialData();
            }).catch(error => {
                console.error('Failed to connect to Binance API:', error);
                this.updateConnectionStatus('error', 'Failed to connect to Binance API');
            });
        } catch (error) {
            console.error('Error initializing BinanceDashboardUI:', error);
            this.updateConnectionStatus('error', `Initialization error: ${error.message}`);
        }
    }
    
    /**
     * Initialize UI elements
     */
    initElements() {
        try {
            // Connection status elements
            this.connectionIndicator = document.getElementById('connection-status-indicator');
            this.connectionMessage = document.getElementById('connection-status-message');
            this.connectionStatus = document.getElementById('connection-status');
            this.configureBtn = document.getElementById('configure-binance-btn');
            
            // Dashboard elements
            this.totalBalanceValue = document.getElementById('total-balance-value');
            this.activeCoinsCount = document.getElementById('active-coins-count');
            this.lastTransactionTime = document.getElementById('last-transaction-time');
            this.lastTransactionInfo = document.getElementById('last-transaction-info');
            
            // Balance elements
            this.balancesContainer = document.getElementById('wallet-balances');
            this.balancesLoader = document.getElementById('balances-loader');
            this.walletBalancesContainer = document.getElementById('wallet-balances-container');
            
            // Transaction tables
            this.allTransactionsTable = document.getElementById('all-transactions-table-body');
            this.depositsTable = document.getElementById('deposits-table-body');
            this.withdrawalsTable = document.getElementById('withdrawals-table-body');
            this.paymentRequestsTable = document.getElementById('payment-requests-table-body');
            
            // Modals
            this.configureApiModal = document.getElementById('configure-api-modal');
            this.withdrawalModal = document.getElementById('withdrawal-modal');
            this.paymentRequestModal = document.getElementById('payment-request-modal');
            
            // Forms
            this.apiKeyForm = document.getElementById('api-key-form');
            this.withdrawalForm = document.getElementById('withdrawal-form');
            this.paymentRequestForm = document.getElementById('payment-request-form');
            
            // Tabs
            this.currentTab = 'dashboard';
            this.tabs = document.querySelectorAll('.binance-tab');
        } catch (error) {
            console.error('Error initializing UI elements:', error);
        }
    }
    
    /**
     * Add event listeners to UI elements
     */
    addEventListeners() {
        // Initialize Bootstrap elements
        if (typeof bootstrap !== 'undefined') {
            const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
            tooltips.forEach(tooltip => {
                new bootstrap.Tooltip(tooltip);
            });
        }
        
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentTab = e.target.getAttribute('data-tab-id');
                
                // Load tab-specific data
                if (this.currentTab === 'wallet') {
                    this.loadBalances();
                } else if (this.currentTab === 'dashboard') {
                    this.checkConnectionStatus();
                    this.loadTransactions();
                }
            });
        });
        
        // Configure API button
        if (this.configureBtn) {
            this.configureBtn.addEventListener('click', () => {
                if (this.configureApiModal && typeof bootstrap !== 'undefined') {
                    const modal = new bootstrap.Modal(this.configureApiModal);
                    modal.show();
                }
            });
        }
        
        // API key form
        if (this.apiKeyForm) {
            this.apiKeyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitApiKeys();
            });
        }
        
        // Withdrawal form
        if (this.withdrawalForm) {
            this.withdrawalForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitWithdrawal();
            });
        }
        
        // Payment request form
        if (this.paymentRequestForm) {
            this.paymentRequestForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitPaymentRequest();
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }
    }
    
    /**
     * Load initial data for the dashboard
     */
    async loadInitialData() {
        try {
            console.log('Loading initial data from server API');
            
            // First load balances
            await this.loadBalances();
            
            // Then load transaction history
            await this.loadTransactions();
            
            console.log('Initial data loaded successfully');
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.updateConnectionStatus('warning', `Failed to load some data: ${error.message}`);
        }
    }
    
    /**
     * Check Binance API connection status using our server status endpoint
     * @returns {Promise<boolean>} - True if connected, false otherwise
     */
    async checkConnectionStatus() {
        try {
            // Use our checkApiStatus method that calls the server API status endpoint
            return await this.checkApiStatus();
        } catch (error) {
            console.error('Error checking connection status:', error);
            this.updateConnectionStatus('error', `Connection error: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Check API status by making a request to the status endpoint
     * @returns {Promise<boolean>} - True if API is operational, false otherwise
     */
    async checkApiStatus() {
        try {
            // Update status to checking
            this.updateConnectionStatus('connecting', 'Checking Binance API status...');
            
            // Make request to status endpoint
            const statusEndpoint = '/status';
            const statusResponse = await this.binanceApi.makeAuthRequest(statusEndpoint);
            
            if (statusResponse && statusResponse.status === 'operational') {
                this.updateConnectionStatus('connected', 'Binance API is operational');
                return true;
            } else if (statusResponse && statusResponse.status === 'maintenance') {
                this.updateConnectionStatus('warning', `Binance API in maintenance: ${statusResponse.message}`);
                return false;
            } else {
                this.updateConnectionStatus('error', 'Binance API status unknown');
                return false;
            }
        } catch (error) {
            console.error('Failed to check API status:', error);
            this.updateConnectionStatus('error', `Status check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Update connection status indicator
     * @param {string} status - Status code (connected, error, connecting, warning, etc)
     * @param {string} message - Status message
     */
    updateConnectionStatus(status, message) {
        if (!this.connectionIndicator || !this.connectionMessage || !this.connectionStatus) {
            console.warn('Connection status elements not found');
            return;
        }
        
        // Clear all status classes
        this.connectionIndicator.className = '';
        this.connectionIndicator.classList.add('connection-indicator');
        this.connectionStatus.className = '';
        this.connectionStatus.classList.add('badge');
        
        // Set status based on code
        switch (status) {
            case 'connected':
                this.connectionIndicator.classList.add('bg-success');
                this.connectionStatus.classList.add('bg-success');
                this.connectionStatus.textContent = 'Connected';
                break;
            case 'error':
                this.connectionIndicator.classList.add('bg-danger');
                this.connectionStatus.classList.add('bg-danger');
                this.connectionStatus.textContent = 'Error';
                break;
            case 'warning':
                this.connectionIndicator.classList.add('bg-warning');
                this.connectionStatus.classList.add('bg-warning');
                this.connectionStatus.textContent = 'Warning';
                break;
            case 'connecting':
                this.connectionIndicator.classList.add('bg-info');
                this.connectionStatus.classList.add('bg-info');
                this.connectionStatus.textContent = 'Connecting';
                break;
            case 'not-configured':
                this.connectionIndicator.classList.add('bg-secondary');
                this.connectionStatus.classList.add('bg-secondary');
                this.connectionStatus.textContent = 'Not Configured';
                break;
            default:
                this.connectionIndicator.classList.add('bg-info');
                this.connectionStatus.classList.add('bg-info');
                this.connectionStatus.textContent = 'Unknown';
                break;
        }
        
        // Update message
        this.connectionMessage.textContent = message || '';
    }
    
    /**
     * Refresh dashboard data from server API
     */
    async refreshData() {
        try {
            // Show refresh indicator
            const refreshBtn = document.getElementById('refresh-btn');
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-spin');
                }
                refreshBtn.disabled = true;
            }
            
            // Update connection status first
            await this.checkConnectionStatus();
            
            // Reload all data based on current tab
            if (this.currentTab === 'dashboard') {
                await this.loadTransactions();
                await this.loadBalances();
            } else if (this.currentTab === 'wallet') {
                await this.loadBalances();
            } else if (this.currentTab === 'transactions') {
                await this.loadTransactions();
            }
            
            // Show success message
            this.showToast('Data refreshed successfully', 'success');
            
            // Reset refresh button
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-spin');
                }
                refreshBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error refreshing data:', error);
            
            // Show error message
            this.showToast(`Failed to refresh data: ${error.message}`, 'danger');
            
            // Reset refresh button
            const refreshBtn = document.getElementById('refresh-btn');
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-spin');
                }
                refreshBtn.disabled = false;
            }
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - Message to show
     * @param {string} type - Toast type (success, error, warning, info)
     */
    showToast(message, type = 'info') {
        // Check if Bootstrap is available
        if (typeof bootstrap === 'undefined') {
            console.log(`Toast message (${type}): ${message}`);
            return;
        }
        
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        // Create toast content
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        // Add toast to container
        toastContainer.appendChild(toastEl);
        
        // Initialize toast
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 5000
        });
        
        // Show toast
        toast.show();
    }

    /**
     * Display configuration needed message
     */
    displayConfigurationNeeded() {
        const mainContent = document.querySelector('.tab-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="alert alert-warning">
                    <h4><i class="bi bi-exclamation-triangle me-2"></i>API Configuration Required</h4>
                    <p>Please configure your Binance API keys to access the dashboard.</p>
                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#configure-api-modal">
                        Configure API Keys
                    </button>
                </div>
            `;
        }
    }
    
    /**
     * Submit API keys from the form
     */
    submitApiKeys() {
        const apiKeyInput = document.getElementById('binance-api-key');
        const apiSecretInput = document.getElementById('binance-api-secret');
        
        if (!apiKeyInput || !apiSecretInput) return;
        
        const apiKey = apiKeyInput.value.trim();
        const apiSecret = apiSecretInput.value.trim();
        
        if (!apiKey || !apiSecret) {
            this.showToast('Please enter both API Key and API Secret', 'warning');
            return;
        }
        
        // Save API keys (in a real application, these should be securely stored)
        localStorage.setItem('binance_api_key', apiKey);
        localStorage.setItem('binance_api_secret', apiSecret);
        
        // Re-initialize Binance API with new keys
        this.binanceApi = new BinanceAPI(apiKey, apiSecret);
        
        // Hide modal
        if (this.configureApiModal && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(this.configureApiModal);
            if (modal) modal.hide();
        }
        
        // Check connection and reload
        this.initialize();
        
        this.showToast('API keys configured successfully!', 'success');
    }
    
    /**
     * Show a toast notification
     */
    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toastId = 'toast-' + Date.now();
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.id = toastId;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Show toast using Bootstrap
        if (typeof bootstrap !== 'undefined') {
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        }
        
        // Auto-remove toast after it's hidden
        toast.addEventListener('hidden.bs.toast', function() {
            toast.remove();
        });
    }
}

// Add additional methods to prototype - will be loaded from separate files
