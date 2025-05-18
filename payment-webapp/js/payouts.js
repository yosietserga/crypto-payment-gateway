/**
 * Payouts JavaScript for Crypto Payment Gateway
 * Handles the listing, viewing, and management of payouts
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the payouts page
    initPayoutsPage();
    
    // Set up filter form event handlers
    setupFilterHandlers();
});

/**
 * Initialize the payouts page
 */
function initPayoutsPage() {
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Store API client in a global variable for other functions to access
    window.paymentAPI = api;
    
    // Get elements
    const payoutsTable = document.getElementById('payouts-table');
    const payoutsTableBody = document.getElementById('payouts-table-body');
    const payoutsLoader = document.getElementById('payouts-loader');
    const payoutsEmpty = document.getElementById('payouts-empty');
    const payoutsError = document.getElementById('payouts-error');
    const showingEntries = document.getElementById('showing-entries');
    const totalEntries = document.getElementById('total-entries');
    
    // Load payouts
    loadPayouts();
    
    // Set up payout details modal
    document.addEventListener('click', function(event) {
        if (event.target.closest('[data-payout-id]')) {
            const button = event.target.closest('[data-payout-id]');
            const payoutId = button.dataset.payoutId;
            viewPayoutDetails(payoutId);
        }
    });
    
    /**
     * Load payouts from the API with filtering options
     * @param {Object} filters - Optional filters for the payouts
     */
    async function loadPayouts(filters = {}) {
        // Show loader
        if (payoutsLoader) payoutsLoader.classList.remove('d-none');
        if (payoutsTable) payoutsTable.classList.add('d-none');
        if (payoutsEmpty) payoutsEmpty.classList.add('d-none');
        if (payoutsError) payoutsError.classList.add('d-none');
        
        try {
            // Get filter values from UI if not provided as parameters
            if (!filters.status && document.getElementById('filter-status')) {
                filters.status = document.getElementById('filter-status').value;
            }
            
            if (!filters.dateRange && document.getElementById('filter-date-range')) {
                filters.dateRange = document.getElementById('filter-date-range').value;
            }
            
            if (!filters.search && document.getElementById('filter-search')) {
                const searchValue = document.getElementById('filter-search').value.trim();
                if (searchValue) {
                    filters.search = searchValue;
                }
            }
            
            if (!filters.currency && document.getElementById('filter-currency')) {
                const currencyValue = document.getElementById('filter-currency').value;
                if (currencyValue !== 'all') {
                    filters.currency = currencyValue;
                }
            }
            
            // Call API to get payouts with filters
            let payouts = [];
            try {
                payouts = await api.getPayouts(filters);
                console.log('Payouts loaded:', payouts);
            } catch (apiError) {
                console.error('API request failed:', apiError);
                // Use empty array as fallback - NO MOCK DATA
                payouts = [];
                
                // Show an error message about the API failure
                showNotification('error', 'Could not load payouts from the server: ' + (apiError.message || 'Unknown error'));
            }
            
            // Ensure payouts is an array
            if (!Array.isArray(payouts)) {
                console.warn('Expected array of payouts but got:', typeof payouts);
                payouts = [];
            }
            
            // Update the table
            if (payoutsTableBody) {
                // Clear existing rows
                payoutsTableBody.innerHTML = '';
                
                if (payouts.length === 0) {
                    // Show empty state
                    if (payoutsEmpty) payoutsEmpty.classList.remove('d-none');
                } else {
                    // Add rows for each payout
                    payouts.forEach(payout => {
                        try {
                            // Validate payout object has required properties
                            if (!payout) {
                                console.warn('Skipping invalid payout:', payout);
                                return; // Skip this payout
                            }
                            
                            // Use safe default values if properties are missing
                            const id = payout.id || 'Unknown';
                            const date = payout.createdAt || new Date().toISOString();
                            const recipient = payout.recipientAddress || 'Unknown';
                            const amount = payout.amount || 0;
                            const currency = payout.currency || 'USDT';
                            const status = payout.status || 'UNKNOWN';
                            
                            // Status badge class
                            let statusClass = '';
                            switch(status.toLowerCase()) {
                                case 'completed':
                                case 'confirmed':
                                case 'success':
                                    statusClass = 'bg-success';
                                    break;
                                case 'pending':
                                case 'unconfirmed':
                                case 'waiting':
                                    statusClass = 'bg-warning';
                                    break;
                                case 'processing':
                                case 'submitted':
                                    statusClass = 'bg-info';
                                    break;
                                case 'failed':
                                case 'rejected':
                                case 'error':
                                    statusClass = 'bg-danger';
                                    break;
                                default:
                                    statusClass = 'bg-secondary';
                            }
                            
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${id}</td>
                                <td>${formatDate(date)}</td>
                                <td>${formatAddress(recipient)}</td>
                                <td>${formatAmount(amount)}</td>
                                <td>${currency}</td>
                                <td><span class="badge ${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}</span></td>
                                <td>
                                    <button class="btn btn-sm btn-outline-primary me-1" data-payout-id="${id}" data-bs-toggle="modal" data-bs-target="#payoutDetailsModal">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary">
                                        <i class="bi bi-download"></i>
                                    </button>
                                </td>
                            `;
                            
                            payoutsTableBody.appendChild(row);
                        } catch (rowError) {
                            console.error('Error creating payout row:', rowError);
                            // Continue with next payout
                        }
                    });
                    
                    // Show the table
                    if (payoutsTable) payoutsTable.classList.remove('d-none');
                    
                    // Update pagination info
                    if (showingEntries) showingEntries.textContent = payouts.length;
                    if (totalEntries) totalEntries.textContent = payouts.length;
                }
            }
        } catch (error) {
            console.error('Error loading payouts:', error);
            
            // Show error state
            if (payoutsError) {
                payoutsError.classList.remove('d-none');
                const errorMsg = payoutsError.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Failed to load payouts';
                }
            }
        } finally {
            // Hide loader
            if (payoutsLoader) payoutsLoader.classList.add('d-none');
        }
    }
    
    /**
     * View payout details
     * @param {string} payoutId - Payout ID
     */
    async /**
     * Set up handlers for filter form submission
     */
    function setupFilterHandlers() {
        const filterForm = document.getElementById('payouts-filter-form');
        if (!filterForm) return;
        
        // Handle form submission
        filterForm.addEventListener('submit', function(event) {
            event.preventDefault();
            
            // Get filter values
            const filters = {
                status: document.getElementById('filter-status')?.value || 'all',
                currency: document.getElementById('filter-currency')?.value || 'all',
                dateRange: document.getElementById('filter-date-range')?.value || '7d',
                search: document.getElementById('filter-search')?.value || ''
            };
            
            // Only include filters that aren't the default 'all' value
            const apiFilters = {};
            if (filters.status !== 'all') apiFilters.status = filters.status;
            if (filters.currency !== 'all') apiFilters.currency = filters.currency;
            if (filters.dateRange) apiFilters.dateRange = filters.dateRange;
            if (filters.search.trim()) apiFilters.search = filters.search.trim();
            
            // Load payouts with filters
            loadPayouts(apiFilters);
        });
        
        // Handle export button click
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                exportPayoutsData();
            });
        }
    }
    
    /**
     * Export payouts data as CSV
     */
    function exportPayoutsData() {
        // Get current payouts data from the table
        const rows = [];
        const headers = ['Payout ID', 'Date', 'Recipient', 'Amount', 'Currency', 'Status'];
        
        // Add table headers
        rows.push(headers);
        
        // Add table data rows
        const tableRows = document.querySelectorAll('#payouts-table-body tr:not(.skeleton-row)');
        tableRows.forEach(row => {
            const columns = row.querySelectorAll('td');
            if (columns.length >= 6) {
                const rowData = [
                    columns[0].textContent.trim(),
                    columns[1].textContent.trim(),
                    columns[2].textContent.trim(),
                    columns[3].textContent.trim(),
                    columns[4].textContent.trim(),
                    columns[5].textContent.trim()
                ];
                rows.push(rowData);
            }
        });
        
        // Convert to CSV
        let csvContent = 'data:text/csv;charset=utf-8,';
        rows.forEach(rowArray => {
            // Properly handle fields with commas, quotes
            const formattedRow = rowArray.map(field => {
                // Escape quotes and wrap fields with commas in quotes
                const escaped = String(field).replace(/"/g, '""');
                return /[,"]/.test(escaped) ? `"${escaped}"` : escaped;
            });
            csvContent += formattedRow.join(',') + '\r\n';
        });
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `payouts-export-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        
        // Click the link to trigger download
        link.click();
        
        // Clean up
        document.body.removeChild(link);
    }

    async function viewPayoutDetails(payoutId) {
        const modal = document.getElementById('payoutDetailsModal');
        const modalBody = modal.querySelector('.modal-body');
        const modalLoader = modal.querySelector('.modal-loader');
        const modalContent = modal.querySelector('.modal-content-wrapper');
        const modalError = modal.querySelector('.modal-error');
        
        // Show loader
        if (modalLoader) modalLoader.classList.remove('d-none');
        if (modalContent) modalContent.classList.add('d-none');
        if (modalError) modalError.classList.add('d-none');
        
        try {
            // Call API to get payout details
            const payout = await api.getPayoutById(payoutId);
            console.log('Payout details received:', payout);
            
            // Populate modal with payout details
            if (payout && modalContent) {
                // Payment ID
                const idElement = modal.querySelector('#payout-id');
                if (idElement) idElement.textContent = payout.id || 'Unknown';
                
                // Status
                const statusElement = modal.querySelector('#payout-status');
                if (statusElement) {
                    const status = payout.status || 'Unknown';
                    let statusClass = '';
                    
                    switch(status.toLowerCase()) {
                        case 'completed':
                        case 'confirmed':
                        case 'success':
                            statusClass = 'bg-success';
                            break;
                        case 'pending':
                        case 'unconfirmed':
                        case 'waiting':
                            statusClass = 'bg-warning';
                            break;
                        case 'processing':
                        case 'submitted':
                            statusClass = 'bg-info';
                            break;
                        case 'failed':
                        case 'rejected':
                        case 'error':
                            statusClass = 'bg-danger';
                            break;
                        default:
                            statusClass = 'bg-secondary';
                    }
                    
                    statusElement.innerHTML = `<span class="badge ${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}</span>`;
                }
                
                // Amount
                const amountElement = modal.querySelector('#payout-amount');
                if (amountElement) amountElement.textContent = `${formatAmount(payout.amount || 0)} ${payout.currency || 'USDT'}`;
                
                // Date
                const dateElement = modal.querySelector('#payout-date');
                if (dateElement) dateElement.textContent = formatDate(payout.createdAt || new Date().toISOString());
                
                // Recipient
                const recipientElement = modal.querySelector('#payout-recipient');
                if (recipientElement) recipientElement.textContent = payout.recipientAddress || 'Unknown';
                
                // Transaction Hash
                const txHashElement = modal.querySelector('#payout-tx-hash');
                if (txHashElement) {
                    const txHash = payout.transactionHash || '';
                    if (txHash) {
                        const network = payout.network || 'bsc';
                        const explorerUrl = getExplorerUrl(network, txHash);
                        txHashElement.innerHTML = `<a href="${explorerUrl}" target="_blank">${formatAddress(txHash)}</a>`;
                    } else {
                        txHashElement.textContent = 'Not available yet';
                    }
                }
                
                // Network Fee
                const feeElement = modal.querySelector('#payout-fee');
                if (feeElement) feeElement.textContent = payout.fee ? `${formatAmount(payout.fee)} ${payout.currency || 'USDT'}` : 'N/A';
                
                // Description
                const descriptionElement = modal.querySelector('#payout-description');
                if (descriptionElement) descriptionElement.textContent = payout.metadata?.description || 'No description provided';
                
                // Memo
                const memoElement = modal.querySelector('#payout-memo');
                if (memoElement) memoElement.textContent = payout.metadata?.memo || '';
                
                // Metadata
                const metadataElement = modal.querySelector('#payout-metadata');
                if (metadataElement) {
                    if (payout.metadata && Object.keys(payout.metadata).length > 0) {
                        metadataElement.textContent = JSON.stringify(payout.metadata, null, 2);
                    } else {
                        metadataElement.textContent = '{}';
                    }
                }
                
                // Show content
                modalContent.classList.remove('d-none');
            } else {
                throw new Error('Failed to load payout details');
            }
        } catch (error) {
            console.error('Error viewing payout:', error);
            
            // Show error
            if (modalError) {
                modalError.classList.remove('d-none');
                const errorMsg = modalError.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Failed to load payout details';
                }
            }
        } finally {
            // Hide loader
            if (modalLoader) modalLoader.classList.add('d-none');
        }
    }
}

/**
 * Format date to readable format
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (e) {
        return dateString || 'Unknown date';
    }
}

/**
 * Format blockchain address to shortened form
 * @param {string} address - Blockchain address
 * @returns {string} - Shortened address
 */
function formatAddress(address) {
    if (!address) return 'Unknown';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format amount to readable format
 * @param {number|string} amount - Amount value
 * @returns {string} - Formatted amount
 */
function formatAmount(amount) {
    try {
        return parseFloat(amount).toFixed(2);
    } catch (e) {
        return '0.00';
    }
}

/**
 * Get blockchain explorer URL for transaction
 * @param {string} network - Network name (eth, bsc, etc.)
 * @param {string} txHash - Transaction hash
 * @returns {string} - Explorer URL
 */
function getExplorerUrl(network, txHash) {
    if (!txHash) return '#';
    
    const explorers = {
        eth: 'https://etherscan.io/tx/',
        ethereum: 'https://etherscan.io/tx/',
        bsc: 'https://bscscan.com/tx/',
        binance: 'https://bscscan.com/tx/',
        btc: 'https://www.blockchain.com/btc/tx/',
        bitcoin: 'https://www.blockchain.com/btc/tx/',
        matic: 'https://polygonscan.com/tx/',
        polygon: 'https://polygonscan.com/tx/',
        sol: 'https://solscan.io/tx/',
        solana: 'https://solscan.io/tx/',
        arb: 'https://arbiscan.io/tx/',
        arbitrum: 'https://arbiscan.io/tx/'
    };
    
    const baseUrl = explorers[network.toLowerCase()] || 'https://bscscan.com/tx/';
    return baseUrl + txHash;
}

/**
 * Show notification
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {string} message - Notification message
 */
function showNotification(type, message) {
    // Check if notification container exists
    let container = document.querySelector('.notification-container');
    
    // Create container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        </div>
        <div class="notification-content">
            <p>${message}</p>
        </div>
        <button class="notification-close">
            <i class="bi bi-x"></i>
        </button>
    `;
    
    // Add notification to container
    container.appendChild(notification);
    
    // Add close button event listener
    notification.querySelector('.notification-close').addEventListener('click', function() {
        notification.classList.add('notification-fadeout');
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.add('notification-fadeout');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}
