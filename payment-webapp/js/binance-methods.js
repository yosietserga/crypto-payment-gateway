/**
 * Binance Dashboard UI Extensions
 * Transaction loading and form handling methods
 */

// Add transaction loading methods to BinanceDashboardUI prototype
BinanceDashboardUI.prototype.loadTransactions = async function() {
    try {
        // Show loading indicators for all transaction tables
        this.showTransactionLoaders();
        
        // Fetch all transaction types
        const [deposits, withdrawals] = await Promise.all([
            this.binanceApi.getDeposits(),
            this.binanceApi.getWithdrawals()
        ]);
        
        // Hide loading indicators
        this.hideTransactionLoaders();
        
        // Update all transactions table (combined view)
        const allTransactions = [...deposits, ...withdrawals];
        this.displayAllTransactions(allTransactions);
        
        // Update deposits table
        this.displayDeposits(deposits);
        
        // Update withdrawals table
        this.displayWithdrawals(withdrawals);
        
        // Update dashboard metrics if on dashboard tab
        if (this.currentTab === 'dashboard') {
            this.updateLastTransactionInfo(allTransactions);
        }
        
        return allTransactions;
        
    } catch (error) {
        console.error('Error loading transactions:', error);
        this.hideTransactionLoaders();
        this.displayTransactionError(error.message || 'Unknown error loading transactions');
        return [];
    }
};

/**
 * Load payment requests for the Payments tab
 */
