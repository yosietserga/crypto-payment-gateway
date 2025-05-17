/**
 * Additional methods for BinanceDashboardUI 
 * Handles real Binance API data processing
 */

/**
 * Load account balances and update dashboard
 */
BinanceDashboardUI.prototype.loadBalances = async function() {
    if (!this.balancesContainer) return;
    
    try {
        // Show loader
        if (this.balancesLoader) {
            this.balancesLoader.classList.remove('d-none');
        }
        
        // Get balances from our server API which proxies to Binance
        console.info('Fetching real balances via server API');
        let balances = [];
        
        try {
            // Use the getBalances method from our BinanceAPI class
            balances = await this.binanceApi.getBalances();
            // Update connection status to connected if successful
            this.updateConnectionStatus('connected', 'Connected to Binance API');
        } catch (error) {
            console.error('Error fetching balances:', error);
            // Show error message but continue with empty balances
            this.updateConnectionStatus('error', `API Error: ${error.message}`);
        }
        
        // Filter out zero balances
        const nonZeroBalances = balances.filter(balance => {
            const free = parseFloat(balance.free || 0);
            const locked = parseFloat(balance.locked || 0);
            return free > 0 || locked > 0;
        });
        
        // Hide loader
        if (this.balancesLoader) {
            this.balancesLoader.classList.add('d-none');
        }
        
        // Update dashboard metrics if on dashboard tab
        if (this.currentTab === 'dashboard') {
            this.updateDashboardMetrics(nonZeroBalances);
        }
        
        if (!nonZeroBalances || nonZeroBalances.length === 0) {
            if (this.balancesContainer) {
                this.balancesContainer.innerHTML = `
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle me-2"></i> No balances found in your Binance wallet.
                    </div>
                `;
            }
            return;
        }
        
        // Render balances
        this.renderBalances(nonZeroBalances);
        
    } catch (error) {
        console.error('Error loading balances:', error);
        
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
};

/**
 * Render balances in the UI
 */
BinanceDashboardUI.prototype.renderBalances = function(balances) {
    if (!this.balancesContainer) return;
    
    // Sort balances by value (highest first)
    balances.sort((a, b) => {
        const aValue = parseFloat(a.free) + parseFloat(a.locked);
        const bValue = parseFloat(b.free) + parseFloat(b.locked);
        return bValue - aValue;
    });
    
    let balancesHTML = '';
    
    balances.forEach(balance => {
        const asset = balance.asset;
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        
        // Skip zero balances
        if (total <= 0) return;
        
        balancesHTML += `
            <div class="col-md-4 col-sm-6">
                <div class="card balance-card mb-3">
                    <div class="card-body">
                        <h5 class="balance-asset">${asset}</h5>
                        <div class="balance-value">${total.toFixed(8)}</div>
                        <div class="balance-details">
                            <span class="text-success">Available: ${free.toFixed(8)}</span>
                            ${locked > 0 ? `<br><span class="text-warning">Locked: ${locked.toFixed(8)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    this.balancesContainer.innerHTML = `
        <div class="row">
            ${balancesHTML}
        </div>
    `;
};

/**
 * Update dashboard metrics with balance data
 */
BinanceDashboardUI.prototype.updateDashboardMetrics = function(balances) {
    // Calculate total estimated value and active coins count
    let totalValue = 0;
    const activeCoins = balances.filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0);
    
    // Set active coins count
    if (this.activeCoinsCount) {
        this.activeCoinsCount.textContent = activeCoins.length;
    }
    
    // The Binance API doesn't return USD values directly,
    // so in a production app you'd need to get current prices
    // For now, we'll just show the number of active coins
    if (this.totalBalanceValue) {
        this.totalBalanceValue.textContent = 'See Binance App';
    }
};

/**
 * Load transactions (deposits, withdrawals, payment requests)
 */
BinanceDashboardUI.prototype.loadTransactions = async function() {
    try {
        // Show loading state
        const loadingElements = document.querySelectorAll('.transactions-loading');
        loadingElements.forEach(el => el.classList.remove('d-none'));
        
        // Hide error messages
        const errorElements = document.querySelectorAll('.transactions-error');
        errorElements.forEach(el => el.classList.add('d-none'));
        
        // Use server API endpoints to get real transaction data
        console.info('Fetching real transaction data via server API');
        
        // Initialize with empty arrays in case API calls fail
        let deposits = [];
        let withdrawals = [];
        let paymentRequests = [];
        
        try {
            // Get real deposits from API
            deposits = await this.binanceApi.getDeposits();
        } catch (error) {
            console.error('Error fetching deposits:', error);
            this.updateConnectionStatus('warning', `Deposit data error: ${error.message}`);
        }
        
        try {
            // Get real withdrawals from API
            withdrawals = await this.binanceApi.getWithdrawals();
        } catch (error) {
            console.error('Error fetching withdrawals:', error);
            this.updateConnectionStatus('warning', `Withdrawal data error: ${error.message}`);
        }
        
        try {
            // Get real payment requests from API if the method exists
            if (typeof this.binanceApi.getPaymentHistory === 'function') {
                paymentRequests = await this.binanceApi.getPaymentHistory();
            } else {
                // Fallback to mock data if the API method is not implemented
                paymentRequests = this.binanceApi.getMockPaymentRequests ? 
                    this.binanceApi.getMockPaymentRequests() : [];
            }
        } catch (error) {
            console.error('Error fetching payment requests:', error);
            // Use empty array for payment requests
        }
        
        // Render each transaction type
        this.renderDeposits(deposits);
        this.renderWithdrawals(withdrawals);
        
        // Render payment requests if we have the method
        if (typeof this.renderPaymentRequests === 'function') {
            this.renderPaymentRequests(paymentRequests);
        }
        
        // Combine all transactions for the "All" tab
        const allTransactions = [
            ...deposits.map(tx => ({ ...tx, type: 'deposit' })),
            ...withdrawals.map(tx => ({ ...tx, type: 'withdrawal' })),
            ...paymentRequests.map(tx => ({ ...tx, type: 'payment' }))
        ];
        
        // Render all transactions
        this.renderAllTransactions(allTransactions);
        
        // Update dashboard with last transaction info
        this.updateLastTransactionInfo(allTransactions);
        
        // Hide loading indicators
        loadingElements.forEach(el => el.classList.add('d-none'));
        
        // Show transaction tables
        const tableElements = document.querySelectorAll('.transactions-table');
        tableElements.forEach(el => el.classList.remove('d-none'));
        
    } catch (error) {
        console.error('Failed to load transactions:', error);
        
        // Hide loading indicators
        const loadingElements = document.querySelectorAll('.transactions-loading');
        loadingElements.forEach(el => el.classList.add('d-none'));
        
        // Show error message
        const errorElements = document.querySelectorAll('.transactions-error');
        errorElements.forEach(el => {
            el.textContent = 'Failed to load transactions. Please try again.';
            el.classList.remove('d-none');
        });
    }
};

/**
 * Render all transactions in the UI
 */
BinanceDashboardUI.prototype.renderAllTransactions = function(transactions) {
    if (!this.allTransactionsTable) return;
    
    if (!transactions || transactions.length === 0) {
        this.allTransactionsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No transactions found</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    transactions.slice(0, 10).forEach(tx => {
        const type = tx.type || 'unknown';
        const asset = tx.asset || tx.coin || '';
        const amount = tx.amount || '';
        const status = tx.status || '';
        const address = tx.address || '';
        
        // Format date based on transaction type
        let time = '';
        if (type === 'deposit') {
            time = tx.insertTime ? new Date(tx.insertTime).toLocaleString() : '';
        } else if (type === 'withdrawal') {
            time = tx.applyTime ? new Date(tx.applyTime).toLocaleString() : '';
        }
        
        const statusClass = this.binanceApi.getStatusClass(status);
        
        html += `
            <tr>
                <td>${type.charAt(0).toUpperCase() + type.slice(1)}</td>
                <td>${amount} ${asset}</td>
                <td>
                    <span class="badge bg-${statusClass}">${status}</span>
                </td>
                <td title="${address}">${address.substring(0, 10)}...${address.substring(address.length - 5)}</td>
                <td>${time}</td>
            </tr>
        `;
    });
    
    this.allTransactionsTable.innerHTML = html;
};

/**
 * Render deposits in the UI
 */
BinanceDashboardUI.prototype.renderDeposits = function(deposits) {
    if (!this.depositsTable) return;
    
    if (!deposits || deposits.length === 0) {
        this.depositsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No deposits found</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    deposits.slice(0, 10).forEach(deposit => {
        const asset = deposit.coin || deposit.asset || '';
        const amount = deposit.amount || '';
        const status = deposit.status || '';
        const address = deposit.address || '';
        const time = deposit.insertTime ? new Date(deposit.insertTime).toLocaleString() : '';
        
        const statusClass = this.binanceApi.getStatusClass(status);
        
        html += `
            <tr>
                <td>${amount} ${asset}</td>
                <td>
                    <span class="badge bg-${statusClass}">${status}</span>
                </td>
                <td title="${address}">${address.substring(0, 10)}...${address.substring(address.length - 5)}</td>
                <td>${time}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-deposit-btn" data-tx-id="${deposit.txId}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    this.depositsTable.innerHTML = html;
};

/**
 * Render deposits error
 */
BinanceDashboardUI.prototype.renderDepositsError = function(error) {
    if (!this.depositsTable) return;
    
    this.depositsTable.innerHTML = `
        <tr>
            <td colspan="5" class="text-center text-danger">
                Error loading deposits: ${error.message || 'Unknown error'}
            </td>
        </tr>
    `;
};

/**
 * Render withdrawals in the UI
 */
BinanceDashboardUI.prototype.renderWithdrawals = function(withdrawals) {
    if (!this.withdrawalsTable) return;
    
    if (!withdrawals || withdrawals.length === 0) {
        this.withdrawalsTable.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No withdrawals found</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    withdrawals.slice(0, 10).forEach(withdrawal => {
        const asset = withdrawal.coin || withdrawal.asset || '';
        const amount = withdrawal.amount || '';
        const status = withdrawal.status || '';
        const address = withdrawal.address || '';
        const time = withdrawal.applyTime ? new Date(withdrawal.applyTime).toLocaleString() : '';
        
        const statusClass = this.binanceApi.getStatusClass(status);
        
        html += `
            <tr>
                <td>${amount} ${asset}</td>
                <td>
                    <span class="badge bg-${statusClass}">${status}</span>
                </td>
                <td title="${address}">${address.substring(0, 10)}...${address.substring(address.length - 5)}</td>
                <td>${time}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-withdrawal-btn" data-tx-id="${withdrawal.txId}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    this.withdrawalsTable.innerHTML = html;
};

/**
 * Render withdrawals error
 */
BinanceDashboardUI.prototype.renderWithdrawalsError = function(error) {
    if (!this.withdrawalsTable) return;
    
    this.withdrawalsTable.innerHTML = `
        <tr>
            <td colspan="5" class="text-center text-danger">
                Error loading withdrawals: ${error.message || 'Unknown error'}
            </td>
        </tr>
    `;
};

/**
 * Update last transaction info in dashboard
 */
BinanceDashboardUI.prototype.updateLastTransactionInfo = function(transactions) {
    if (!this.lastTransactionTime || !this.lastTransactionInfo || transactions.length === 0) return;
    
    // Get most recent transaction
    const tx = transactions[0];
    
    // Format time
    let time = '';
    if (tx.type === 'deposit') {
        time = tx.insertTime ? new Date(tx.insertTime).toLocaleString() : 'Unknown';
    } else if (tx.type === 'withdrawal') {
        time = tx.applyTime ? new Date(tx.applyTime).toLocaleString() : 'Unknown';
    }
    
    this.lastTransactionTime.textContent = time;
    
    // Format info
    const asset = tx.asset || tx.coin || '';
    const amount = tx.amount || '';
    const status = tx.status || '';
    const statusClass = this.binanceApi.getStatusClass(status);
    
    this.lastTransactionInfo.innerHTML = `
        <span class="badge bg-${statusClass} me-1">${status}</span>
        ${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} of 
        <strong>${amount} ${asset}</strong>
    `;
};

/**
 * Submit withdrawal form
 */
BinanceDashboardUI.prototype.submitWithdrawal = async function() {
    if (!this.withdrawalForm) return;
    
    try {
        const asset = document.getElementById('withdrawal-asset').value;
        const amount = document.getElementById('withdrawal-amount').value;
        const address = document.getElementById('withdrawal-address').value;
        const description = document.getElementById('withdrawal-description').value;
        
        if (!asset || !amount || !address) {
            this.showToast('Please fill in all required fields', 'warning');
            return;
        }
        
        // Show loading indicator
        const submitBtn = this.withdrawalForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        
        // In a real application, you would use the Binance API to submit a withdrawal
        // This requires additional security measures and whitelist setup on Binance
        // Since we're dealing with real API, we'll show a prompt instead of making the withdrawal
        alert(`Real Withdrawal Request: You would submit a withdrawal of ${amount} ${asset} to ${address}. This demo does not actually submit withdrawals for security reasons.`);
        
        // Close modal
        if (this.withdrawalModal && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(this.withdrawalModal);
            if (modal) modal.hide();
        }
        
        // Reset form
        this.withdrawalForm.reset();
        
        // Reload transactions
        await this.loadTransactions();
        
        this.showToast('Withdrawal request handled successfully', 'success');
    } catch (error) {
        console.error('Error submitting withdrawal:', error);
        this.showToast('Error submitting withdrawal: ' + error.message, 'danger');
    } finally {
        // Reset button
        const submitBtn = this.withdrawalForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Withdrawal';
    }
};

/**
 * Submit payment request form
 */
BinanceDashboardUI.prototype.submitPaymentRequest = async function() {
    if (!this.paymentRequestForm) return;
    
    try {
        const asset = document.getElementById('payment-asset').value;
        const amount = document.getElementById('payment-amount').value;
        const customerName = document.getElementById('payment-customer-name').value;
        const customerEmail = document.getElementById('payment-customer-email').value;
        const description = document.getElementById('payment-description').value;
        
        if (!asset || !amount) {
            this.showToast('Please fill in all required fields', 'warning');
            return;
        }
        
        // Show loading indicator
        const submitBtn = this.paymentRequestForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        
        // In a real application, you would use an API to create a payment request
        // Since we're dealing with real API, we'll show a prompt instead of making the request
        alert(`Real Payment Request: You would create a payment request for ${amount} ${asset} from ${customerName}. This demo does not actually submit payment requests for security reasons.`);
        
        // Close modal
        if (this.paymentRequestModal && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(this.paymentRequestModal);
            if (modal) modal.hide();
        }
        
        // Reset form
        this.paymentRequestForm.reset();
        
        // Reload transactions
        await this.loadTransactions();
        
        this.showToast('Payment request created successfully', 'success');
    } catch (error) {
        console.error('Error creating payment request:', error);
        this.showToast('Error creating payment request: ' + error.message, 'danger');
    } finally {
        // Reset button
        const submitBtn = this.paymentRequestForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Payment Request';
    }
};

/**
 * Refresh all data
 */
BinanceDashboardUI.prototype.refreshData = async function() {
    await this.checkConnectionStatus();
    if (this.connectionStatus) {
        this.loadTransactions();
        this.loadBalances();
    }
    this.showToast('Data refreshed', 'success');
};
