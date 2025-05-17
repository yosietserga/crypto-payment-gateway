/**
 * Binance Dashboard Integration
 * Handles fetching and displaying Binance wallet data, transactions, deposits, and withdrawals
 */

// Configuration
const binanceConfig = {
    apiBaseUrl: window.location.hostname === 'localhost' ? 'http://localhost:3000/api/v1' : '/api/v1',
    refreshInterval: 60000, // 1 minute refresh interval
    statusRefreshInterval: 30000 // 30 seconds for status checks
};

// State management
const binanceState = {
    connectionStatus: 'unknown', // unknown, connected, disconnected
    balances: [],
    deposits: [],
    withdrawals: [],
    transactions: [],
    refreshTimer: null,
    statusTimer: null
};

// DOM Elements
const binanceElements = {
    // Connection status
    connectionStatus: document.getElementById('connectionStatus'),
    connectionStatusIndicator: document.getElementById('connection-status-indicator'),
    connectionStatusMessage: document.getElementById('connection-status-message'),
    configureBinanceBtn: document.getElementById('configure-binance-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    
    // Balances
    walletBalances: document.getElementById('wallet-balances'),
    balancesLoader: document.getElementById('balances-loader'),
    
    // Transaction tabs
    transactionTabs: document.getElementById('transactions-tabs'),
    allTransactionsTab: document.getElementById('all-tab'),
    depositsTab: document.getElementById('deposits-tab'),
    withdrawalsTab: document.getElementById('withdrawals-tab'),
    
    // Transaction tables
    allTransactionsTable: document.getElementById('all-transactions'),
    allTransactionsTableBody: document.getElementById('all-transactions-body'),
    depositsTable: document.getElementById('deposits'),
    depositsTableBody: document.getElementById('deposits-body'),
    withdrawalsTable: document.getElementById('withdrawals'),
    withdrawalsTableBody: document.getElementById('withdrawals-body')
};

/**
 * Initialize the Binance dashboard
 */
function initBinanceDashboard() {
    // Set up event listeners
    if (binanceElements.refreshBtn) {
        binanceElements.refreshBtn.addEventListener('click', refreshAllData);
    }
    
    if (binanceElements.configureBinanceBtn) {
        binanceElements.configureBinanceBtn.addEventListener('click', navigateToSettings);
    }
    
    // Initial data load
    checkConnectionStatus();
    loadBalances();
    loadTransactions();
    
    // Set up refresh timers
    startRefreshTimers();
}

/**
 * Start automatic refresh timers
 */
function startRefreshTimers() {
    // Clear any existing timers
    if (binanceState.refreshTimer) {
        clearInterval(binanceState.refreshTimer);
    }
    
    if (binanceState.statusTimer) {
        clearInterval(binanceState.statusTimer);
    }
    
    // Set new timers
    binanceState.statusTimer = setInterval(checkConnectionStatus, binanceConfig.statusRefreshInterval);
    binanceState.refreshTimer = setInterval(refreshAllData, binanceConfig.refreshInterval);
}

/**
 * Navigate to settings page
 */
function navigateToSettings() {
    window.location.href = 'settings.html#binance-settings';
}

/**
 * Refresh all dashboard data
 */
function refreshAllData() {
    checkConnectionStatus();
    loadBalances();
    loadTransactions();
}

/**
 * Check Binance API connection status
 */
async function checkConnectionStatus() {
    try {
        const response = await fetch(`${binanceConfig.apiBaseUrl}/binance/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.connected) {
            updateConnectionStatus('connected', 'Binance API connected successfully');
        } else {
            updateConnectionStatus('disconnected', data.message || 'Binance API connection failed');
        }
    } catch (error) {
        console.error('Error checking Binance connection:', error);
        updateConnectionStatus('disconnected', 'Could not connect to Binance API');
    }
}

/**
 * Update the connection status UI
 */
function updateConnectionStatus(status, message) {
    binanceState.connectionStatus = status;
    
    if (binanceElements.connectionStatusIndicator) {
        binanceElements.connectionStatusIndicator.className = 'connection-indicator';
        binanceElements.connectionStatusIndicator.classList.add(`connection-${status}`);
    }
    
    if (binanceElements.connectionStatusMessage) {
        binanceElements.connectionStatusMessage.textContent = message;
    }
    
    if (binanceElements.connectionStatus) {
        const statusIndicator = binanceElements.connectionStatus.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator';
            statusIndicator.classList.add(`status-${status}`);
        }
        
        const statusText = binanceElements.connectionStatus.querySelector('span:not(.status-indicator)');
        if (statusText) {
            statusText.textContent = status === 'connected' ? 'Connected to Binance API' : 'Disconnected from Binance API';
        }
    }
}

/**
 * Load wallet balances
 */
async function loadBalances() {
    if (!binanceElements.walletBalances) return;
    
    try {
        // Show loader
        if (binanceElements.balancesLoader) {
            binanceElements.balancesLoader.classList.remove('d-none');
        }
        
        const response = await fetch(`${binanceConfig.apiBaseUrl}/binance/balances?includeZero=false`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
    console.log(response);        throw new Error('Failed to fetch balances');
        }
        
        const balances = await response.json();
        binanceState.balances = balances;
        
        renderBalances(balances);
    } catch (error) {
        console.error('Error loading balances:', error);
        binanceElements.walletBalances.innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    Failed to load balances: ${error.message}
                </div>
            </div>
        `;
    } finally {
        // Hide loader
        if (binanceElements.balancesLoader) {
            binanceElements.balancesLoader.classList.add('d-none');
        }
    }
}

/**
 * Render wallet balances
 */
function renderBalances(balances) {
    if (!binanceElements.walletBalances) return;
    
    if (balances.length === 0) {
        binanceElements.walletBalances.innerHTML = `
            <div class="col-12">
                <p class="text-center text-muted my-5">No balances found</p>
            </div>
        `;
        return;
    }
    
    // Sort balances by total value (descending)
    balances.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
    
    let balancesHtml = '';
    
    balances.forEach(balance => {
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = parseFloat(balance.total);
        
        if (total > 0) {
            balancesHtml += `
                <div class="col-md-3 col-sm-6">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h5 class="card-title">${balance.asset}</h5>
                            <h3 class="mb-3">${total.toFixed(8)}</h3>
                            <div class="row g-2">
                                <div class="col-6">
                                    <div class="small text-muted">Available</div>
                                    <div>${free.toFixed(8)}</div>
                                </div>
                                <div class="col-6">
                                    <div class="small text-muted">Locked</div>
                                    <div>${locked.toFixed(8)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    binanceElements.walletBalances.innerHTML = balancesHtml;
}

/**
 * Load all transactions (deposits and withdrawals)
 */
async function loadTransactions() {
    await Promise.all([
        loadDeposits(),
        loadWithdrawals()
    ]);
    
    // Combine deposits and withdrawals for all transactions view
    combineTransactions();
}

/**
 * Load deposit history
 */
async function loadDeposits() {
    if (!binanceElements.depositsTableBody) return;
    
    try {
        binanceElements.depositsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center p-3">
                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Loading deposits...</span>
                </td>
            </tr>
        `;
        
        const response = await fetch(`${binanceConfig.apiBaseUrl}/binance/deposits`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
    console.log(response);        throw new Error('Failed to fetch deposits');
        }
        
        const deposits = await response.json();
        binanceState.deposits = deposits;
        
        renderDeposits(deposits);
    } catch (error) {
        console.error('Error loading deposits:', error);
        binanceElements.depositsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    Failed to load deposits: ${error.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Render deposits table
 */
function renderDeposits(deposits) {
    if (!binanceElements.depositsTableBody) return;
    
    if (deposits.length === 0) {
        binanceElements.depositsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted p-3">
                    No deposit transactions found
                </td>
            </tr>
        `;
        return;
    }
    
    let depositsHtml = '';
    
    deposits.forEach(deposit => {
        const date = new Date(deposit.insertTime).toLocaleString();
        const status = getStatusBadge(deposit.status);
        
        depositsHtml += `
            <tr>
                <td>${date}</td>
                <td>${deposit.coin}</td>
                <td>${parseFloat(deposit.amount).toFixed(8)}</td>
                <td>${deposit.network || 'N/A'}</td>
                <td>${status}</td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width: 150px;" title="${deposit.address}">
                        ${deposit.address}
                    </span>
                </td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width: 150px;" title="${deposit.txId}">
                        ${deposit.txId || 'N/A'}
                    </span>
                </td>
            </tr>
        `;
    });
    
    binanceElements.depositsTableBody.innerHTML = depositsHtml;
}

/**
 * Load withdrawal history
 */
async function loadWithdrawals() {
    if (!binanceElements.withdrawalsTableBody) return;
    
    try {
        binanceElements.withdrawalsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center p-3">
                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Loading withdrawals...</span>
                </td>
            </tr>
        `;
        
        const response = await fetch(`${binanceConfig.apiBaseUrl}/binance/withdrawals`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
    console.log(response);        throw new Error('Failed to fetch withdrawals');
        }
        
        const withdrawals = await response.json();
        binanceState.withdrawals = withdrawals;
        
        renderWithdrawals(withdrawals);
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        binanceElements.withdrawalsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    Failed to load withdrawals: ${error.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Render withdrawals table
 */
function renderWithdrawals(withdrawals) {
    if (!binanceElements.withdrawalsTableBody) return;
    
    if (withdrawals.length === 0) {
        binanceElements.withdrawalsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted p-3">
                    No withdrawal transactions found
                </td>
            </tr>
        `;
        return;
    }
    
    let withdrawalsHtml = '';
    
    withdrawals.forEach(withdrawal => {
        const date = new Date(withdrawal.applyTime).toLocaleString();
        const status = getStatusBadge(withdrawal.status);
        
        withdrawalsHtml += `
            <tr>
                <td>${date}</td>
                <td>${withdrawal.coin}</td>
                <td>${parseFloat(withdrawal.amount).toFixed(8)}</td>
                <td>${withdrawal.network || 'N/A'}</td>
                <td>${status}</td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width: 150px;" title="${withdrawal.address}">
                        ${withdrawal.address}
                    </span>
                </td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width: 150px;" title="${withdrawal.txId}">
                        ${withdrawal.txId || 'N/A'}
                    </span>
                </td>
            </tr>
        `;
    });
    
    binanceElements.withdrawalsTableBody.innerHTML = withdrawalsHtml;
}

/**
 * Combine deposits and withdrawals for the all transactions view
 */
function combineTransactions() {
    if (!binanceElements.allTransactionsTableBody) return;
    
    // Combine and sort by date (newest first)
    const allTransactions = [
        ...binanceState.deposits.map(d => ({ ...d, type: 'Deposit', date: new Date(d.insertTime) })),
        ...binanceState.withdrawals.map(w => ({ ...w, type: 'Withdrawal', date: new Date(w.applyTime) }))
    ];
    
    allTransactions.sort((a, b) => b.date - a.date);
    binanceState.transactions = allTransactions;
    
    if (allTransactions.length === 0) {
        binanceElements.allTransactionsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted p-3">
                    No transactions found
                </td>
            </tr>
        `;
        return;
    }
    
    let transactionsHtml = '';
    
    allTransactions.forEach(tx => {
        const date = tx.date.toLocaleString();
        const status = getStatusBadge(tx.status);
        const typeClass = tx.type === 'Deposit' ? 'text-success' : 'text-warning';
        
        transactionsHtml += `
            <tr>
                <td><span class="${typeClass}">${tx.type}</span></td>
                <td>${date}</td>
                <td>${tx.coin}</td>
                <td>${parseFloat(tx.amount).toFixed(8)}</td>
                <td>${tx.network || 'N/A'}</td>
                <td>${status}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-transaction-btn" data-id="${tx.id}" data-type="${tx.type.toLowerCase()}">
                        <i class="bi bi-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    });
    
    binanceElements.allTransactionsTableBody.innerHTML = transactionsHtml;
    
    // Add event listeners to view buttons
    const viewButtons = document.querySelectorAll('.view-transaction-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id');
            const type = button.getAttribute('data-type');
            viewTransactionDetails(id, type);
        });
    });
}

/**
 * View transaction details
 */
function viewTransactionDetails(id, type) {
    // Find the transaction
    const transaction = binanceState.transactions.find(tx => tx.id === id);
    
    if (!transaction) {
        alert('Transaction details not found');
        return;
    }
    
    // Create modal with transaction details
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'transactionModal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'transactionModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    
    const date = transaction.date.toLocaleString();
    const status = getStatusBadge(transaction.status);
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="transactionModalLabel">${transaction.type} Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Transaction ID:</div>
                        <div class="col-8">${transaction.id}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Type:</div>
                        <div class="col-8">${transaction.type}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Date:</div>
                        <div class="col-8">${date}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Asset:</div>
                        <div class="col-8">${transaction.coin}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Amount:</div>
                        <div class="col-8">${parseFloat(transaction.amount).toFixed(8)}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Network:</div>
                        <div class="col-8">${transaction.network || 'N/A'}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Status:</div>
                        <div class="col-8">${status}</div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Address:</div>
                        <div class="col-8">
                            <span class="text-break">${transaction.address}</span>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-4 text-muted">Transaction Hash:</div>
                        <div class="col-8">
                            <span class="text-break">${transaction.txId || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize and show the modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Remove modal from DOM when hidden
    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

/**
 * Get status badge HTML based on status code
 */
function getStatusBadge(status) {
    let badgeClass = 'bg-secondary';
    let statusText = 'Unknown';
    
    // Convert status to number if it's a string
    const statusCode = typeof status === 'string' ? parseInt(status, 10) : status;
    
    switch (statusCode) {
        case 0:
            badgeClass = 'bg-warning';
            statusText = 'Pending';
            break;
        case 1:
            badgeClass = 'bg-success';
            statusText = 'Completed';
            break;
        case 2:
            badgeClass = 'bg-danger';
            statusText = 'Failed';
            break;
        case 3:
            badgeClass = 'bg-info';
            statusText = 'Processing';
            break;
        case 4:
            badgeClass = 'bg-danger';
            statusText = 'Rejected';
            break;
        case 5:
            badgeClass = 'bg-warning';
            statusText = 'Expired';
            break;
        case 6:
            badgeClass = 'bg-primary';
            statusText = 'Approved';
            break;
        default:
            if (status === 'success' || status === 'completed') {
                badgeClass = 'bg-success';
                statusText = 'Completed';
            } else if (status === 'pending' || status === 'processing') {
                badgeClass = 'bg-warning';
                statusText = 'Pending';
            } else if (status === 'failed' || status === 'rejected') {
                badgeClass = 'bg-danger';
                statusText = 'Failed';
            }
    }
    
    return `<span class="badge ${badgeClass}">${statusText}</span>`;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initBinanceDashboard);