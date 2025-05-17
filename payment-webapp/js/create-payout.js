/**
 * Create Payout JavaScript for Crypto Payment Gateway
 */

// Configuration
const PAYOUT_CONFIG = {
    minAmount: 0.01,
    maxAmount: 10000,
    // Match both ETH (0x...) and TRC20 (T...) address formats
    addressRegex: /^(0x[a-fA-F0-9]{40}|T[A-Za-z1-9]{33})$/
};

// Initialize API client
const api = new PaymentAPI();

// DOM Elements
const elements = {
    payoutForm: document.getElementById('create-payout-form'),
    payoutAmount: document.getElementById('payoutAmount'),
    recipientAddress: document.getElementById('recipientAddress'),
    payoutCurrency: document.getElementById('payoutCurrency'),
    payoutDescription: document.getElementById('payoutDescription'),
    memo: document.getElementById('memo'),
    webhookUrl: document.getElementById('webhookUrl'),
    networkFee: document.querySelector('input[name="network-fee"]:checked'),
    createPayoutBtn: document.getElementById('createPayoutBtn'),
    formErrors: document.getElementById('form-errors')
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeCreatePayout();
});

/**
 * Initialize payout creation
 */
function initializeCreatePayout() {
    // Check authentication
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Set up event listeners
    setupEventListeners();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.add('show');
        });
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.remove('show');
        });
    }
    
    // Logout functionality
    const logoutLinks = document.querySelectorAll('#logout-link, #header-logout-link');
    logoutLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Clear authentication data
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_data');
            // Redirect to login
            window.location.href = 'login.html';
        });
    });

    // Form submission
    if (elements.payoutForm) {
        elements.payoutForm.addEventListener('submit', handleCreatePayout);
    }

    // Input validation and summary updates
    if (elements.payoutAmount) {
        elements.payoutAmount.addEventListener('input', function() {
            validateAmount();
            updatePayoutSummary();
        });
    }

    if (elements.recipientAddress) {
        elements.recipientAddress.addEventListener('input', validateAddress);
    }
    
    if (elements.payoutCurrency) {
        elements.payoutCurrency.addEventListener('change', function() {
            // Update currency symbol in the UI
            const cryptoSymbol = this.value;
            document.querySelectorAll('.crypto-symbol').forEach(el => {
                el.textContent = cryptoSymbol;
            });
            updatePayoutSummary();
        });
    }
    
    // Initialize summary on page load
    updatePayoutSummary();
}

/**
 * Validate amount input
 */
function validateAmount() {
    const amount = parseFloat(elements.payoutAmount.value);
    
    if (isNaN(amount) || amount < PAYOUT_CONFIG.minAmount) {
        elements.payoutAmount.setCustomValidity(`Amount must be at least ${PAYOUT_CONFIG.minAmount}`);
    } else if (amount > PAYOUT_CONFIG.maxAmount) {
        elements.payoutAmount.setCustomValidity(`Amount cannot exceed ${PAYOUT_CONFIG.maxAmount}`);
    } else {
        elements.payoutAmount.setCustomValidity('');
    }
}

/**
 * Validate address input
 */
function validateAddress() {
    const address = elements.recipientAddress.value.trim();
    
    if (!PAYOUT_CONFIG.addressRegex.test(address)) {
        elements.recipientAddress.setCustomValidity('Please enter a valid Ethereum/BSC address');
    } else {
        elements.recipientAddress.setCustomValidity('');
    }
}

/**
 * Update the payout summary section
 */
function updatePayoutSummary() {
    // Get form values
    const amount = parseFloat(elements.payoutAmount?.value || '0');
    const currency = elements.payoutCurrency?.value || 'USDT';
    const feeOption = document.querySelector('input[name="network-fee"]:checked')?.value || 'regular';
    
    // Calculate fee based on option (simplified example)
    let feePercentage = 0.001; // 0.1% default fee
    
    switch(feeOption) {
        case 'low':
            feePercentage = 0.0005; // 0.05%
            break;
        case 'regular':
            feePercentage = 0.001; // 0.1%
            break;
        case 'high':
            feePercentage = 0.002; // 0.2%
            break;
    }
    
    const fee = amount * feePercentage;
    const total = amount + fee;
    
    // Format values for display with proper decimal places
    const formattedAmount = formatCryptoAmount(amount, currency);
    const formattedFee = formatCryptoAmount(fee, currency);
    const formattedTotal = formatCryptoAmount(total, currency);
    
    // Update summary elements
    const summaryAmount = document.getElementById('summary-amount');
    const summaryFee = document.getElementById('summary-fee');
    const summaryTotal = document.getElementById('summary-total');
    
    if (summaryAmount) summaryAmount.textContent = `${formattedAmount} ${currency}`;
    if (summaryFee) summaryFee.textContent = `${formattedFee} ${currency}`;
    if (summaryTotal) summaryTotal.textContent = `${formattedTotal} ${currency}`;
}

