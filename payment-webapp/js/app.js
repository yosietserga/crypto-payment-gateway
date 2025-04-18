/**
 * Crypto Payment Gateway App
 * Handles both payment receiving and payouts
 */

// Configuration
const API_URL = '/api/v1'; // Base API URL
const API_KEY = ''; // Set your API key here or load it from storage

// App State
let currentPaymentAddress = null;
let countdownInterval = null;
let currentTransaction = null;
let currentPayout = null;
let pollingInterval = null;

// DOM Elements - Payment Flow
const initScreen = document.getElementById('initScreen');
const paymentScreen = document.getElementById('paymentScreen');
const confirmationScreen = document.getElementById('confirmationScreen');
const errorScreen = document.getElementById('errorScreen');

// DOM Elements - Payout Flow
const payoutInitScreen = document.getElementById('payoutInitScreen');
const payoutProcessingScreen = document.getElementById('payoutProcessingScreen');
const payoutCompletedScreen = document.getElementById('payoutCompletedScreen');
const payoutErrorScreen = document.getElementById('payoutErrorScreen');

// DOM Elements - Payment Fields
const paymentAmountField = document.getElementById('paymentAmount');
const merchantCallbackUrlField = document.getElementById('merchantCallbackUrl');
const merchantWebhookUrlField = document.getElementById('merchantWebhookUrl');
const generatePaymentBtn = document.getElementById('generatePaymentBtn');
const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const paymentAddressField = document.getElementById('paymentAddress');
const qrCodeContainer = document.getElementById('qrCode');
const displayAmountField = document.getElementById('displayAmount');
const detailAmountField = document.getElementById('detailAmount');
const paymentTimerField = document.getElementById('paymentTimer');
const paymentStatusField = document.getElementById('paymentStatus');
const confirmedAmountField = document.getElementById('confirmedAmount');
const confirmedTxIdField = document.getElementById('confirmedTxId');
const confirmedStatusField = document.getElementById('confirmedStatus');
const errorMessageField = document.getElementById('errorMessage');
const returnToMerchantBtn = document.getElementById('returnToMerchantBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');

// DOM Elements - Payout Fields
const payoutAmountField = document.getElementById('payoutAmount');
const recipientAddressField = document.getElementById('recipientAddress');
const payoutCallbackUrlField = document.getElementById('payoutCallbackUrl');
const payoutWebhookUrlField = document.getElementById('payoutWebhookUrl');
const payoutDescriptionField = document.getElementById('payoutDescription');
const createPayoutBtn = document.getElementById('createPayoutBtn');
const processingAmountField = document.getElementById('processingAmount');
const processingRecipientField = document.getElementById('processingRecipient');
const processingTxIdField = document.getElementById('processingTxId');
const payoutStatusField = document.getElementById('payoutStatus');
const completedAmountField = document.getElementById('completedAmount');
const completedRecipientField = document.getElementById('completedRecipient');
const completedTxIdField = document.getElementById('completedTxId');
const payoutErrorMessageField = document.getElementById('payoutErrorMessage');
const returnToPayoutBtn = document.getElementById('returnToPayoutBtn');
const tryPayoutAgainBtn = document.getElementById('tryPayoutAgainBtn');

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners for payment flow
    generatePaymentBtn.addEventListener('click', generatePaymentAddress);
    cancelPaymentBtn.addEventListener('click', cancelPayment);
    copyAddressBtn.addEventListener('click', copyAddressToClipboard);
    returnToMerchantBtn.addEventListener('click', returnToMerchant);
    tryAgainBtn.addEventListener('click', resetPaymentFlow);
    
    // Set up event listeners for payout flow
    createPayoutBtn.addEventListener('click', createPayout);
    returnToPayoutBtn.addEventListener('click', resetPayoutFlow);
    tryPayoutAgainBtn.addEventListener('click', resetPayoutFlow);
    
    // Load API key from localStorage if available
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiKey) {
        API_KEY = savedApiKey;
    }
});

// ==================== Payment Flow Functions ====================

/**
 * Generate a new payment address
 */
