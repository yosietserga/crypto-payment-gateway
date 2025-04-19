/**
 * Crypto Payment Gateway App
 * Handles both payment receiving and payouts
 */

// Configuration
const config = {
    apiBaseUrl: 'https://api.cryptopaymentgateway.com',
    defaultExpiryMinutes: 15,
    refreshInterval: 5000, // 5 seconds
    validateAddressRegex: /^0x[a-fA-F0-9]{40}$/, // Basic Ethereum/BSC address validation
    minAmount: 0.01,
    maxAmount: 10000
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
elements.generatePaymentBtn.addEventListener('click', generatePaymentAddress);
elements.copyAddressBtn.addEventListener('click', copyAddressToClipboard);
elements.cancelPaymentBtn.addEventListener('click', cancelPayment);
elements.returnToMerchantBtn.addEventListener('click', resetToInitScreen);
elements.tryAgainBtn.addEventListener('click', resetToInitScreen);

// Event Listeners - Payout
payoutElements.createPayoutBtn.addEventListener('click', createPayout);
payoutElements.returnToPayoutBtn.addEventListener('click', resetToPayoutInitScreen);
payoutElements.tryPayoutAgainBtn.addEventListener('click', resetToPayoutInitScreen);

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
    
    // Normally, we would call an API here
    // For this demo, we'll simulate the API call
    setTimeout(() => {
        // Simulate successful response
        const response = {
            success: true,
            data: {
                address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
                amount: parseFloat(amount),
                expiresAt: new Date(Date.now() + config.defaultExpiryMinutes * 60 * 1000).toISOString()
            }
        };
        
        if (response.success) {
            // Store data in state
            state.paymentAddress = response.data.address;
            state.paymentAmount = response.data.amount;
            
            // Update UI
            elements.paymentAddress.textContent = response.data.address;
            elements.displayAmount.textContent = response.data.amount.toFixed(2);
            elements.detailAmount.textContent = `${response.data.amount.toFixed(2)} USDT`;
            
            // Generate QR code
            generateQRCode(response.data.address, response.data.amount);
            
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
        
        // Reset button state
        elements.generatePaymentBtn.disabled = false;
        elements.generatePaymentBtn.innerHTML = '<i class="bi bi-qr-code"></i> Generate Payment Address';
    }, 1500);
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
    let pollCount = 0;
    state.activePoll = setInterval(() => {
        pollCount++;
        
        // Normally, we would call an API here to check payment status
        // For this demo, we'll simulate the API call and responses
        
        // Simulate detecting payment after a few polls
        if (pollCount === 3) {
            // Update to detecting payment
            elements.paymentStatus.className = 'payment-status status-confirming';
            elements.paymentStatus.innerHTML = '<p><i class="bi bi-arrow-repeat spin"></i> Payment detected, waiting for confirmation...</p>';
            
            // Update steps
            elements.step2.classList.remove('active');
            elements.step2.classList.add('completed');
            elements.step3.classList.add('active');
        }
        
        // Simulate confirmed payment after more polls
        if (pollCount === 6) {
            // Stop polling and timer
            clearInterval(state.activePoll);
            clearInterval(state.paymentTimerInterval);
            
            // Set confirmed status
            state.paymentStatus = 'confirmed';
            state.txHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            
            // Update confirmation details
            elements.confirmedAmount.textContent = `${state.paymentAmount.toFixed(2)} USDT`;
            elements.confirmedTxId.textContent = state.txHash;
            elements.confirmedStatus.textContent = 'Confirmed';
            
            // Show confirmation screen
            showScreen('confirmationScreen', 'payment');
        }
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
    
    // Normally, we would call an API here
    // For this demo, we'll simulate the API call
    setTimeout(() => {
        // Simulate successful response
        const response = {
            success: true,
            data: {
                id: 'payout_' + Date.now(),
                amount: parseFloat(amount),
                recipient: recipient,
                status: 'processing'
            }
        };
        
        if (response.success) {
            // Store data in state
            state.payoutAmount = response.data.amount;
            state.payoutRecipient = response.data.recipient;
            
            // Update UI
            payoutElements.processingAmount.textContent = `${response.data.amount.toFixed(2)} USDT`;
            payoutElements.processingRecipient.textContent = response.data.recipient;
            payoutElements.processingTxId.textContent = 'Pending...';
            
            // Show processing screen
            showScreen('payoutProcessingScreen', 'payout');
            
            // Update steps
            payoutElements.payoutStep1.classList.remove('active');
            payoutElements.payoutStep1.classList.add('completed');
            payoutElements.payoutStep2.classList.add('active');
            
            // Poll for payout status
            pollPayoutStatus();
        } else {
            // Show error
            payoutElements.payoutErrorMessage.textContent = response.message || 'Failed to create payout';
            showScreen('payoutErrorScreen', 'payout');
        }
        
        // Reset button state
        payoutElements.createPayoutBtn.disabled = false;
        payoutElements.createPayoutBtn.innerHTML = '<i class="bi bi-send"></i> Create Payout';
    }, 1500);
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
    let pollCount = 0;
    state.activePoll = setInterval(() => {
        pollCount++;
        
        // Normally, we would call an API here to check payout status
        // For this demo, we'll simulate the API call and responses
        
        // Simulate completed payout after a few polls
        if (pollCount === 5) {
            // Stop polling
            clearInterval(state.activePoll);
            
            // Set completed status
            state.payoutStatus = 'completed';
            state.payoutTxHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            
            // Update completion details
            payoutElements.completedAmount.textContent = `${state.payoutAmount.toFixed(2)} USDT`;
            payoutElements.completedRecipient.textContent = state.payoutRecipient;
            payoutElements.completedTxId.textContent = state.payoutTxHash;
            
            // Update steps
            payoutElements.payoutStep2.classList.remove('active');
            payoutElements.payoutStep2.classList.add('completed');
            payoutElements.payoutStep3.classList.add('active');
            
            // Show completed screen
            showScreen('payoutCompletedScreen', 'payout');
        }
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