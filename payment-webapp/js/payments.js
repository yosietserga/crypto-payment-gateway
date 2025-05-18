/**
 * Payments JavaScript for Crypto Payment Gateway
 * Handles the listing, viewing, and management of payments
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the payments page
    initPaymentsPage();
});

/**
 * Initialize the payments page
 */
function initPaymentsPage() {
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Get elements
    const paymentsTable = document.getElementById('payments-table');
    const paymentsTableBody = document.getElementById('payments-table-body');
    const paymentsLoader = document.getElementById('payments-loader');
    const paymentsEmpty = document.getElementById('payments-empty');
    const paymentsError = document.getElementById('payments-error');
    const paymentsFilter = document.getElementById('payments-filter');
    const paymentsSearch = document.getElementById('payments-search');
    const paymentsDateRange = document.getElementById('payments-date-range');
    const refreshButton = document.getElementById('refresh-payments-btn');
    
    // Load payments
    loadPayments();
    
    // Set up event listeners
    if (paymentsFilter) {
        paymentsFilter.addEventListener('change', function() {
            loadPayments();
        });
    }
    
    if (paymentsSearch) {
        paymentsSearch.addEventListener('input', debounce(function() {
            loadPayments();
        }, 500));
    }
    
    if (paymentsDateRange) {
        paymentsDateRange.addEventListener('change', function() {
            loadPayments();
        });
    }
    
    // Set up refresh button
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            refreshData();
        });
    }
    
    // Set up view payment details
    document.addEventListener('click', function(event) {
        if (event.target.closest('.view-payment-btn')) {
            const button = event.target.closest('.view-payment-btn');
            const paymentId = button.dataset.paymentId;
            viewPayment(paymentId);
        }
    });
    
    /**
     * Refresh payments data
     */
    function refreshData() {
        // Show a brief loading toast
        showNotification('info', 'Refreshing payment data...');
        
        // Reload the payments
        loadPayments();
    }
    
    /**
     * Load payments from the API
     */
    async function loadPayments() {
        // Show loader
        if (paymentsLoader) paymentsLoader.classList.remove('d-none');
        if (paymentsTable) paymentsTable.classList.add('d-none');
        if (paymentsEmpty) paymentsEmpty.classList.add('d-none');
        if (paymentsError) paymentsError.classList.add('d-none');
        
        try {
            // Get filter and search values
            const filter = paymentsFilter ? paymentsFilter.value : 'all';
            const search = paymentsSearch ? paymentsSearch.value : '';
            const dateRange = paymentsDateRange ? paymentsDateRange.value : '7d';
            
            console.log('Loading payments with filter:', filter, 'search:', search, 'dateRange:', dateRange);
            
            // Call API to get payments - ONLY using real data, no mocks
            let payments = [];
            try {
                payments = await api.getPayments(filter, search, dateRange);
                console.log('Payments loaded:', payments);
                
                // Update last refresh time indicator if present
                const lastRefreshElement = document.getElementById('last-refresh-time');
                if (lastRefreshElement) {
                    const now = new Date();
                    lastRefreshElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
                }
            } catch (apiError) {
                console.error('API request failed:', apiError);
                // Use empty array as fallback - NO MOCK DATA
                payments = [];
                
                // Show an error message about the API failure
                showNotification('error', 'Could not load payments from the server: ' + 
                                (apiError.response?.data?.message || apiError.message || 'Unknown error'));
            }
            
            // Ensure payments is an array
            if (!Array.isArray(payments)) {
                console.warn('Expected array of payments but got:', typeof payments);
                payments = [];
            }
            
            // Update the table
            if (paymentsTableBody) {
                // Clear existing rows
                paymentsTableBody.innerHTML = '';
                
                if (payments.length === 0) {
                    // Show empty state
                    if (paymentsEmpty) paymentsEmpty.classList.remove('d-none');
                } else {
                    // Add rows for each payment
                    payments.forEach(payment => {
                        try {
                            // Validate payment object has required properties
                            if (!payment) {
                                console.warn('Skipping invalid payment:', payment);
                                return; // Skip this payment
                            }
                            
                            // Get payment data with safe fallbacks
                            const currency = payment.currency || 'USDT';
                            const reference = payment.reference || 'Unknown';
                            // Support both camelCase and snake_case API responses
                            const createdAt = payment.createdAt || payment.created_at || new Date().toISOString();
                            const expectedAmount = payment.expectedAmount || payment.expected_amount || 0;
                            const status = payment.status || 'UNKNOWN';
                            const id = payment.id || '0';
                            
                            // Get fiat amount and currency from metadata if available
                            let fiatAmount = null;
                            let fiatCurrency = null;
                            
                            if (payment.metadata) {
                                fiatAmount = payment.metadata.fiatAmount || payment.metadata.fiat_amount;
                                fiatCurrency = payment.metadata.fiatCurrency || payment.metadata.fiat_currency;
                            }
                            
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>
                                    <div class="d-flex align-items-center">
                                        <div class="currency-icon currency-icon-${currency.toLowerCase()} me-2"></div>
                                        <div>
                                            <div class="fw-semibold">${reference}</div>
                                            <div class="small text-muted">${formatDate(createdAt)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="fw-semibold">${formatAmount(expectedAmount)} ${currency}</div>
                                    ${fiatAmount ? `<div class="small text-muted">≈ ${formatAmount(fiatAmount)} ${fiatCurrency || 'USD'}</div>` : ''}
                                </td>
                                <td>
                                    <span class="badge bg-${getStatusBadgeColor(status)}">${formatStatus(status)}</span>
                                </td>
                                <td>
                                    <div class="d-flex gap-2 justify-content-end">
                                        <button class="btn btn-sm btn-outline-primary view-payment-btn" data-payment-id="${id}" data-bs-toggle="modal" data-bs-target="#paymentDetailsModal">
                                            <i class="bi bi-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary refresh-payment-btn" data-payment-id="${id}" title="Refresh status">
                                            <i class="bi bi-arrow-repeat"></i>
                                        </button>
                                    </div>
                                </td>
                            `;
                            paymentsTableBody.appendChild(row);
                        } catch (rowError) {
                            console.error('Error creating payment row:', rowError);
                            // Continue with next payment
                        }
                    });
                    
                    // Show the table
                    if (paymentsTable) paymentsTable.classList.remove('d-none');
                }
            }
        } catch (error) {
            console.error('Error loading payments:', error);
            
            // Show error state
            if (paymentsError) {
                paymentsError.classList.remove('d-none');
                paymentsError.querySelector('.error-message').textContent = error.message || 'Failed to load payments';
            }
        } finally {
            // Hide loader
            if (paymentsLoader) paymentsLoader.classList.add('d-none');
        }
    }
    
    /**
     * Set up event listener for the refresh payment status button
     */
    document.addEventListener('click', function(event) {
        if (event.target.closest('.refresh-payment-btn')) {
            const button = event.target.closest('.refresh-payment-btn');
            const paymentId = button.dataset.paymentId;
            refreshPaymentStatus(paymentId, button);
        }
    });
    
    /**
     * Refresh the status of a specific payment
     * @param {string} paymentId - The payment ID
     * @param {HTMLElement} button - The refresh button element
     */
    async function refreshPaymentStatus(paymentId, button) {
        // Show loading state on the button
        if (button) {
            const originalHtml = button.innerHTML;
            button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
            button.disabled = true;
            
            try {
                // Call API to get the latest payment status
                const payment = await api.getPaymentById(paymentId);
                
                if (!payment) {
                    throw new Error('Could not retrieve payment data');
                }
                
                // Find the parent row
                const row = button.closest('tr');
                if (row) {
                    // Update the status badge
                    const statusCell = row.querySelector('td:nth-child(3)');
                    if (statusCell) {
                        const status = payment.status || 'UNKNOWN';
                        statusCell.innerHTML = `<span class="badge bg-${getStatusBadgeColor(status)}">${formatStatus(status)}</span>`;
                    }
                }
                
                showNotification('success', 'Payment status updated successfully');
                
            } catch (error) {
                console.error('Error refreshing payment status:', error);
                showNotification('error', 'Failed to refresh payment status: ' + (error.message || 'Unknown error'));
            } finally {
                // Restore button state
                button.innerHTML = originalHtml;
                button.disabled = false;
            }
        }
    }
    
    /**
     * View payment details
     * @param {string} paymentId - The payment ID
     */
    async function viewPayment(paymentId) {
        try {
            console.log(`Viewing payment details for ID: ${paymentId}`);
            
            // Get modal elements
            const modal = document.getElementById('paymentDetailsModal');
            const modalLoader = modal?.querySelector('.modal-loader');
            const modalContent = modal?.querySelector('.modal-content-inner');
            const modalError = modal?.querySelector('.modal-error');
            
            // Show loader
            if (modalLoader) modalLoader.classList.remove('d-none');
            if (modalContent) modalContent.classList.add('d-none');
            if (modalError) modalError.classList.add('d-none');
            
            // Call API to get payment details
            // ONLY using real data from the API
            const payment = await api.getPaymentById(paymentId);
            console.log('Payment details received:', payment);
            
            // If no payment data was returned, show error and stop
            if (!payment || Object.keys(payment).length === 0) {
                console.error('No payment data returned from API');
                if (modalError) {
                    modalError.classList.remove('d-none');
                    modalError.querySelector('.error-message').textContent = 'Could not load payment details from the server.';
                }
                showNotification('error', 'Could not load payment details from the server.');
                return; // Exit the function
            }
            
            // Ensure payment is an object
            if (!payment || typeof payment !== 'object') {
                console.warn('Expected payment object but got:', typeof payment);
                payment = {};
            }
            
            // Extract payment data with proper fallbacks
            const reference = payment.reference || 'Unknown';
            const amount = payment.amount || 0;
            const currency = payment.currency || 'USDT';
            const status = payment.status || 'UNKNOWN';
            const createdAt = payment.createdAt || new Date().toISOString();
            const updatedAt = payment.updatedAt || createdAt;
            const address = payment.address || '';
            
            // Update modal with payment details
            // modal is already declared above, no need to redeclare
            if (modal) {
                try {
                    console.log('Updating modal with payment data:', payment);
                    
                    // Basic payment details
                    modal.querySelector('.modal-title').textContent = `Payment Details`;
                    modal.querySelector('#modal-payment-id').textContent = payment.id || 'Unknown';
                    modal.querySelector('#modal-reference').textContent = payment.metadata.reference || 'Unknown';
                    modal.querySelector('#modal-created-date').textContent = formatDate(payment.createdAt || new Date());
                    modal.querySelector('#modal-status').innerHTML = `<span class="badge bg-${getStatusBadgeColor(status)}">${formatStatus(status)}</span>`;
                    
                    // Amount details
                    modal.querySelector('#modal-amount').textContent = `${formatAmount(payment.expectedAmount || 0)} ${payment.currency || 'Unknown'}`;
                    modal.querySelector('#modal-network').textContent = payment.network || 'BEP20';
                    
                    // Transaction hash and confirmations
                    if (payment.transactionHash) {
                        modal.querySelector('#modal-tx-hash').textContent = payment.transactionHash;
                        modal.querySelector('#modal-tx-hash').parentElement.classList.remove('d-none');
                    } else {
                        modal.querySelector('#modal-tx-hash').parentElement.classList.add('d-none');
                    }
                    
                    if (payment.confirmations) {
                        modal.querySelector('#modal-confirmations').textContent = `${payment.confirmations}/12`;
                        modal.querySelector('#modal-confirmations').parentElement.classList.remove('d-none');
                    } else {
                        modal.querySelector('#modal-confirmations').parentElement.classList.add('d-none');
                    }
                    
                    // Payment address
                    if (payment.address) {
                        modal.querySelector('#modal-address').textContent = payment.address;
                        
                        // Generate QR code
                        const qrContainer = modal.querySelector('#modal-qr-code');
                        if (qrContainer) {
                            qrContainer.innerHTML = '';
                            try {
                                // First check if QRCode lib is available globally
                                if (typeof qrcode === 'function') {
                                    // Using qrcode-generator library
                                    const typeNumber = 0;
                                    const errorCorrectionLevel = 'L';
                                    const qr = qrcode(typeNumber, errorCorrectionLevel);
                                    qr.addData(payment.address);
                                    qr.make();
                                    
                                    const img = document.createElement('img');
                                    img.src = qr.createDataURL(4);
                                    img.alt = 'Payment QR Code';
                                    img.className = 'img-thumbnail';
                                    img.style.width = '150px';
                                    
                                    qrContainer.appendChild(img);
                                } else {
                                    // Fallback - create a simple QR code link
                                    const link = document.createElement('a');
                                    link.href = `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(payment.address)}`;
                                    link.target = '_blank';
                                    link.innerHTML = `<img src="https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(payment.address)}" alt="Payment QR Code" class="img-thumbnail" style="width: 150px;">`;                                 
                                    qrContainer.appendChild(link);
                                }
                            } catch (qrError) {
                                console.error('QR code generation error:', qrError);
                                qrContainer.innerHTML = '<div class="text-muted">Could not generate QR code</div>';
                            }
                        }
                    } else {
                        // Hide address section if no address
                        const addressSection = modal.querySelector('#modal-address').parentElement;
                        if (addressSection) addressSection.classList.add('d-none');
                    }
                    
                    // Additional Information
                    // Callback URL
                    if (payment.callbackUrl) {
                        modal.querySelector('#modal-callback-url').textContent = payment.callbackUrl;
                        modal.querySelector('#modal-callback-url').parentElement.classList.remove('d-none');
                    } else {
                        modal.querySelector('#modal-callback-url').parentElement.classList.add('d-none');
                    }
                    
                    // Callback status
                    if (payment.callbackStatus) {
                        const callbackStatusElem = modal.querySelector('#modal-callback-status');
                        const statusClass = payment.callbackStatus === 'success' ? 'bg-success' : 'bg-danger';
                        const statusText = payment.callbackStatus.charAt(0).toUpperCase() + payment.callbackStatus.slice(1);
                        callbackStatusElem.innerHTML = `<span class="badge ${statusClass}">${statusText}</span>`;
                        callbackStatusElem.parentElement.classList.remove('d-none');
                    } else {
                        modal.querySelector('#modal-callback-status').parentElement.classList.add('d-none');
                    }
                    
                    // Metadata
                    if (payment.metadata && Object.keys(payment.metadata).length > 0) {
                        const metadataJson = JSON.stringify(payment.metadata, null, 2);
                        modal.querySelector('#modal-metadata pre').textContent = metadataJson;
                        modal.querySelector('#modal-metadata').parentElement.classList.remove('d-none');
                    } else {
                        modal.querySelector('#modal-metadata').parentElement.classList.add('d-none');
                    }
                } catch (uiError) {
                    console.error('Error updating UI with payment details:', uiError);
                    showNotification('error', 'Error rendering payment details');
                }
            }
        } catch (error) {
            console.error('Error in viewPayment function:', error);
            showNotification('error', `Failed to load payment details: ${error.message || 'Unknown error'}`);
        }
    }
    
    /**
     * Get badge color for payment status
     * @param {string} status - Payment status
     * @returns {string} - Bootstrap color class
     */
    function getStatusBadgeColor(status) {
        switch (status.toUpperCase()) {
            case 'COMPLETED':
            case 'CONFIRMED':
            case 'SUCCESS':
                return 'success';
            case 'PENDING':
            case 'IN_PROGRESS':
            case 'AWAITING_PAYMENT':
            case 'PROCESSING':
                return 'warning';
            case 'FAILED':
            case 'EXPIRED':
            case 'CANCELLED':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    /**
     * Format payment status for display
     * @param {string} status - Payment status from API
     * @returns {string} Formatted status string
     */
    function formatStatus(status) {
        if (!status) return 'Unknown';
        
        // Convert to uppercase for consistency in switch statement
        const upperStatus = status.toUpperCase();
        
        // Format status for display
        switch (upperStatus) {
            case 'AWAITING_PAYMENT':
                return 'Awaiting Payment';
            case 'IN_PROGRESS':
                return 'In Progress';
            case 'PROCESSING':
                return 'Processing';
            case 'COMPLETED':
                return 'Completed';
            case 'CONFIRMED':
                return 'Confirmed';
            case 'CANCELLED':
                return 'Cancelled';
            case 'EXPIRED':
                return 'Expired';
            case 'FAILED':
                return 'Failed';
            default:
                // Convert snake_case or camelCase to Title Case
                return status
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
        }
    }
    
    /**
     * Format amount
     * @param {number|string} amount - Amount to format
     * @returns {string} - Formatted amount
     */
    function formatAmount(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '0.00';
        
        // Format based on size
        if (num < 0.01) {
            return num.toFixed(8);
        } else if (num < 1) {
            return num.toFixed(4);
        } else {
            return num.toFixed(2);
        }
    }
    
    /**
     * Format date
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Debounce function for search input
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    }
}

/**
 * Show notification
 * @param {string} type - Notification type (success, error, info)
 * @param {string} message - Notification message
 */
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show notification-toast`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add QRCode library if not already included
if (typeof QRCode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    document.head.appendChild(script);
}