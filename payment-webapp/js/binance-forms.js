/**
 * Binance Dashboard UI Forms
 * Handles form submissions and API key configuration for the Binance dashboard
 */

// Extends BinanceDashboardUI with form methods

/**
 * Save API keys
 */
BinanceDashboardUI.prototype.saveApiKeys = async function() {
    try {
        const apiKey = this.apiKeyInput.value.trim();
        const apiSecret = this.apiSecretInput.value.trim();
        
        if (!apiKey || !apiSecret) {
            alert('Please enter both API key and secret.');
            return;
        }
        
        // Show loading state
        this.saveApiKeysBtn.disabled = true;
        this.saveApiKeysBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Saving...';
        
        // Save API keys
        this.binanceApi.saveApiKeys(apiKey, apiSecret);
        
        // Test connection
        this.updateConnectionStatus('checking');
        const connected = await this.binanceApi.testConnection();
        
        if (connected) {
            this.updateConnectionStatus('connected');
            this.apiConfigModal.hide();
            
            // Load data with new API keys
            this.loadBalances();
            this.loadTransactions();
        } else {
            this.updateConnectionStatus('error');
            alert('Failed to connect to Binance API. Please check your API keys and try again.');
        }
    } catch (error) {
        console.error('Error saving API keys:', error);
        alert(`Error: ${error.message || 'Failed to save API keys'}`);
        this.updateConnectionStatus('error');
    } finally {
        // Reset button state
        this.saveApiKeysBtn.disabled = false;
        this.saveApiKeysBtn.innerHTML = 'Save & Connect';
    }
};

/**
 * Open configure API modal
 */
BinanceDashboardUI.prototype.openConfigureModal = function() {
    // Pre-fill API key if configured
    if (this.apiKeyInput && this.binanceApi.isConfigured) {
        this.apiKeyInput.value = this.binanceApi.apiKey || '';
    }
    
    // Don't pre-fill secret for security reasons
    if (this.apiSecretInput) {
        this.apiSecretInput.value = '';
    }
    
    // Show the modal
    if (this.apiConfigModal) {
        this.apiConfigModal.show();
    }
};

/**
 * Handle withdrawal form submission
 */
BinanceDashboardUI.prototype.handleWithdrawalSubmit = async function() {
    if (!this.withdrawalForm) return;
    
    try {
        const currency = document.getElementById('withdrawal-currency').value;
        const address = document.getElementById('withdrawal-address').value;
        const amount = document.getElementById('withdrawal-amount').value;
        const network = document.getElementById('withdrawal-network').value;
        
        if (!currency || !address || !amount || !network) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (parseFloat(amount) <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }
        
        // Show loading state
        const submitBtn = this.withdrawalForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Processing...';
        
        // Create withdrawal
        const withdrawalData = {
            coin: currency,
            address: address,
            amount: parseFloat(amount),
            network: network
        };
        
        const result = await this.binanceApi.createWithdrawal(withdrawalData);
        
        if (result) {
            alert('Withdrawal request submitted successfully!');
            this.withdrawalForm.reset();
            
            // Refresh data
            this.loadBalances();
            this.loadTransactions();
        } else {
            alert('Failed to submit withdrawal request. Please try again.');
        }
    } catch (error) {
        console.error('Error submitting withdrawal:', error);
        alert(`Error: ${error.message || 'Failed to submit withdrawal request'}`);
    } finally {
        // Reset button state
        const submitBtn = this.withdrawalForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Withdrawal';
    }
};

/**
 * Handle payment request form submission
 */
BinanceDashboardUI.prototype.handlePaymentRequestSubmit = async function() {
    if (!this.paymentRequestForm) return;
    
    try {
        const currency = document.getElementById('payment-currency').value;
        const amount = document.getElementById('payment-amount').value;
        const description = document.getElementById('payment-description').value;
        const customerName = document.getElementById('payment-customer').value;
        const customerEmail = document.getElementById('payment-email').value;
        
        if (!currency || !amount) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (parseFloat(amount) <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }
        
        // Show loading state
        const submitBtn = this.paymentRequestForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Processing...';
        
        // Create payment request
        const paymentData = {
            asset: currency,
            amount: parseFloat(amount),
            description: description || 'Payment request',
            customer: {
                name: customerName || 'Anonymous',
                email: customerEmail || ''
            },
            metadata: {
                source: 'payment-gateway-webapp'
            }
        };
        
        const result = await this.binanceApi.createPaymentRequest(paymentData);
        
        if (result) {
            alert('Payment request created successfully!');
            this.paymentRequestForm.reset();
            
            // Refresh data
            this.loadPaymentRequests();
        } else {
            alert('Failed to create payment request. Please try again.');
        }
    } catch (error) {
        console.error('Error creating payment request:', error);
        alert(`Error: ${error.message || 'Failed to create payment request'}`);
    } finally {
        // Reset button state
        const submitBtn = this.paymentRequestForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Payment Request';
    }
};

/**
 * Show transaction details in modal
 * @param {string} type - Transaction type (deposit, withdrawal, payment)
 * @param {string} id - Transaction ID
 */
