/**
 * Crypto Payment Gateway App
 * Handles both payment receiving and payouts
 */

// Configuration
const config = {
    apiBaseUrl: 'http://localhost:3000/api/v1', // Use absolute URL with port
    absoluteApiBaseUrl: 'https://eoscryptopago.com/api/v1', // Full URL for cross-domain calls
    apiKey: 'pk_941a83045834ad23c8e38587f2bbf90c', // Production API key
    apiSecret: 'sk_1517e70a64bab54a0a9ea9f9376327dee76e8011f0b22e6d23d8e09e6b2485a6', // Production API secret
    defaultExpiryMinutes: 15,
    refreshInterval: 5000, // 5 seconds
    validateAddressRegex: /^0x[a-fA-F0-9]{40}$/, // Basic Ethereum/BSC address validation
    minAmount: 0.01,
    maxAmount: 10000,
    domain: 'eoscryptopago.com'
};

// App state
const state = {
    paymentAddress: null,
    paymentAmount: 0,
    paymentTimerInterval: null,
    remainingTime: config.defaultExpiryMinutes * 60, // in seconds
    paymentStatus: 'init', // init, pending, confirmed, expired, error
    txHash: null,
    payoutStatus: 'init', // init, processing, completed, error
    payoutTxHash: null,
    activePoll: null
};

// DOM Elements - Payment Flow
const elements = {
    // Payment tabs
    paymentTabs: document.getElementById('paymentTabs'),
    receiveTab: document.getElementById('receive-tab'),
    payoutTab: document.getElementById('payout-tab'),
    
    // Payment screens
    initScreen: document.getElementById('initScreen'),
    paymentScreen: document.getElementById('paymentScreen'),
    confirmationScreen: document.getElementById('confirmationScreen'),
    errorScreen: document.getElementById('errorScreen'),
    
    // Payment form
    paymentAmount: document.getElementById('paymentAmount'),
    merchantCallbackUrl: document.getElementById('merchantCallbackUrl'),
    merchantWebhookUrl: document.getElementById('merchantWebhookUrl'),
    generatePaymentBtn: document.getElementById('generatePaymentBtn'),
    
    // Payment processing
    paymentAddress: document.getElementById('paymentAddress'),
    displayAmount: document.getElementById('displayAmount'),
    detailAmount: document.getElementById('detailAmount'),
    paymentTimer: document.getElementById('paymentTimer'),
    paymentStatus: document.getElementById('paymentStatus'),
    copyAddressBtn: document.getElementById('copyAddressBtn'),
    cancelPaymentBtn: document.getElementById('cancelPaymentBtn'),
    qrCode: document.getElementById('qrCode'),
    
    // Steps
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    
    // Confirmation screen
    confirmedAmount: document.getElementById('confirmedAmount'),
    confirmedTxId: document.getElementById('confirmedTxId'),
    confirmedStatus: document.getElementById('confirmedStatus'),
    returnToMerchantBtn: document.getElementById('returnToMerchantBtn'),
    
    // Error screen
    errorMessage: document.getElementById('errorMessage'),
    tryAgainBtn: document.getElementById('tryAgainBtn')
};

// DOM Elements - Payout Flow
const payoutElements = {
    // Payout screens
    payoutInitScreen: document.getElementById('payoutInitScreen'),
    payoutProcessingScreen: document.getElementById('payoutProcessingScreen'),
    payoutCompletedScreen: document.getElementById('payoutCompletedScreen'),
    payoutErrorScreen: document.getElementById('payoutErrorScreen'),
    
    // Payout form
    payoutAmount: document.getElementById('payoutAmount'),
    recipientAddress: document.getElementById('recipientAddress'),
    payoutCallbackUrl: document.getElementById('payoutCallbackUrl'),
    payoutWebhookUrl: document.getElementById('payoutWebhookUrl'),
    payoutDescription: document.getElementById('payoutDescription'),
    createPayoutBtn: document.getElementById('createPayoutBtn'),
    
    // Payout processing
    processingAmount: document.getElementById('processingAmount'),
    processingRecipient: document.getElementById('processingRecipient'),
    processingTxId: document.getElementById('processingTxId'),
    payoutStatus: document.getElementById('payoutStatus'),
    
    // Payout steps
    payoutStep1: document.getElementById('payoutStep1'),
    payoutStep2: document.getElementById('payoutStep2'),
    payoutStep3: document.getElementById('payoutStep3'),
    
    // Completed screen
    completedAmount: document.getElementById('completedAmount'),
    completedRecipient: document.getElementById('completedRecipient'),
    completedTxId: document.getElementById('completedTxId'),
    returnToPayoutBtn: document.getElementById('returnToPayoutBtn'),
    
    // Error screen
    payoutErrorMessage: document.getElementById('payoutErrorMessage'),
    tryPayoutAgainBtn: document.getElementById('tryPayoutAgainBtn')
};