/**
 * Format crypto amount with appropriate decimal places
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} - Formatted amount string
 */
function formatCryptoAmount(amount, currency) {
    let decimals = 2;
    
    // Use appropriate decimal places based on currency
    switch(currency) {
        case 'BTC':
            decimals = 8;
            break;
        case 'ETH':
            decimals = 6;
            break;
        case 'USDT':
        case 'USDC':
            decimals = 2;
            break;
        default:
            decimals = 4;
    }
    
    return amount.toFixed(decimals);
}

/**
 * Handle create payout form submission
 * @param {Event} event - Form submit event
 */
async function handleCreatePayout(event) {
    event.preventDefault();
    
    // Validate form
    if (!elements.payoutForm.checkValidity()) {
        event.stopPropagation();
        elements.payoutForm.classList.add('was-validated');
        return;
    }
    
    // Get form data
    const payoutData = {
        amount: parseFloat(elements.payoutAmount.value),
        destinationAddress: elements.recipientAddress.value.trim(),
        currency: elements.payoutCurrency ? elements.payoutCurrency.value.trim() : 'USDT',
        network: 'BSC', // BSC network is required and validated by the server
        webhookUrl: elements.webhookUrl ? elements.webhookUrl.value.trim() : 'https://example.com/webhook',
        metadata: {
            description: elements.payoutDescription ? elements.payoutDescription.value.trim() : '',
            memo: elements.memo ? elements.memo.value.trim() : '',
            feeOption: elements.networkFee ? elements.networkFee.value : 'regular'
        }
    };
    
    // Disable button to prevent multiple submissions
    elements.createPayoutBtn.disabled = true;
    elements.createPayoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...';
    
    // Clear previous errors
    if (elements.formErrors) {
        elements.formErrors.textContent = '';
        elements.formErrors.classList.add('d-none');
    }
    
    try {
        // Get token from localStorage
        const token = localStorage.getItem('jwt_token');
        
        // Create payout via API client
        const data = await api.createPayout(payoutData);
        
        // If we get here, the payout was created successfully
        
        // Show success message and redirect
        showNotification('Payout created successfully', 'success');
        
        // Redirect to payout details after a short delay
        setTimeout(() => {
            window.location.href = `payouts.html?id=${data.id}`;
        }, 1500);
        
    } catch (error) {
        // Show error message
        console.error('Payout creation error:', error);
        
        // Extract more meaningful error message if available
        let errorMessage = error.message || 'Failed to create payout';
        
        // Check for specific error patterns in the message
        if (errorMessage.includes('Insufficient balance')) {
            // Highlight insufficient balance error
            errorMessage = `<strong>Insufficient Balance:</strong> You don't have enough funds to complete this payout. Please deposit funds or reduce the payout amount.`;
        } else if (errorMessage.includes('validation')) {
            // Format validation errors for better readability
            errorMessage = `<strong>Validation Error:</strong> ${errorMessage.replace('Validation error:', '')}`;
        } else if (errorMessage.includes('network')) {
            // Network-related errors
            errorMessage = `<strong>Network Error:</strong> There was a problem with the selected network. Please try again or select a different network.`;
        }
        
        // Display the error message
        if (elements.formErrors) {
            elements.formErrors.innerHTML = errorMessage;
            elements.formErrors.classList.remove('d-none');
            elements.formErrors.classList.add('alert-danger');
            
            // Scroll to error message
            elements.formErrors.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Re-enable button
        elements.createPayoutBtn.disabled = false;
        elements.createPayoutBtn.innerHTML = 'Create Payout';
    }
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.querySelector('.notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    // Add appropriate class for notification type
    notification.className = `notification notification-${type} show`;
    
    // Set message
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="bi ${type === 'success' ? 'bi-check-circle' : 
                           type === 'error' ? 'bi-exclamation-circle' : 
                           type === 'warning' ? 'bi-exclamation-triangle' : 'bi-info-circle'}"></i>
        </div>
        <div class="notification-content">
            <p>${message}</p>
        </div>
        <button class="notification-close" aria-label="Close">&times;</button>
    `;
    
    // Add event listener to close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
    });
    
    // Automatically hide after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', initializeCreatePayout);