BinanceDashboardUI.prototype.loadPaymentRequests = async function() {
    if (!this.paymentRequestsTable) return;
    
    try {
        // Show loading indicator
        this.paymentRequestsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border spinner-border-sm" role="status">
                        <span class="visually-hidden">Loading payment requests...</span>
                    </div>
                    <span class="ms-2">Loading payment requests...</span>
                </td>
            </tr>
        `;
        
        // Fetch payment requests from API
        const paymentRequests = await this.binanceApi.getPaymentRequests();
        
        if (!paymentRequests || paymentRequests.length === 0) {
            this.paymentRequestsTable.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3">
                        <div class="alert alert-info mb-0">
                            <i class="bi bi-info-circle me-2"></i> No payment requests found.
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Sort by creation time (newest first)
        paymentRequests.sort((a, b) => {
            const aTime = a.createdAt || a.createTime || 0;
            const bTime = b.createdAt || b.createTime || 0;
            return bTime - aTime;
        });
        
        let requestsHtml = '';
        
        paymentRequests.forEach(request => {
            const status = request.status || 'pending';
            const statusClass = getStatusClass(status);
            
            const createdAt = request.createdAt || request.createTime || Date.now();
            const formattedTime = formatTimestamp(createdAt);
            
            requestsHtml += `
                <tr>
                    <td>${request.id || '-'}</td>
                    <td>${request.asset || request.coin || '-'}</td>
                    <td>${formatCryptoAmount(request.amount, request.asset)}</td>
                    <td><span class="badge ${statusClass}">${status}</span></td>
                    <td>${formattedTime}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary view-transaction-btn" data-type="payment" data-id="${request.id || ''}">
                            <i class="bi bi-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        this.paymentRequestsTable.innerHTML = requestsHtml;
        
    } catch (error) {
        console.error('Error loading payment requests:', error);
        this.paymentRequestsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-3">
                    <div class="alert alert-danger mb-0">
                        <i class="bi bi-exclamation-triangle me-2"></i> Error loading payment requests: ${error.message || 'Unknown error'}
                    </div>
                </td>
            </tr>
        `;
    }
};

/**
 * Load detailed wallet balances for Wallet tab
 */
BinanceDashboardUI.prototype.loadDetailedWalletBalances = async function() {
    if (!this.walletBalancesContainer) return;
    
    try {
        this.walletBalancesContainer.innerHTML = `
            <div class="col-12 text-center py-4">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Loading wallet data...</span>
                </div>
                <p class="mt-2">Loading wallet data...</p>
            </div>
        `;
        
        const balances = await this.binanceApi.getBalances();
        
        if (!balances || balances.length === 0) {
            this.walletBalancesContainer.innerHTML = `
                <div class="col-12 text-center py-4">
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle me-2"></i> No balances found in your Binance wallet.
                    </div>
                </div>
            `;
            return;
        }
        
        // Sort balances by value (descending)
        balances.sort((a, b) => parseFloat(b.fiatValue || 0) - parseFloat(a.fiatValue || 0));
        
        let balancesHtml = '';
        
        balances.forEach(balance => {
            if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
                const total = parseFloat(balance.free) + parseFloat(balance.locked);
                balancesHtml += `
                    <div class="col-md-4 mb-4">
                        <div class="card h-100">
                            <div class="card-body">
                                <div class="d-flex align-items-center mb-3">
                                    <div class="currency-icon me-2">${getCurrencyIcon(balance.asset)}</div>
                                    <h5 class="card-title mb-0">${balance.asset}</h5>
                                </div>
                                <div class="balance-detail mb-2">
                                    <span class="balance-label">Total:</span>
                                    <span class="balance-value">${formatCryptoAmount(total, balance.asset)} ${balance.asset}</span>
                                </div>
                                <div class="balance-detail mb-2">
                                    <span class="balance-label">Available:</span>
                                    <span class="balance-value">${formatCryptoAmount(balance.free, balance.asset)} ${balance.asset}</span>
                                </div>
                                <div class="balance-detail mb-2">
                                    <span class="balance-label">Locked:</span>
                                    <span class="balance-value">${formatCryptoAmount(balance.locked, balance.asset)} ${balance.asset}</span>
                                </div>
                                ${balance.fiatValue ? `
                                <div class="balance-detail">
                                    <span class="balance-label">Est. Value:</span>
                                    <span class="balance-value">$${parseFloat(balance.fiatValue).toFixed(2)} USD</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        this.walletBalancesContainer.innerHTML = balancesHtml || `
            <div class="col-12 text-center py-4">
                <div class="alert alert-info">
                    <i class="bi bi-info-circle me-2"></i> No balances found in your Binance wallet.
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading detailed wallet balances:', error);
        this.walletBalancesContainer.innerHTML = `
            <div class="col-12 text-center py-4">
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i> Error loading wallet balances: ${error.message}
                </div>
            </div>
        `;
    }
};

/**
 * Show loading indicators for transaction tables
 */
BinanceDashboardUI.prototype.showTransactionLoaders = function() {
    const loadingHtml = `
        <tr>
            <td colspan="6" class="text-center py-3">
                <div class="spinner-border spinner-border-sm" role="status">
                    <span class="visually-hidden">Loading transactions...</span>
                </div>
                <span class="ms-2">Loading transactions...</span>
            </td>
        </tr>
    `;
    
    if (this.allTransactionsTable) {
        this.allTransactionsTable.innerHTML = loadingHtml;
    }
    
    if (this.depositsTable) {
        this.depositsTable.innerHTML = loadingHtml;
    }
    
    if (this.withdrawalsTable) {
        this.withdrawalsTable.innerHTML = loadingHtml;
    }
};

/**
 * Hide loading indicators for transaction tables
 */
BinanceDashboardUI.prototype.hideTransactionLoaders = function() {
    // This method will be called after data is loaded,
    // so we don't need to do anything here as the tables
    // will be populated with data or error messages
};

/**
 * Display transaction error in all tables
 * @param {string} errorMessage - Error message to display
 */
BinanceDashboardUI.prototype.displayTransactionError = function(errorMessage) {
    const errorHtml = `
        <tr>
            <td colspan="6" class="text-center py-3">
                <div class="alert alert-danger mb-0">
                    <i class="bi bi-exclamation-triangle me-2"></i> ${errorMessage}
                </div>
            </td>
        </tr>
    `;
    
    if (this.allTransactionsTable) {
        this.allTransactionsTable.innerHTML = errorHtml;
    }
    
    if (this.depositsTable) {
        this.depositsTable.innerHTML = errorHtml;
    }
    
    if (this.withdrawalsTable) {
        this.withdrawalsTable.innerHTML = errorHtml;
    }
};

/**
 * Display all transactions in the combined table
 * @param {Array} transactions - Combined array of transactions
 */
BinanceDashboardUI.prototype.displayAllTransactions = function(transactions) {
    if (!this.allTransactionsTable) return;
    
    if (!transactions || transactions.length === 0) {
        this.allTransactionsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-3">
                    <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle me-2"></i> No transactions found.
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort by timestamp (newest first)
    transactions.sort((a, b) => {
        const aTime = a.insertTime || a.applyTime || a.time || 0;
        const bTime = b.insertTime || b.applyTime || b.time || 0;
        return bTime - aTime;
    });
    
    let transactionsHtml = '';
    
    transactions.forEach(tx => {
        const isDeposit = tx.type === 'deposit' || tx.status === 0 || tx.status === 1 || !!tx.txId;
        const type = isDeposit ? 'Deposit' : 'Withdrawal';
        const typeClass = isDeposit ? 'success' : 'warning';
        
        const status = getTransactionStatus(tx);
        const statusClass = getStatusClass(status);
        
        const timestamp = tx.insertTime || tx.applyTime || tx.time || Date.now();
        const formattedTime = formatTimestamp(timestamp);
        
        transactionsHtml += `
            <tr>
                <td>
                    <span class="badge bg-${typeClass}">${type}</span>
                </td>
                <td>${tx.coin || tx.asset || '-'}</td>
                <td>${formatCryptoAmount(tx.amount, tx.coin)}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>${formattedTime}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-transaction-btn" data-type="${isDeposit ? 'deposit' : 'withdrawal'}" data-id="${tx.id || tx.txId || ''}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    this.allTransactionsTable.innerHTML = transactionsHtml;
};

/**
 * Display deposits in the deposits table
 * @param {Array} deposits - Array of deposit transactions
 */
BinanceDashboardUI.prototype.displayDeposits = function(deposits) {
    if (!this.depositsTable) return;
    
    if (!deposits || deposits.length === 0) {
        this.depositsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-3">
                    <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle me-2"></i> No deposits found.
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort by insertTime (newest first)
    deposits.sort((a, b) => (b.insertTime || 0) - (a.insertTime || 0));
    
    let depositsHtml = '';
    
    deposits.forEach(deposit => {
        const status = getTransactionStatus(deposit);
        const statusClass = getStatusClass(status);
        
        const timestamp = deposit.insertTime || Date.now();
        const formattedTime = formatTimestamp(timestamp);
        
        depositsHtml += `
            <tr>
                <td>${deposit.txId || '-'}</td>
                <td>${deposit.coin || '-'}</td>
                <td>${formatCryptoAmount(deposit.amount, deposit.coin)}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>${formattedTime}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-transaction-btn" data-type="deposit" data-id="${deposit.txId || ''}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    this.depositsTable.innerHTML = depositsHtml;
};

/**
 * Display withdrawals in the withdrawals table
 * @param {Array} withdrawals - Array of withdrawal transactions
 */
BinanceDashboardUI.prototype.displayWithdrawals = function(withdrawals) {
    if (!this.withdrawalsTable) return;
    
    if (!withdrawals || withdrawals.length === 0) {
        this.withdrawalsTable.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-3">
                    <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle me-2"></i> No withdrawals found.
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort by applyTime (newest first)
    withdrawals.sort((a, b) => (b.applyTime || 0) - (a.applyTime || 0));
    
    let withdrawalsHtml = '';
    
    withdrawals.forEach(withdrawal => {
        const status = getTransactionStatus(withdrawal);
        const statusClass = getStatusClass(status);
        
        const timestamp = withdrawal.applyTime || Date.now();
        const formattedTime = formatTimestamp(timestamp);
        
        withdrawalsHtml += `
            <tr>
                <td>${withdrawal.id || '-'}</td>
                <td>${withdrawal.coin || withdrawal.asset || '-'}</td>
                <td>${formatCryptoAmount(withdrawal.amount, withdrawal.coin)}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>${formattedTime}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-transaction-btn" data-type="withdrawal" data-id="${withdrawal.id || ''}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    this.withdrawalsTable.innerHTML = withdrawalsHtml;
};

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