async function generatePaymentAddress() {
    try {
        const amount = parseFloat(paymentAmountField.value);
        if (isNaN(amount) || amount <= 0) {
            showError('Please enter a valid amount');
            return;
        }
        
        // Show values in the payment screen
        displayAmountField.textContent = amount.toFixed(2);
        detailAmountField.textContent = amount.toFixed(2);
        
        // Prepare the request data
        const requestData = {
            expectedAmount: amount,
            currency: 'USDT',
            callbackUrl: merchantCallbackUrlField.value || undefined,
            webhookUrl: merchantWebhookUrlField.value || undefined,
            expiresIn: 900 // 15 minutes
        };
        
        // Call the API to generate a new payment address
        const response = await fetch(`${API_URL}/addresses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to generate payment address: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data || !data.data.address) {
            throw new Error('Invalid response from server');
        }
        
        // Store the payment address
        currentPaymentAddress = data.data;
        
        // Show the payment address
        paymentAddressField.textContent = currentPaymentAddress.address;
        
        // Generate QR code
        await generateQRCode(currentPaymentAddress.address, amount);
        
        // Show the payment screen
        showScreen('payment');
        
        // Start the countdown timer
        startCountdown(new Date(currentPaymentAddress.expiresAt));
        
        // Start polling for payment status
        startPaymentStatusPolling(currentPaymentAddress.id);
        
    } catch (error) {
        console.error('Error generating payment address:', error);
        showError(error.message);
    }
}

/**
 * Generate QR code for the payment
 */
async function generateQRCode(address, amount) {
    try {
        // Generate QR code for the payment
        const qrData = `ethereum:${address}?value=0&asset=USDT&amount=${amount}`;
        
        await QRCode.toCanvas(qrCodeContainer, qrData, {
            width: 200,
            margin: 1,
            color: {
                dark: '#2c3e50',
                light: '#ffffff'
            }
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        // If QR code generation fails, still show the address
    }
}

/**
 * Start countdown timer for payment expiration
 */
function startCountdown(expiryTime) {
    // Clear any existing countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    countdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = new Date(expiryTime).getTime() - now;
        
        // Calculate time remaining
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        // Display time remaining
        paymentTimerField.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Check if the countdown is finished
        if (distance < 0) {
            clearInterval(countdownInterval);
            paymentTimerField.textContent = '00:00';
            showError('Payment time expired');
            stopPaymentStatusPolling();
        }
    }, 1000);
}

/**
 * Start polling for payment status
 */
function startPaymentStatusPolling(addressId) {
    // Clear any existing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Poll every 5 seconds
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/addresses/${addressId}/transactions`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to get payment status: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.data && data.data.transactions && data.data.transactions.length > 0) {
                // Get the most recent transaction
                const transaction = data.data.transactions[0];
                currentTransaction = transaction;
                
                // Update the UI based on transaction status
                updatePaymentStatus(transaction);
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
        }
    }, 5000);
}

/**
 * Update the payment status UI
 */
function updatePaymentStatus(transaction) {
    // Update the step indicators
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    
    switch (transaction.status) {
        case 'pending':
            step1.classList.add('active');
            step2.classList.remove('active', 'completed');
            step3.classList.remove('active', 'completed');
            paymentStatusField.className = 'payment-status status-pending';
            paymentStatusField.innerHTML = '<p><i class="bi bi-hourglass-split"></i> Waiting for payment...</p>';
            break;
            
        case 'confirming':
            step1.classList.add('completed');
            step2.classList.add('active');
            step3.classList.remove('active', 'completed');
            paymentStatusField.className = 'payment-status status-confirming';
            paymentStatusField.innerHTML = `<p><i class="bi bi-arrow-repeat"></i> Confirming payment... (${transaction.confirmations} confirmations)</p>`;
            break;
            
        case 'confirmed':
        case 'completed':
            step1.classList.add('completed');
            step2.classList.add('completed');
            step3.classList.add('active');
            
            // Stop polling and countdown
            stopPaymentStatusPolling();
            
            // Show confirmation screen
            confirmedAmountField.textContent = `${transaction.amount} ${transaction.currency}`;
            confirmedTxIdField.textContent = transaction.txHash;
            confirmedStatusField.textContent = 'Confirmed';
            
            // Show the confirmation screen
            showScreen('confirmation');
            break;
            
        case 'failed':
            // Show error screen
            showError('Payment failed: Transaction was rejected by the network');
            break;
            
        case 'expired':
            // Show error screen
            showError('Payment expired: The payment window has closed');
            break;
    }
}

