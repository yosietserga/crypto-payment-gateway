/**
 * Create Payment JavaScript for Crypto Payment Gateway
 * Handles the creation of new payment requests
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the payment creation form
    initPaymentForm();
});

/**
 * Initialize the payment creation form
 */
function initPaymentForm() {
    const paymentForm = document.getElementById('create-payment-form');
    
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Handle form submission
    if (paymentForm) {
        paymentForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            // Validate form
            if (!validateForm()) {
                return;
            }
            
            // Show loading state
            const submitBtn = paymentForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Creating...';
            submitBtn.disabled = true;
            
            try {
                // Collect form data
                // Use the first accepted cryptocurrency as the currency parameter instead of fiat currency
                const acceptedCryptos = getAcceptedCryptocurrencies();
                
                // Ensure at least one cryptocurrency is selected
                if (acceptedCryptos.length === 0) {
                    throw new Error('Please select at least one cryptocurrency');
                }
                
                // Use the first cryptocurrency from the accepted list as the currency parameter
                const paymentData = {
                    expectedAmount: document.getElementById('payment-amount').value,
                    currency: acceptedCryptos[0], // Use cryptocurrency instead of fiat currency
                    fiatCurrency: document.getElementById('payment-currency').value, // Store the fiat currency in metadata
                    metadata: {
                        description: document.getElementById('payment-description').value || '',
                        reference: document.getElementById('payment-reference').value || generateReference(),
                        customer: {
                            email: document.getElementById('customer-email').value || null,
                            name: document.getElementById('customer-name').value || null
                        },
                        acceptedCryptocurrencies: acceptedCryptos,
                        notifications: {
                            notifyCustomer: document.getElementById('notify-customer').checked,
                            notifyMerchant: document.getElementById('notify-merchant').checked
                        },
                        // Add fiat currency to metadata instead
                        fiatCurrency: document.getElementById('payment-currency').value
                    }
                    // Removed callbackUrl since it's optional and causing validation errors
                };
                
                // Call API to create payment address
                const response = await api.generatePaymentAddress(paymentData);
                
                // Show success message
                showNotification('success', 'Payment created successfully!');
                
                // Redirect to payments page after a short delay
                setTimeout(() => {
                    window.location.href = 'payments.html';
                }, 2000);
            } catch (error) {
                // Show error notification
                showNotification('error', `Failed to create payment: ${error.message}`);
            } finally {
                // Restore button state
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // Auto-generate reference if field exists
    const referenceField = document.getElementById('payment-reference');
    if (referenceField && !referenceField.value) {
        referenceField.value = generateReference();
    }
}

/**
 * Validate the payment form
 * @returns {boolean} - Whether the form is valid
 */
function validateForm() {
    let isValid = true;
    
    // Reset previous validation states
    const invalidElements = document.querySelectorAll('.is-invalid');
    invalidElements.forEach(element => {
        element.classList.remove('is-invalid');
    });
    
    // Validate amount (required, must be positive number)
    const amountInput = document.getElementById('payment-amount');
    if (!amountInput.value || parseFloat(amountInput.value) <= 0) {
        amountInput.classList.add('is-invalid');
        isValid = false;
    }
    
    // Validate description (required)
    const descriptionInput = document.getElementById('payment-description');
    if (!descriptionInput.value.trim()) {
        descriptionInput.classList.add('is-invalid');
        isValid = false;
    }
    
    // Validate email format if provided
    const emailInput = document.getElementById('customer-email');
    if (emailInput.value && !isValidEmail(emailInput.value)) {
        emailInput.classList.add('is-invalid');
        isValid = false;
    }
    
    // Validate at least one cryptocurrency is selected
    if (!document.getElementById('accept-btc').checked && 
        !document.getElementById('accept-eth').checked && 
        !document.getElementById('accept-usdt').checked && 
        !document.getElementById('accept-sol').checked) {
        // Add validation message for cryptocurrencies
        const cryptoOptions = document.querySelector('.crypto-options');
        if (cryptoOptions) {
            cryptoOptions.classList.add('is-invalid');
        }
        isValid = false;
    }
    
    return isValid;
}

/**
 * Get the list of accepted cryptocurrencies
 * @returns {Array} - List of accepted cryptocurrency codes
 */
function getAcceptedCryptocurrencies() {
    const acceptedCurrencies = [];
    
    if (document.getElementById('accept-btc').checked) {
        acceptedCurrencies.push('BTC');
    }
    
    if (document.getElementById('accept-eth').checked) {
        acceptedCurrencies.push('ETH');
    }
    
    if (document.getElementById('accept-usdt').checked) {
        acceptedCurrencies.push('USDT');
    }
    
    if (document.getElementById('accept-sol').checked) {
        acceptedCurrencies.push('SOL');
    }
    
    return acceptedCurrencies;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - Whether the email is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);

}

/**
 * Generate a random reference ID
 * @returns {string} - Generated reference ID
 */
function generateReference() {
    const prefix = 'PAY';
    const timestamp = new Date().getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${timestamp}-${random}`;
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
    
    // Add some basic styling if not already defined in CSS
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}