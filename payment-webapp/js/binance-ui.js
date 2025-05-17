/**
 * Binance Dashboard UI Implementation
 * Handles UI for the consolidated Binance section with tabs for Dashboard, Wallet, and Payments
 */

// Initialize Binance Dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create dashboard instance
    window.binanceDashboard = new BinanceDashboardUI();
});

/**
 * Binance Dashboard UI Class
 * Manages the Binance dashboard interface
 */
class BinanceDashboardUI {
    constructor() {
        this.binanceApi = new BinanceAPI();
        this.initElements();
        this.addEventListeners();
        this.initialize();
    }
    
    /**
     * Initialize UI elements
     */
    initElements() {
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
        this.apiConfigModal = new bootstrap.Modal(document.getElementById('configure-api-modal'));
        this.transactionDetailsModal = new bootstrap.Modal(document.getElementById('transaction-details-modal'));
        this.transactionDetailsContent = document.getElementById('transaction-details-content');
        
        // Forms
        this.apiKeyInput = document.getElementById('api-key');
        this.apiSecretInput = document.getElementById('api-secret');
        this.withdrawalForm = document.getElementById('withdrawal-form');
        this.paymentRequestForm = document.getElementById('payment-request-form');
        
        // Buttons and actions
        this.refreshBtn = document.getElementById('refresh-btn');
        this.saveApiKeysBtn = document.getElementById('save-api-keys-btn');
        
        // Current active tab
        this.currentTab = 'dashboard';
    }
    
