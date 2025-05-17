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
    
    // Set up view payment details
    document.addEventListener('click', function(event) {
        if (event.target.closest('.view-payment-btn')) {
            const button = event.target.closest('.view-payment-btn');
            const paymentId = button.dataset.paymentId;
            viewPayment(paymentId);
        }
    });
    
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
            } catch (apiError) {
                console.error('API request failed:', apiError);
                // Use empty array as fallback - NO MOCK DATA
                payments = [];
                
                // Show an error message about the API failure
                showNotification('error', 'Could not load payments from the server: ' + (apiError.message || 'Unknown error'));
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
                            
                            // Use safe default values if properties are missing
                            const currency = payment.currency || 'USDT';
                            const reference = payment.reference || 'Unknown';
                            const createdAt = payment.createdAt || new Date().toISOString();
                            const amount = payment.amount || 0;
                            const status = payment.status || 'UNKNOWN';
                            const id = payment.id || '0';
                            
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
                                    <div class="fw-semibold">${formatAmount(amount)} ${currency}</div>
                                    ${payment.fiatAmount ? `<div class="small text-muted">≈ ${formatAmount(payment.fiatAmount)} ${payment.fiatCurrency || 'USD'}</div>` : ''}
                                </td>
                                <td>
                                    <span class="badge bg-${getStatusBadgeColor(status)}">${status}</span>
                                </td>
                                <td>
                                    <div class="d-flex gap-2 justify-content-end">
                                        <button class="btn btn-sm btn-outline-primary view-payment-btn" data-payment-id="${id}" data-bs-toggle="modal" data-bs-target="#viewPaymentModal">
                                            <i class="bi bi-eye"></i>
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
     * View payment details
     * @param {string} paymentId - The payment ID
     */
    async function viewPayment(paymentId) {
        try {
            console.log(`Viewing payment details for ID: ${paymentId}`);
            
            // Call API to get payment details
            // ONLY using real data from the API
            const payment = await api.getPaymentById(paymentId);
            console.log('Payment details received:', payment);
            
            // If no payment data was returned, show error and stop
            if (!payment || Object.keys(payment).length === 0) {
                console.error('No payment data returned from API');
                showNotification('error', 'Could not load payment details from the server.');
                return; // Exit the function
            }
            
            // Ensure payment is an object
            if (!payment || typeof payment !== 'object') {
                console.warn('Expected payment object but got:', typeof payment);
                payment = {};
            }
            
            // Use safe default values if properties are missing
            const reference = payment.reference || 'Unknown';
            const amount = payment.amount || 0;
            const currency = payment.currency || 'USDT';
            const status = payment.status || 'UNKNOWN';
            const createdAt = payment.createdAt || new Date().toISOString();
            const updatedAt = payment.updatedAt || createdAt;
            const address = payment.address || '';
            
            // Update modal with payment details
            const modal = document.getElementById('viewPaymentModal');
            if (modal) {
                try {
                    // Basic payment details
                    modal.querySelector('.modal-title').textContent = `Payment ${reference}`;
                    modal.querySelector('#view-payment-reference').textContent = reference;
                    modal.querySelector('#view-payment-amount').textContent = `${formatAmount(amount)} ${currency}`;
                    modal.querySelector('#view-payment-status').innerHTML = `<span class="badge bg-${getStatusBadgeColor(status)}">${status}</span>`;
                    modal.querySelector('#view-payment-created').textContent = formatDate(createdAt);
                    modal.querySelector('#view-payment-updated').textContent = formatDate(updatedAt);
                    
                    // Address and QR code
                    if (address) {
                        const addressInput = modal.querySelector('#view-payment-address');
                        if (addressInput) {
                            addressInput.value = address;
                            
                            // Set up copy button
                            const copyBtn = modal.querySelector('#copy-payment-address');
                            if (copyBtn) {
                                // Remove any existing event listeners to prevent duplicates
                                const newCopyBtn = copyBtn.cloneNode(true);
                                copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
                                
                                newCopyBtn.addEventListener('click', function() {
                                    addressInput.select();
                                    document.execCommand('copy');
                                    
                                    // Show success notification
                                    showNotification('success', 'Address copied to clipboard');
                                    
                                    // Change button icon temporarily
                                    const originalIcon = newCopyBtn.innerHTML;
                                    newCopyBtn.innerHTML = '<i class="bi bi-check"></i>';
                                    setTimeout(() => {
                                        newCopyBtn.innerHTML = originalIcon;
                                    }, 2000);
                                });
                            }
                            
                            // Generate QR code if library is loaded
                            const qrContainer = modal.querySelector('#view-payment-qr-code');
                            if (qrContainer && typeof QRCode !== 'undefined') {
                                qrContainer.innerHTML = '';
                                try {
                                    new QRCode(qrContainer, {
                                        text: address,
                                        width: 160,
                                        height: 160,
                                        colorDark: '#000000',
                                        colorLight: '#ffffff',
                                        correctLevel: QRCode.CorrectLevel.H
                                    });
                                } catch (qrError) {
                                    console.error('QR code generation error:', qrError);
                                    qrContainer.innerHTML = '<div class="text-muted">Could not generate QR code</div>';
                                }
                            }
                        }
                    }
                    
                    // Transaction details
                    const txDetails = modal.querySelector('#view-payment-tx-details');
                    if (txDetails) {
                        if (payment.transactionId) {
                            txDetails.classList.remove('d-none');
                            modal.querySelector('#view-payment-tx-id').textContent = payment.transactionId;
                            modal.querySelector('#view-payment-confirmations').textContent = payment.confirmations || '0';
                            
                            // Set up blockchain explorer link
                            const explorerLink = modal.querySelector('#view-payment-explorer-link');
                            if (explorerLink) {
                                if (payment.explorerUrl) {
                                    explorerLink.href = payment.explorerUrl;
                                    explorerLink.classList.remove('d-none');
                                } else {
                                    explorerLink.classList.add('d-none');
                                }
                            }
                        } else {
                            txDetails.classList.add('d-none');
                        }
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
        const colors = {
            'pending': 'warning',
            'completed': 'success',
            'confirmed': 'success',
            'failed': 'danger',
            'expired': 'secondary',
            'default': 'secondary'
        };
        return colors[status.toLowerCase()] || colors.default;
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