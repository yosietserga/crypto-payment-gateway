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
    callbackUrl: document.getElementById('callbackUrl'),
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
        recipientAddress: elements.recipientAddress.value.trim(),
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
        // Log the error for debugging
        console.error('Payout creation error:', error);
        
        // Extract meaningful error information
        let errorTitle = 'Payout Creation Failed';
        let errorMessage = error.message || 'Failed to create payout';
        let detailedError = error.details || '';
        let actionButton = null;
        
        // Customize error message based on the type of error
        if (errorMessage.includes('Binance API authentication') || errorMessage.includes('Invalid API-key')) {
            errorTitle = 'API Authentication Error';
            errorMessage = 'The system cannot authenticate with Binance. This is likely due to invalid API keys or IP restrictions.';
            detailedError = 'To fix this issue, please update your Binance API keys in the system settings and ensure that your IP address is whitelisted in your Binance account settings.';
            
            // Provide an action button to go to API settings
            actionButton = {
                text: 'Go to Binance Settings',
                action: () => window.location.href = 'binance.html'
            };
        } else if (errorMessage.includes('Insufficient balance')) {
            errorTitle = 'Insufficient Balance';
            errorMessage = 'You don\'t have enough funds to complete this payout.';
            detailedError = 'Please deposit funds to your account or reduce the payout amount.';
        } else if (errorMessage.includes('Merchant account is not active')) {
            errorTitle = 'Account Status Error';
            errorMessage = 'Your merchant account is not active.';
            detailedError = 'Please contact support to activate your account or check your account status in settings.';
        }
        
        // Show the error modal with the customized information
        showErrorModal(errorTitle, errorMessage, detailedError, actionButton);
        
        // Also update the form error section for visibility
        if (elements.formErrors) {
            elements.formErrors.innerHTML = `<strong>${errorTitle}:</strong> ${errorMessage}`;
            elements.formErrors.classList.remove('d-none');
            elements.formErrors.classList.add('alert-danger');
        }
        
        // Re-enable button
        elements.createPayoutBtn.disabled = false;
        elements.createPayoutBtn.innerHTML = 'Create Payout';
    }
}

/**
 * Shows an error modal with customized information
 * @param {string} title - Error title
 * @param {string} message - Main error message
 * @param {string} details - Technical details about the error
 * @param {Object} actionButton - Optional button configuration {text, action}
 */
function showErrorModal(title, message, details, actionButton) {
    // Get modal elements
    const modal = document.getElementById('errorModal');
    if (!modal) return;
    
    // Set modal content
    document.getElementById('error-title').textContent = title || 'Error';
    document.getElementById('error-message').textContent = message || 'An error occurred while processing your request.';
    
    // Handle technical details
    const detailsContainer = document.getElementById('error-details');
    const detailsContent = document.getElementById('error-technical-details');
    
    if (details && detailsContent) {
        detailsContent.textContent = details;
        detailsContainer.style.display = 'block';
    } else if (detailsContainer) {
        detailsContainer.style.display = 'none';
    }
    
    // Handle action button
    const actionBtn = document.getElementById('error-action-btn');
    if (actionButton && actionBtn) {
        actionBtn.textContent = actionButton.text || 'Action';
        actionBtn.style.display = 'block';
        
        // Remove existing event listeners
        const newActionBtn = actionBtn.cloneNode(true);
        actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
        
        // Add new event listener
        newActionBtn.addEventListener('click', () => {
            // Close the modal
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();
            
            // Execute the action
            if (typeof actionButton.action === 'function') {
                actionButton.action();
            }
        });
    } else if (actionBtn) {
        actionBtn.style.display = 'none';
    }
    
    // Show the modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
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