// Event Listeners - Payment
if (elements.generatePaymentBtn) elements.generatePaymentBtn.addEventListener('click', generatePaymentAddress);
if (elements.copyAddressBtn) elements.copyAddressBtn.addEventListener('click', copyAddressToClipboard);
if (elements.cancelPaymentBtn) elements.cancelPaymentBtn.addEventListener('click', cancelPayment);
if (elements.returnToMerchantBtn) elements.returnToMerchantBtn.addEventListener('click', resetToInitScreen);
if (elements.tryAgainBtn) elements.tryAgainBtn.addEventListener('click', resetToInitScreen);

// Event Listeners - Payout
if (payoutElements.createPayoutBtn) payoutElements.createPayoutBtn.addEventListener('click', createPayout);
if (payoutElements.returnToPayoutBtn) payoutElements.returnToPayoutBtn.addEventListener('click', resetToPayoutInitScreen);
if (payoutElements.tryPayoutAgainBtn) payoutElements.tryPayoutAgainBtn.addEventListener('click', resetToPayoutInitScreen);

// Initialize tabs with Bootstrap
const tabElements = document.querySelectorAll('#paymentTabs button');
tabElements.forEach(tab => {
    tab.addEventListener('click', function(event) {
        event.preventDefault();
        resetAllScreens();
    });
});

/**
 * Helper Functions
 */

// Show a specific screen and hide others
function showScreen(screenId, tabGroup = 'payment') {
    // Determine which elements to use based on tab group
    const screenElements = tabGroup === 'payment' 
        ? [elements.initScreen, elements.paymentScreen, elements.confirmationScreen, elements.errorScreen]
        : [payoutElements.payoutInitScreen, payoutElements.payoutProcessingScreen, payoutElements.payoutCompletedScreen, payoutElements.payoutErrorScreen];
    
    // Hide all screens
    screenElements.forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show the requested screen
    document.getElementById(screenId).classList.add('active');
}

// Format time from seconds to MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Reset all screens to initial state
function resetAllScreens() {
    clearInterval(state.paymentTimerInterval);
    clearInterval(state.activePoll);
    
    // Reset payment screens
    showScreen('initScreen', 'payment');
    showScreen('payoutInitScreen', 'payout');
    
    // Reset steps
    elements.step1.classList.remove('completed', 'active');
    elements.step2.classList.remove('completed', 'active');
    elements.step3.classList.remove('completed', 'active');
    elements.step1.classList.add('active');
    
    payoutElements.payoutStep1.classList.remove('completed', 'active');
    payoutElements.payoutStep2.classList.remove('completed', 'active');
    payoutElements.payoutStep3.classList.remove('completed', 'active');
    payoutElements.payoutStep1.classList.add('active');
    
    // Reset state
    state.paymentStatus = 'init';
    state.payoutStatus = 'init';
    state.remainingTime = config.defaultExpiryMinutes * 60;
    elements.paymentTimer.textContent = formatTime(state.remainingTime);
}

// Reset to payment init screen
function resetToInitScreen() {
    clearInterval(state.paymentTimerInterval);
    clearInterval(state.activePoll);
    state.paymentStatus = 'init';
    showScreen('initScreen', 'payment');
}

