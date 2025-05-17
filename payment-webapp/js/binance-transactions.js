/**
 * Binance Dashboard UI Transactions
 * Handles transaction-related functionality for the Binance dashboard
 */

// Extends BinanceDashboardUI with transaction methods
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
            const statusClass = {
                'completed': 'success',
                'pending': 'warning',
                'expired': 'secondary',
                'cancelled': 'danger'
            }[status.toLowerCase()] || 'info';
            
            const createdAt = request.createdAt || request.createTime || Date.now();
            const formattedTime = formatTimestamp(createdAt);
            
            requestsHtml += `
                <tr>
                    <td>${request.id || '-'}</td>
                    <td>${request.asset || request.coin || '-'}</td>
                    <td>${formatCryptoAmount(request.amount, request.asset)}</td>
                    <td><span class="badge bg-${statusClass}">${status}</span></td>
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
                <td><span class="badge bg-${statusClass}">${status}</span></td>
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
                <td><span class="badge bg-${statusClass}">${status}</span></td>
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
                <td><span class="badge bg-${statusClass}">${status}</span></td>
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