BinanceDashboardUI.prototype.showTransactionDetails = async function(type, id) {
    try {
        if (!id) {
            throw new Error('Transaction ID is missing');
        }
        
        // Show loading state in modal
        this.transactionDetailsContent.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Loading transaction details...</span>
                </div>
                <p class="mt-2">Loading transaction details...</p>
            </div>
        `;
        
        // Show modal while loading
        this.transactionDetailsModal.show();
        
        // Fetch transaction details based on type
        let transaction;
        switch (type) {
            case 'deposit':
                transaction = await this.getDepositDetails(id);
                break;
            case 'withdrawal':
                transaction = await this.getWithdrawalDetails(id);
                break;
            case 'payment':
                transaction = await this.getPaymentRequestDetails(id);
                break;
            default:
                throw new Error(`Unknown transaction type: ${type}`);
        }
        
        if (!transaction) {
            throw new Error('Transaction not found');
        }
        
        // Display transaction details
        this.displayTransactionDetails(type, transaction);
        
    } catch (error) {
        console.error('Error showing transaction details:', error);
        
        this.transactionDetailsContent.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i> Error loading transaction details: ${error.message || 'Unknown error'}
            </div>
        `;
    }
};

/**
 * Get deposit details by ID
 * @param {string} id - Deposit ID
 * @returns {Promise<Object>} - Deposit details
 */
BinanceDashboardUI.prototype.getDepositDetails = async function(id) {
    // For the prototype, find deposit in already loaded data
    const deposits = await this.binanceApi.getDeposits();
    return deposits.find(d => d.txId === id || d.id === id);
};

/**
 * Get withdrawal details by ID
 * @param {string} id - Withdrawal ID
 * @returns {Promise<Object>} - Withdrawal details
 */
BinanceDashboardUI.prototype.getWithdrawalDetails = async function(id) {
    // For the prototype, find withdrawal in already loaded data
    const withdrawals = await this.binanceApi.getWithdrawals();
    return withdrawals.find(w => w.id === id);
};

/**
 * Get payment request details by ID
 * @param {string} id - Payment request ID
 * @returns {Promise<Object>} - Payment request details
 */
BinanceDashboardUI.prototype.getPaymentRequestDetails = async function(id) {
    // For the prototype, find payment request in already loaded data
    const paymentRequests = await this.binanceApi.getPaymentRequests();
    return paymentRequests.find(p => p.id === id);
};

/**
 * Display transaction details in modal
 * @param {string} type - Transaction type
 * @param {Object} transaction - Transaction object
 */
BinanceDashboardUI.prototype.displayTransactionDetails = function(type, transaction) {
    // Determine transaction status and class
    const status = getTransactionStatus(transaction);
    const statusClass = getStatusClass(status);
    
    // Get timestamp based on transaction type
    let timestamp;
    if (type === 'deposit') {
        timestamp = transaction.insertTime;
    } else if (type === 'withdrawal') {
        timestamp = transaction.applyTime;
    } else if (type === 'payment') {
        timestamp = transaction.createdAt || transaction.createTime;
    }
    
    const formattedTime = formatTimestamp(timestamp);
    
    // Get transaction ID based on type
    const txId = type === 'deposit' ? transaction.txId : transaction.id;
    
    // Generate HTML for transaction details
    let html = `
        <div class="card mb-3">
            <div class="card-header bg-primary text-white">
                <h5 class="card-title mb-0">
                    ${type.charAt(0).toUpperCase() + type.slice(1)} Details
                </h5>
            </div>
            <div class="card-body">
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Status:</div>
                    <div class="col-md-8">
                        <span class="badge bg-${statusClass}">${status}</span>
                    </div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Transaction ID:</div>
                    <div class="col-md-8">${txId || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Asset:</div>
                    <div class="col-md-8">${transaction.coin || transaction.asset || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Amount:</div>
                    <div class="col-md-8">
                        ${formatCryptoAmount(transaction.amount, transaction.coin || transaction.asset)}
                        ${transaction.coin || transaction.asset || ''}
                    </div>
                </div>
    `;
    
    // Add transaction-specific fields
    if (type === 'deposit') {
        html += `
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Network:</div>
                    <div class="col-md-8">${transaction.network || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Address:</div>
                    <div class="col-md-8">${transaction.address || 'N/A'}</div>
                </div>
        `;
    } else if (type === 'withdrawal') {
        html += `
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Network:</div>
                    <div class="col-md-8">${transaction.network || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Address:</div>
                    <div class="col-md-8">${transaction.address || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Fee:</div>
                    <div class="col-md-8">
                        ${transaction.transactionFee ? formatCryptoAmount(transaction.transactionFee, transaction.coin) : 'N/A'}
                        ${transaction.transactionFee ? transaction.coin : ''}
                    </div>
                </div>
        `;
    } else if (type === 'payment') {
        html += `
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Description:</div>
                    <div class="col-md-8">${transaction.description || 'N/A'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Customer:</div>
                    <div class="col-md-8">${transaction.customer?.name || 'Anonymous'}</div>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Customer Email:</div>
                    <div class="col-md-8">${transaction.customer?.email || 'N/A'}</div>
                </div>
        `;
    }
    
    // Add timestamp to all transaction types
    html += `
                <div class="row mb-3">
                    <div class="col-md-4 fw-bold">Date & Time:</div>
                    <div class="col-md-8">${formattedTime}</div>
                </div>
            </div>
        </div>
    `;
    
    this.transactionDetailsContent.innerHTML = html;
};

/**
 * Refresh data
 */
BinanceDashboardUI.prototype.refreshData = async function() {
    try {
        // Check connection first
        const isConnected = await this.checkConnection();
        
        if (!isConnected) {
            return;
        }
        
        // Load data based on current tab
        switch (this.currentTab) {
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
    } catch (error) {
        console.error('Error refreshing data:', error);
        alert(`Error refreshing data: ${error.message || 'Unknown error'}`);
    }
};