/**
 * Stop polling for payment status
 */
function stopPaymentStatusPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

/**
 * Copy payment address to clipboard
 */
function copyAddressToClipboard() {
    if (!currentPaymentAddress || !currentPaymentAddress.address) {
        return;
    }
    
    navigator.clipboard.writeText(currentPaymentAddress.address)
        .then(() => {
            const originalText = copyAddressBtn.innerHTML;
            copyAddressBtn.innerHTML = '<i class="bi bi-check"></i> Copied!';
            
            setTimeout(() => {
                copyAddressBtn.innerHTML = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy address:', err);
        });
}

/**
 * Cancel the current payment
 */
function cancelPayment() {
    stopPaymentStatusPolling();
    resetPaymentFlow();
}

/**
 * Return to merchant site
 */
function returnToMerchant() {
    // If callback URL is specified, redirect to it
    if (currentPaymentAddress && currentPaymentAddress.callbackUrl) {
        window.location.href = currentPaymentAddress.callbackUrl;
    } else {
        // Otherwise reset the flow
        resetPaymentFlow();
    }
}

/**
 * Reset the payment flow
 */
function resetPaymentFlow() {
    // Reset current payment address
    currentPaymentAddress = null;
    currentTransaction = null;
    
    // Stop polling and countdown
    stopPaymentStatusPolling();
    
    // Clear form fields
    // paymentAmountField.value = '';
    // merchantCallbackUrlField.value = '';
    // merchantWebhookUrlField.value = '';
    
    // Show the initial screen
    showScreen('init');
}

// ==================== Payout Flow Functions ====================

/**
 * Create a new payout
 */
async function createPayout() {
    try {
        const amount = parseFloat(payoutAmountField.value);
        const recipientAddress = recipientAddressField.value.trim();
        
        if (isNaN(amount) || amount <= 0) {
            showPayoutError('Please enter a valid amount');
            return;
        }
        
        if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
            showPayoutError('Please enter a valid BEP-20 wallet address');
            return;
        }
        
        // Prepare the request data
        const requestData = {
            amount: amount,
            recipientAddress: recipientAddress,
            currency: 'USDT',
            network: 'BSC',
            callbackUrl: payoutCallbackUrlField.value || undefined,
            webhookUrl: payoutWebhookUrlField.value || undefined,
            metadata: payoutDescriptionField.value ? { description: payoutDescriptionField.value } : undefined
        };
        
        // Call the API to create a payout
        const response = await fetch(`${API_URL}/transactions/payout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create payout: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data) {
            throw new Error('Invalid response from server');
        }
        
        // Store the payout data
        currentPayout = data.data;
        
        // Show payout data in the processing screen
        processingAmountField.textContent = `${currentPayout.amount} ${currentPayout.currency}`;
        processingRecipientField.textContent = currentPayout.recipientAddress;
        processingTxIdField.textContent = currentPayout.id;
        
        // Show the processing screen
        showPayoutScreen('processing');
        
        // Start polling for payout status
        startPayoutStatusPolling(currentPayout.id);
        
    } catch (error) {
        console.error('Error creating payout:', error);
        showPayoutError(error.message);
    }
}

/**
 * Start polling for payout status
 */
function startPayoutStatusPolling(payoutId) {
    // Clear any existing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Poll every 5 seconds
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/transactions/${payoutId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to get payout status: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.data) {
                // Update the current payout
                currentPayout = data.data;
                
                // Update the UI based on payout status
                updatePayoutStatus(currentPayout);
            }
        } catch (error) {
            console.error('Error checking payout status:', error);
        }
    }, 5000);
}

/**
 * Update the payout status UI
 */
function updatePayoutStatus(payout) {
    // Update the step indicators
    const payoutStep1 = document.getElementById('payoutStep1');
    const payoutStep2 = document.getElementById('payoutStep2');
    const payoutStep3 = document.getElementById('payoutStep3');
    
    switch (payout.status) {
        case 'pending':
            payoutStep1.classList.add('completed');
            payoutStep2.classList.add('active');
            payoutStep3.classList.remove('active', 'completed');
            payoutStatusField.className = 'payment-status status-confirming';
            payoutStatusField.innerHTML = '<p><i class="bi bi-arrow-repeat spin"></i> Processing your payout request...</p>';
            break;
            
        case 'confirming':
            payoutStep1.classList.add('completed');
            payoutStep2.classList.add('active');
            payoutStep3.classList.remove('active', 'completed');
            payoutStatusField.className = 'payment-status status-confirming';
            payoutStatusField.innerHTML = `<p><i class="bi bi-arrow-repeat spin"></i> Processing payout... (${payout.confirmations || 0} confirmations)</p>`;
            break;
            
        case 'confirmed':
        case 'completed':
            payoutStep1.classList.add('completed');
            payoutStep2.classList.add('completed');
            payoutStep3.classList.add('completed');
            
            // Stop polling
            stopPayoutStatusPolling();
            
            // Show completion screen
            completedAmountField.textContent = `${payout.amount} ${payout.currency}`;
            completedRecipientField.textContent = payout.recipientAddress;
            completedTxIdField.textContent = payout.txHash || payout.id;
            
            // Show the completed screen
            showPayoutScreen('completed');
            break;
            
        case 'failed':
            // Stop polling
            stopPayoutStatusPolling();
            
            // Show error screen
            showPayoutError('Payout failed: ' + (payout.metadata?.error || 'Transaction was rejected by the network'));
            break;
    }
}

/**
 * Stop polling for payout status
 */
function stopPayoutStatusPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

/**
 * Reset the payout flow
 */
function resetPayoutFlow() {
    // Reset current payout
    currentPayout = null;
    
    // Stop polling
    stopPayoutStatusPolling();
    
    // Clear form fields
    payoutAmountField.value = '';
    recipientAddressField.value = '';
    payoutCallbackUrlField.value = '';
    payoutWebhookUrlField.value = '';
    payoutDescriptionField.value = '';
    
    // Show the initial screen
    showPayoutScreen('init');
}

// ==================== Utility Functions ====================

/**
 * Show a specific payment screen
 */
function showScreen(screenType) {
    // Hide all screens
    initScreen.classList.remove('active');
    paymentScreen.classList.remove('active');
    confirmationScreen.classList.remove('active');
    errorScreen.classList.remove('active');
    
    // Show the specified screen
    switch (screenType) {
        case 'init':
            initScreen.classList.add('active');
            break;
        case 'payment':
            paymentScreen.classList.add('active');
            break;
        case 'confirmation':
            confirmationScreen.classList.add('active');
            break;
        case 'error':
            errorScreen.classList.add('active');
            break;
    }
}

/**
 * Show a specific payout screen
 */
function showPayoutScreen(screenType) {
    // Hide all screens
    payoutInitScreen.classList.remove('active');
    payoutProcessingScreen.classList.remove('active');
    payoutCompletedScreen.classList.remove('active');
    payoutErrorScreen.classList.remove('active');
    
    // Show the specified screen
    switch (screenType) {
        case 'init':
            payoutInitScreen.classList.add('active');
            break;
        case 'processing':
            payoutProcessingScreen.classList.add('active');
            break;
        case 'completed':
            payoutCompletedScreen.classList.add('active');
            break;
        case 'error':
            payoutErrorScreen.classList.add('active');
            break;
    }
}

/**
 * Show payment error message
 */
function showError(message) {
    errorMessageField.textContent = message;
    showScreen('error');
    stopPaymentStatusPolling();
}

/**
 * Show payout error message
 */
function showPayoutError(message) {
    payoutErrorMessageField.textContent = message;
    showPayoutScreen('error');
    stopPayoutStatusPolling();
} 