// Reset to payout init screen
function resetToPayoutInitScreen() {
    clearInterval(state.activePoll);
    state.payoutStatus = 'init';
    showScreen('payoutInitScreen', 'payout');
}

// Copy address to clipboard
function copyAddressToClipboard() {
    const address = elements.paymentAddress.textContent;
    navigator.clipboard.writeText(address)
        .then(() => {
            const originalText = elements.copyAddressBtn.innerHTML;
            elements.copyAddressBtn.innerHTML = '<i class="bi bi-check"></i>';
            setTimeout(() => {
                elements.copyAddressBtn.innerHTML = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Could not copy text: ', err);
            showNotification('Failed to copy address', 'error');
        });
}

// Show a notification toast
function showNotification(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('id', toastId);
    
    // Toast content
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Initialize and show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // Remove toast after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Validate amount
function validateAmount(amount) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
        return { valid: false, message: 'Amount must be a valid number' };
    }
    if (numAmount < config.minAmount) {
        return { valid: false, message: `Amount must be at least ${config.minAmount} USDT` };
    }
    if (numAmount > config.maxAmount) {
        return { valid: false, message: `Amount must be no more than ${config.maxAmount} USDT` };
    }
    return { valid: true };
}

// Validate BSC address
function validateBscAddress(address) {
    if (!address || !config.validateAddressRegex.test(address)) {
        return { valid: false, message: 'Please enter a valid BEP-20 wallet address' };
    }
    return { valid: true };
}

// Generate HMAC signature for API requests
function generateSignature(timestamp, body) {
    // This would normally be done server-side to protect your API secret
    // For demo purposes, we're doing it client-side, but in production
    // you should have your server generate the signature
    const message = timestamp + (body ? JSON.stringify(body) : '');
    
    // This is a placeholder for actual HMAC signature generation
    // Real implementation would use crypto.createHmac in Node.js or similar in other environments
    console.log('Would generate signature for:', message);
    
    // Return dummy signature for demo purposes
    return 'demo_signature';
}

/**
 * Payment Functions
 */

// Generate payment address
function generatePaymentAddress() {
    const amount = elements.paymentAmount.value;
    const callbackUrl = elements.merchantCallbackUrl.value;
    const webhookUrl = elements.merchantWebhookUrl.value;
    
    // Validate amount
    const validation = validateAmount(amount);
    if (!validation.valid) {
        showNotification(validation.message, 'error');
        return;
    }
    
    // Update UI to show loading state
    elements.generatePaymentBtn.disabled = true;
    elements.generatePaymentBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
    
    // Prepare request body
    const requestBody = {
        currency: 'USDT',
        expectedAmount: amount,
        expiresAt: new Date(Date.now() + config.defaultExpiryMinutes * 60 * 1000).toISOString(),
        callbackUrl: callbackUrl || undefined,
        metadata: {
            webhookUrl: webhookUrl || undefined,
            clientGeneratedAt: new Date().toISOString()
        }
    };
    
    // Generate timestamp for request
    const timestamp = Date.now().toString();
    
    // Make API request to generate payment address
    fetch(`${config.apiBaseUrl}/merchant/payment-addresses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': config.apiKey,
            'X-TIMESTAMP': timestamp,
            'X-SIGNATURE': generateSignature(timestamp, requestBody)
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => {
        if (!response.ok) {
    console.log(response);        return response.json().then(errorData => {
                throw new Error(errorData.error?.message || 'Failed to generate payment address');
            });
        }
        return response.json();
    })
    .then(response => {
        if (response.success) {
            // Store data in state
            state.paymentAddress = response.data.address;
            state.paymentAmount = parseFloat(response.data.expectedAmount);
            state.paymentAddressId = response.data.id;
            
            // Update UI
            elements.paymentAddress.textContent = response.data.address;
            elements.displayAmount.textContent = parseFloat(response.data.expectedAmount).toFixed(2);
            elements.detailAmount.textContent = `${parseFloat(response.data.expectedAmount).toFixed(2)} USDT`;
            
            // Generate QR code
            generateQRCode(response.data.address, response.data.expectedAmount);
            
            // Show payment screen
            showScreen('paymentScreen', 'payment');
            
            // Update steps
            elements.step1.classList.remove('active');
            elements.step1.classList.add('completed');
            elements.step2.classList.add('active');
            
            // Start timer
            startPaymentTimer();
            
            // Start polling for payment status
            pollPaymentStatus();
        } else {
            // Show error
            elements.errorMessage.textContent = response.message || 'Failed to generate payment address';
            showScreen('errorScreen', 'payment');
        }
    })
    .catch(error => {
        console.error('Payment address generation error:', error);
        elements.errorMessage.textContent = error.message || 'Failed to connect to payment server';
        showScreen('errorScreen', 'payment');
    })
    .finally(() => {
        // Reset button state
        elements.generatePaymentBtn.disabled = false;
        elements.generatePaymentBtn.innerHTML = '<i class="bi bi-qr-code"></i> Generate Payment Address';
    });
}

// Generate QR code
function generateQRCode(address, amount) {
    // Create a payment URI (BEP-20 doesn't have an official URI scheme, so we're using Ethereum-like)
    const uri = `ethereum:${address}?value=${amount}&currency=USDT`;
    
    // Generate QR code using qrcode.js library
    QRCode.toCanvas(elements.qrCode, uri, {
        width: 200,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function(error) {
        if (error) {
            console.error('Error generating QR code:', error);
        }
    });
}

// Start payment timer
function startPaymentTimer() {
    // Clear any existing interval
    if (state.paymentTimerInterval) {
        clearInterval(state.paymentTimerInterval);
    }
    
    // Set initial time
    state.remainingTime = config.defaultExpiryMinutes * 60;
    elements.paymentTimer.textContent = formatTime(state.remainingTime);
    
    // Start interval
    state.paymentTimerInterval = setInterval(() => {
        state.remainingTime--;
        
        if (state.remainingTime <= 0) {
            // Timer expired
            clearInterval(state.paymentTimerInterval);
            if (state.paymentStatus === 'pending') {
                // Only show expired if still pending
                elements.paymentStatus.className = 'payment-status status-error';
                elements.paymentStatus.innerHTML = '<p><i class="bi bi-exclamation-triangle"></i> Payment time expired. Please try again.</p>';
                state.paymentStatus = 'expired';
            }
        }
        
        // Update timer display
        elements.paymentTimer.textContent = formatTime(state.remainingTime);
        
        // Add visual indicator when time is running low
        if (state.remainingTime < 60) {
            elements.paymentTimer.classList.add('text-danger');
        }
    }, 1000);
}

// Poll for payment status
function pollPaymentStatus() {
    // Clear any existing polling
    if (state.activePoll) {
        clearInterval(state.activePoll);
    }
    
    // Set initial status
    state.paymentStatus = 'pending';
    elements.paymentStatus.className = 'payment-status status-waiting';
    elements.paymentStatus.innerHTML = '<p><i class="bi bi-hourglass-split"></i> Waiting for payment to be detected...</p>';
    
    // Start polling
    state.activePoll = setInterval(() => {
        if (!state.paymentAddressId) {
            console.error('No payment address ID available for status check');
            return;
        }
        
        // Generate timestamp for request
        const timestamp = Date.now().toString();
        
        // Check payment address status
        fetch(`${config.apiBaseUrl}/merchant/payment-addresses/${state.paymentAddressId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': config.apiKey,
                'X-TIMESTAMP': timestamp,
                'X-SIGNATURE': generateSignature(timestamp)
            }
        })
        .then(response => {
            if (!response.ok) {
    console.log(response);            return response.json().then(errorData => {
                    throw new Error(errorData.error?.message || 'Failed to check payment status');
                });
            }
            return response.json();
        })
        .then(response => {
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to check payment status');
            }
            
            // Check for associated transactions
            if (response.data.transactions && response.data.transactions.length > 0) {
                const latestTransaction = response.data.transactions[0];
                
                if (latestTransaction.status === 'CONFIRMING') {
                    // Payment detected, waiting for confirmations
                    elements.paymentStatus.className = 'payment-status status-confirming';
                    elements.paymentStatus.innerHTML = '<p><i class="bi bi-arrow-repeat spin"></i> Payment detected, waiting for confirmation...</p>';
                    
                    // Update steps
                    elements.step2.classList.remove('active');
                    elements.step2.classList.add('completed');
                    elements.step3.classList.add('active');
                } else if (latestTransaction.status === 'CONFIRMED' || latestTransaction.status === 'COMPLETED') {
                    // Payment confirmed
                    clearInterval(state.activePoll);
                    clearInterval(state.paymentTimerInterval);
                    
                    // Set confirmed status
                    state.paymentStatus = 'confirmed';
                    state.txHash = latestTransaction.txHash;
                    
                    // Update confirmation details
                    elements.confirmedAmount.textContent = `${parseFloat(latestTransaction.amount).toFixed(2)} USDT`;
                    elements.confirmedTxId.textContent = latestTransaction.txHash || latestTransaction.id;
                    elements.confirmedStatus.textContent = 'Confirmed';
                    
                    // Show confirmation screen
                    showScreen('confirmationScreen', 'payment');
                } else if (latestTransaction.status === 'FAILED') {
                    // Payment failed
                    clearInterval(state.activePoll);
                    clearInterval(state.paymentTimerInterval);
                    
                    // Set error status
                    state.paymentStatus = 'error';
                    elements.errorMessage.textContent = 'Payment failed: ' + (latestTransaction.failureReason || 'Unknown error');
                    showScreen('errorScreen', 'payment');
                }
            } else if (response.data.status === 'EXPIRED') {
                // Address expired
                clearInterval(state.activePoll);
                clearInterval(state.paymentTimerInterval);
                
                elements.paymentStatus.className = 'payment-status status-error';
                elements.paymentStatus.innerHTML = '<p><i class="bi bi-exclamation-triangle"></i> Payment time expired. Please try again.</p>';
                state.paymentStatus = 'expired';
            }
        })
        .catch(error => {
            console.error('Error checking payment status:', error);
            // Don't stop polling on temporary errors
        });
    }, config.refreshInterval);
}