    /**
     * Add event listeners to UI elements
     */
    addEventListeners() {
        // Configure API keys
        if (this.configureBtn) {
            this.configureBtn.addEventListener('click', () => this.openConfigureModal());
        }
        
        if (this.saveApiKeysBtn) {
            this.saveApiKeysBtn.addEventListener('click', () => this.saveApiKeys());
        }
        
        // Refresh data
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshData());
        }
        
        // Handle withdrawal form submission
        if (this.withdrawalForm) {
            this.withdrawalForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleWithdrawalSubmit();
            });
        }
        
        // Handle payment request form submission
        if (this.paymentRequestForm) {
            this.paymentRequestForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePaymentRequestSubmit();
            });
        }
        
        // Handle tab changes
        document.querySelectorAll('.binance-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                this.handleTabChange(tabId);
            });
        });
        
        // Handle transaction details
        document.addEventListener('click', (e) => {
            const viewDetailsBtn = e.target.closest('.view-transaction-btn');
            if (viewDetailsBtn) {
                const txType = viewDetailsBtn.dataset.type;
                const txId = viewDetailsBtn.dataset.id;
                this.showTransactionDetails(txType, txId);
            }
        });
    }
    
    /**
     * Initialize the dashboard
     */
    async initialize() {
        await this.checkConnection();
        if (this.binanceApi.isConfigured) {
            this.loadBalances();
            this.loadTransactions();
        } else {
            this.displayConfigurationNeeded();
        }
    }
    
    /**
     * Check connection status
     */
    async checkConnection() {
        try {
            // Update UI to loading state
            this.updateConnectionStatus('checking');
            
            if (!this.binanceApi.isConfigured) {
                this.updateConnectionStatus('not-configured');
                return false;
            }
            
            const isConnected = await this.binanceApi.testConnection();
            this.updateConnectionStatus(isConnected ? 'connected' : 'error');
            return isConnected;
        } catch (error) {
            console.error('Error checking connection:', error);
            this.updateConnectionStatus('error');
            return false;
        }
    }
    
    /**
     * Handle tab changes to load appropriate data
     * @param {string} tabId - ID of the tab that was activated
     */
    handleTabChange(tabId) {
        this.currentTab = tabId;
        
        // Only proceed if API is configured
        if (!this.binanceApi.isConfigured) {
            this.displayConfigurationNeeded();
            return;
        }
        
        switch (tabId) {
            case 'dashboard':
                this.loadBalances();
                this.loadTransactions();
                break;
            case 'wallet':
                this.loadDetailedWalletBalances();
                break;
            case 'payments':
                this.loadPaymentRequests();
                break;
        }
    }
    
    /**
     * Display configuration needed message
     */
    displayConfigurationNeeded() {
        // Display message in all containers
        if (this.balancesContainer) {
            this.balancesContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your wallet balances.
                </div>
            `;
        }
        
        if (this.walletBalancesContainer) {
            this.walletBalancesContainer.innerHTML = `
                <div class="col-12 text-center py-4">
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your detailed wallet information.
                    </div>
                </div>
            `;
        }
        
        if (this.allTransactionsTable) {
            this.allTransactionsTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div class="alert alert-warning mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your transactions.
                        </div>
                    </td>
                </tr>
            `;
        }
        
        if (this.depositsTable) {
            this.depositsTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div class="alert alert-warning mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your deposits.
                        </div>
                    </td>
                </tr>
            `;
        }
        
        if (this.withdrawalsTable) {
            this.withdrawalsTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div class="alert alert-warning mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your withdrawals.
                        </div>
                    </td>
                </tr>
            `;
        }
        
        if (this.paymentRequestsTable) {
            this.paymentRequestsTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div class="alert alert-warning mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i> Please configure your Binance API keys to view your payment requests.
                        </div>
                    </td>
                </tr>
            `;
        }
        
        // Reset dashboard metrics
        if (this.totalBalanceValue) {
            this.totalBalanceValue.textContent = 'Not Available';
        }
        if (this.activeCoinsCount) {
            this.activeCoinsCount.textContent = '0';
        }
        if (this.lastTransactionTime) {
            this.lastTransactionTime.textContent = 'No Data';
        }
        if (this.lastTransactionInfo) {
            this.lastTransactionInfo.textContent = 'Configure API to view';
        }
    }
    
    /**
     * Update connection status indicator and message
     * @param {string} status - Connection status
     */
    updateConnectionStatus(status) {
        const statusClasses = {
            'checking': 'alert-info',
            'connected': 'alert-success',
            'error': 'alert-danger',
            'not-configured': 'alert-warning'
        };
        
        const statusMessages = {
            'checking': 'Checking connection to Binance API...',
            'connected': 'Connected to Binance API successfully',
            'error': 'Failed to connect to Binance API. Please check your API keys and try again.',
            'not-configured': 'Binance API keys not configured. Please configure your API keys to use all features.'
        };
        
        // Update alert class
        if (this.connectionStatus) {
            // Remove all status classes
            this.connectionStatus.classList.remove('alert-info', 'alert-success', 'alert-danger', 'alert-warning');
            
            // Add the appropriate class
            if (statusClasses[status]) {
                this.connectionStatus.classList.add(statusClasses[status]);
            }
        }
        
        // Update indicator class
        if (this.connectionIndicator) {
            // Remove all status classes
            this.connectionIndicator.classList.remove('connected', 'error', 'warning');
            
            // Add the appropriate class based on status
            if (status === 'connected') {
                this.connectionIndicator.classList.add('connected');
            } else if (status === 'error') {
                this.connectionIndicator.classList.add('error');
            } else if (status === 'not-configured') {
                this.connectionIndicator.classList.add('warning');
            }
        }
        
        // Update message
        if (this.connectionMessage) {
            this.connectionMessage.textContent = statusMessages[status] || 'Unknown status';
        }
        
        // Show configuration button if not configured
        if (status === 'not-configured' && this.configureBtn) {
            this.configureBtn.classList.add('pulse-animation');
        } else if (this.configureBtn) {
            this.configureBtn.classList.remove('pulse-animation');
        }
    }
    
    /**
     * Load wallet balances and update dashboard metrics
     */
                return;
            }
            
            // Sort by value (highest first)
            balances.sort((a, b) => {
                const aValue = parseFloat(a.free) + parseFloat(a.locked);
                const bValue = parseFloat(b.free) + parseFloat(b.locked);
                return bValue - aValue;
            });
            
            let balancesHtml = '';
            
            balances.forEach(balance => {
                // Only show non-zero balances
                if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
                    const total = parseFloat(balance.free) + parseFloat(balance.locked);
                    
                    balancesHtml += `
                        <div class="balance-item mb-3 p-3 border rounded">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="d-flex align-items-center">
                                    ${getCurrencyIcon(balance.asset)}
                                    <div class="ms-2">
                                        <div class="fw-bold">${balance.asset}</div>
                                    </div>
                                </div>
                                <div class="text-end">
                                    <div class="balance-amount fw-bold">${formatCryptoAmount(total, balance.asset)}</div>
                                    <div class="balance-details small text-muted">
                                        Available: ${formatCryptoAmount(balance.free, balance.asset)}
                                        ${parseFloat(balance.locked) > 0 ? `<br>Locked: ${formatCryptoAmount(balance.locked, balance.asset)}` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });
            
            if (this.balancesContainer) {
                this.balancesContainer.innerHTML = balancesHtml || `
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle me-2"></i> No balances found in your Binance wallet.
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Error loading balances:', error);
            
            // Hide loader
            if (this.balancesLoader) {
                this.balancesLoader.classList.add('d-none');
            }
            
            if (this.balancesContainer) {
                this.balancesContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i> Error loading balances: ${error.message}
                    </div>
                `;
            }
        }
    }
    
    /**
     * Update dashboard metrics with balance and transaction data
     * @param {Array} balances - Array of balance objects
     */
    updateDashboardMetrics(balances) {
        try {
            // Calculate total balance in USD
            let totalBalance = 0;
            let activeCoins = 0;
            
            if (balances && balances.length > 0) {
                balances.forEach(balance => {
                    const total = parseFloat(balance.free) + parseFloat(balance.locked);
                    if (total > 0) {
                        activeCoins++;
                        // Add to total if fiatValue is available
                        if (balance.fiatValue) {
                            totalBalance += parseFloat(balance.fiatValue);
                        }
                    }
                });
            }
            
            // Update total balance
            if (this.totalBalanceValue) {
                this.totalBalanceValue.textContent = totalBalance > 0 ? 
                    `$${totalBalance.toFixed(2)} USD` : 
                    'No balance data';
            }
            
            // Update active coins count
            if (this.activeCoinsCount) {
                this.activeCoinsCount.textContent = activeCoins.toString();
            }
        } catch (error) {
            console.error('Error updating dashboard metrics:', error);
        }
    }
    
    /**
     * Update last transaction info on dashboard
     * @param {Array} transactions - Combined transactions array
     */
    updateLastTransactionInfo(transactions) {
        try {
            if (!transactions || transactions.length === 0) {
                if (this.lastTransactionTime) {
                    this.lastTransactionTime.textContent = 'No transactions';
                }
                if (this.lastTransactionInfo) {
                    this.lastTransactionInfo.textContent = 'No recent activity';
                }
                return;
            }
            
            // Sort by timestamp descending (most recent first)
            transactions.sort((a, b) => {
                const aTime = a.timestamp || a.insertTime || a.time || 0;
                const bTime = b.timestamp || b.insertTime || b.time || 0;
                return bTime - aTime;
            });
            
            const lastTx = transactions[0];
            const timestamp = lastTx.timestamp || lastTx.insertTime || lastTx.time;
            const formattedTime = timestamp ? formatTimestamp(timestamp) : 'Unknown';
            
            if (this.lastTransactionTime) {
                this.lastTransactionTime.textContent = formattedTime;
            }
            
            if (this.lastTransactionInfo) {
                const txType = lastTx.type || (lastTx.isBuy ? 'Buy' : 'Sell');
                const asset = lastTx.asset || lastTx.coin || lastTx.currency || 'Unknown';
                const amount = lastTx.amount || lastTx.qty || lastTx.quantity || '0';
                
                this.lastTransactionInfo.textContent = `${txType} ${formatCryptoAmount(amount, asset)} ${asset}`;
            }
        } catch (error) {
            console.error('Error updating last transaction info:', error);
            
            if (this.lastTransactionTime) {
                this.lastTransactionTime.textContent = 'Error';
            }
            if (this.lastTransactionInfo) {
                this.lastTransactionInfo.textContent = 'Could not load transaction data';
            }
        }
    }
}