// Cancel payment
function cancelPayment() {
    clearInterval(state.paymentTimerInterval);
    clearInterval(state.activePoll);
    resetToInitScreen();
}

/**
 * Payout Functions
 */

// Create payout
function createPayout() {
    const amount = payoutElements.payoutAmount.value;
    const recipient = payoutElements.recipientAddress.value;
    const callbackUrl = payoutElements.payoutCallbackUrl.value;
    const webhookUrl = payoutElements.payoutWebhookUrl.value;
    const description = payoutElements.payoutDescription.value;
    
    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
        showNotification(amountValidation.message, 'error');
        return;
    }
    
    // Validate recipient address
    const addressValidation = validateBscAddress(recipient);
    if (!addressValidation.valid) {
        showNotification(addressValidation.message, 'error');
        return;
    }
    
    // Update UI to show loading state
    payoutElements.createPayoutBtn.disabled = true;
    payoutElements.createPayoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
    
    // Prepare request body
    const requestBody = {
        amount: amount,
        currency: 'USDT',
        network: 'BSC',
        recipientAddress: recipient,
        webhookUrl: webhookUrl || undefined,
        metadata: {
            description: description || undefined,
            callbackUrl: callbackUrl || undefined,
            clientGeneratedAt: new Date().toISOString()
        }
    };
    
    // Generate timestamp for request
    const timestamp = Date.now().toString();
    
    // Make API request to create payout
    fetch(`${config.apiBaseUrl}/merchant/payouts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': config.apiKey,
            'X-TIMESTAMP': timestamp,
            'X-SIGNATURE': generateSignature(timestamp, requestBody)
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => {
        if (!response.ok) {
    console.log(response);        return response.json().then(errorData => {
                throw new Error(errorData.error?.message || 'Failed to create payout');
            });
        }
        return response.json();
    })
    .then(response => {
        if (response.success) {
            // Store payout data
            state.payoutId = response.data.id;
            state.payoutAmount = parseFloat(response.data.amount);
            state.payoutRecipient = response.data.recipientAddress;
            
            // Update UI
            payoutElements.processingAmount.textContent = `${parseFloat(response.data.amount).toFixed(2)} USDT`;
            payoutElements.processingRecipient.textContent = response.data.recipientAddress;
            payoutElements.processingTxId.textContent = response.data.id;
            
            // Show processing screen
            showScreen('payoutProcessingScreen', 'payout');
            
            // Update steps
            payoutElements.payoutStep1.classList.remove('active');
            payoutElements.payoutStep1.classList.add('completed');
            payoutElements.payoutStep2.classList.add('active');
            
            // Start polling for payout status
            pollPayoutStatus();
        } else {
            // Show error
            payoutElements.payoutErrorMessage.textContent = response.message || 'Failed to create payout';
            showScreen('payoutErrorScreen', 'payout');
        }
    })
    .catch(error => {
        console.error('Payout creation error:', error);
        payoutElements.payoutErrorMessage.textContent = error.message || 'Failed to connect to payment server';
        showScreen('payoutErrorScreen', 'payout');
    })
    .finally(() => {
        // Reset button state
        payoutElements.createPayoutBtn.disabled = false;
        payoutElements.createPayoutBtn.innerHTML = '<i class="bi bi-send"></i> Create Payout';
    });
}

// Poll for payout status
function pollPayoutStatus() {
    // Clear any existing polling
    if (state.activePoll) {
        clearInterval(state.activePoll);
    }
    
    // Set initial status
    state.payoutStatus = 'processing';
    
    // Start polling
    state.activePoll = setInterval(() => {
        if (!state.payoutId) {
            console.error('No payout ID available for status check');
            return;
        }
        
        // Generate timestamp for request
        const timestamp = Date.now().toString();
        
        // Check payout status
        fetch(`${config.apiBaseUrl}/merchant/payouts/${state.payoutId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': config.apiKey,
                'X-TIMESTAMP': timestamp,
                'X-SIGNATURE': generateSignature(timestamp)
            }
        })
        .then(response => {
            if (!response.ok) {
    console.log(response);            return response.json().then(errorData => {
                    throw new Error(errorData.error?.message || 'Failed to check payout status');
                });
            }
            return response.json();
        })
        .then(response => {
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to check payout status');
            }
            
            // Update transaction ID if available
            if (response.data.txHash) {
                payoutElements.processingTxId.textContent = response.data.txHash;
                state.payoutTxHash = response.data.txHash;
            }
            
            // Check status
            if (response.data.status === 'COMPLETED') {
                // Payout completed successfully
                clearInterval(state.activePoll);
                
                // Set completed status
                state.payoutStatus = 'completed';
                
                // Update completion details
                payoutElements.completedAmount.textContent = `${parseFloat(response.data.amount).toFixed(2)} USDT`;
                payoutElements.completedRecipient.textContent = response.data.recipientAddress;
                payoutElements.completedTxId.textContent = response.data.txHash || response.data.id;
                
                // Update steps
                payoutElements.payoutStep2.classList.remove('active');
                payoutElements.payoutStep2.classList.add('completed');
                payoutElements.payoutStep3.classList.add('active');
                
                // Show completed screen
                showScreen('payoutCompletedScreen', 'payout');
            } else if (response.data.status === 'FAILED') {
                // Payout failed
                clearInterval(state.activePoll);
                
                // Set error status
                state.payoutStatus = 'error';
                
                // Show error screen
                payoutElements.payoutErrorMessage.textContent = 
                    response.data.failureReason || 'Payout failed. Please try again.';
                showScreen('payoutErrorScreen', 'payout');
            }
            // For other statuses (processing, pending), continue polling
        })
        .catch(error => {
            console.error('Error checking payout status:', error);
            // Don't stop polling on temporary errors
        });
    }, config.refreshInterval);
}

// Initialize the application
function initApp() {
    // Initialize tabs
    resetAllScreens();
    
    // Set default values if needed
    elements.paymentAmount.value = "10.00";
}

// Run the initialization
document.addEventListener('DOMContentLoaded', initApp);