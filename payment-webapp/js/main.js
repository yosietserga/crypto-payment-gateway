/**
 * Crypto Payment Gateway - Main Application Entry
 * Initializes the application and connects components
 */

// Configuration
const config = {
    apiBaseUrl: 'http://localhost:3000/api/v1', // Use absolute URL with port
    absoluteApiBaseUrl: 'http://localhost:3000/api/v1', // Full URL for cross-domain calls
    apiKey: 'pk_941a83045834ad23c8e38587f2bbf90c', // Production API key
    apiSecret: 'sk_1517e70a64bab54a0a9ea9f9376327dee76e8011f0b22e6d23d8e09e6b2485a6', // Production API secret
    defaultExpiryMinutes: 15,
    refreshInterval: 5000, // 5 seconds
    validateAddressRegex: /^0x[a-fA-F0-9]{40}$/, // Basic Ethereum/BSC address validation
    minAmount: 0.01,
    maxAmount: 10000,
    domain: window.location.hostname || 'eoscryptopago.com'
};

// Initialize API client
const apiClient = new PaymentApiClient(config);

// Global app state
const state = {
    paymentAddress: null,
    paymentAmount: 0,
    paymentTimerInterval: null,
    remainingTime: config.defaultExpiryMinutes * 60, // in seconds
    paymentStatus: 'init', // init, pending, confirmed, expired, error
    txHash: null,
    payoutStatus: 'init', // init, processing, completed, error
    payoutTxHash: null,
    activePoll: null,
    paymentAddressId: null,
    payoutId: null,
    payoutAmount: null,
    payoutRecipient: null
};

// Make state available to the mock API
window.state = state;

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

// Initialize the UI Manager
const uiManager = new PaymentUIManager(elements, payoutElements);

// Helper functions
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

function validateBscAddress(address) {
    if (!address || !config.validateAddressRegex.test(address)) {
        return { valid: false, message: 'Please enter a valid BEP-20 wallet address' };
    }
    return { valid: true };
}

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
            uiManager.showNotification('Failed to copy address', 'error');
        });
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Payment and payout processes
async function generatePaymentAddress() {
    const amount = elements.paymentAmount.value;
    const callbackUrl = elements.merchantCallbackUrl.value;
    const webhookUrl = elements.merchantWebhookUrl.value;
    
    // Validate amount
    const validation = validateAmount(amount);
    if (!validation.valid) {
        uiManager.showNotification(validation.message, 'error');
        return;
    }
    
    // Update UI to show loading state
    uiManager.setPaymentButtonLoading(true);
    
    try {
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
        
        // Make API request
        const response = await apiClient.generatePaymentAddress(requestBody);
        
        if (response.success) {
            // Store data in state
            state.paymentAddress = response.data.address;
            state.paymentAmount = parseFloat(response.data.expectedAmount);
            state.paymentAddressId = response.data.id;
            
            // Update UI
            uiManager.updatePaymentAddress(response.data.address, response.data.expectedAmount);
            
            // Show payment screen
            uiManager.showScreen('paymentScreen', 'payment');
            
            // Update steps
            uiManager.updatePaymentSteps(2);
            
            // Start timer
            startPaymentTimer();
            
            // Start polling for payment status
            pollPaymentStatus();
        } else {
            // Show error
            uiManager.setErrorMessage(response.message || 'Failed to generate payment address');
            uiManager.showScreen('errorScreen', 'payment');
        }
    } catch (error) {
        console.error('Payment address generation error:', error);
        uiManager.setErrorMessage(error.message || 'Failed to connect to payment server');
        uiManager.showScreen('errorScreen', 'payment');
    } finally {
        // Reset button state
        uiManager.setPaymentButtonLoading(false);
    }
}

function startPaymentTimer() {
    // Clear any existing interval
    if (state.paymentTimerInterval) {
        clearInterval(state.paymentTimerInterval);
    }
    
    // Set initial time
    state.remainingTime = config.defaultExpiryMinutes * 60;
    uiManager.updateTimerDisplay(state.remainingTime);
    
    // Start interval
    state.paymentTimerInterval = setInterval(() => {
        state.remainingTime--;
        
        if (state.remainingTime <= 0) {
            // Timer expired
            clearInterval(state.paymentTimerInterval);
            if (state.paymentStatus === 'pending') {
                // Only show expired if still pending
                uiManager.updatePaymentStatus('expired');
                state.paymentStatus = 'expired';
            }
        }
        
        // Update timer display
        uiManager.updateTimerDisplay(state.remainingTime);
    }, 1000);
}

async function pollPaymentStatus() {
    // Clear any existing polling
    if (state.activePoll) {
        clearInterval(state.activePoll);
    }
    
    // Set initial status
    state.paymentStatus = 'pending';
    uiManager.updatePaymentStatus('waiting');
    
    // Start polling
    state.activePoll = setInterval(async () => {
        if (!state.paymentAddressId) {
            console.error('No payment address ID available for status check');
            return;
        }
        
        try {
            // Check payment address status
            const response = await apiClient.getPaymentAddress(state.paymentAddressId);
            
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to check payment status');
            }
            
            // Check for associated transactions
            if (response.data.transactions && response.data.transactions.length > 0) {
                const latestTransaction = response.data.transactions[0];
                
                if (latestTransaction.status === 'CONFIRMING') {
                    // Payment detected, waiting for confirmations
                    uiManager.updatePaymentStatus('confirming');
                    
                    // Update steps
                    uiManager.updatePaymentSteps(3);
                } else if (latestTransaction.status === 'CONFIRMED' || latestTransaction.status === 'COMPLETED') {
                    // Payment confirmed
                    clearInterval(state.activePoll);
                    clearInterval(state.paymentTimerInterval);
                    
                    // Set confirmed status
                    state.paymentStatus = 'confirmed';
                    state.txHash = latestTransaction.txHash;
                    
                    // Update confirmation details
                    uiManager.updateConfirmationDetails({
                        amount: latestTransaction.amount,
                        txHash: latestTransaction.txHash,
                        id: latestTransaction.id,
                        status: 'Confirmed'
                    });
                    
                    // Show confirmation screen
                    uiManager.showScreen('confirmationScreen', 'payment');
                } else if (latestTransaction.status === 'FAILED') {
                    // Payment failed
                    clearInterval(state.activePoll);
                    clearInterval(state.paymentTimerInterval);
                    
                    // Set error status
                    state.paymentStatus = 'error';
                    uiManager.setErrorMessage('Payment failed: ' + (latestTransaction.failureReason || 'Unknown error'));
                    uiManager.showScreen('errorScreen', 'payment');
                }
            } else if (response.data.status === 'EXPIRED') {
                // Address expired
                clearInterval(state.activePoll);
                clearInterval(state.paymentTimerInterval);
                
                uiManager.updatePaymentStatus('expired');
                state.paymentStatus = 'expired';
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            // Don't stop polling on temporary errors
        }
    }, config.refreshInterval);
}

async function createPayout() {
    const amount = payoutElements.payoutAmount.value;
    const recipient = payoutElements.recipientAddress.value;
    const callbackUrl = payoutElements.payoutCallbackUrl.value;
    const webhookUrl = payoutElements.payoutWebhookUrl.value;
    const description = payoutElements.payoutDescription.value;
    
    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
        uiManager.showNotification(amountValidation.message, 'error');
        return;
    }
    
    // Validate recipient address
    const addressValidation = validateBscAddress(recipient);
    if (!addressValidation.valid) {
        uiManager.showNotification(addressValidation.message, 'error');
        return;
    }
    
    // Update UI to show loading state
    uiManager.setPayoutButtonLoading(true);
    
    try {
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
        
        // Make API request
        const response = await apiClient.createPayout(requestBody);
        
        if (response.success) {
            // Store payout data
            state.payoutId = response.data.id;
            state.payoutAmount = parseFloat(response.data.amount);
            state.payoutRecipient = response.data.recipientAddress;
            
            // Update UI
            uiManager.updatePayoutProcessingDetails(response.data);
            
            // Show processing screen
            uiManager.showScreen('payoutProcessingScreen', 'payout');
            
            // Update steps
            uiManager.updatePayoutSteps(2);
            
            // Start polling for payout status
            pollPayoutStatus();
        } else {
            // Show error
            uiManager.setErrorMessage(response.message || 'Failed to create payout', 'payout');
            uiManager.showScreen('payoutErrorScreen', 'payout');
        }
    } catch (error) {
        console.error('Payout creation error:', error);
        uiManager.setErrorMessage(error.message || 'Failed to connect to payment server', 'payout');
        uiManager.showScreen('payoutErrorScreen', 'payout');
    } finally {
        // Reset button state
        uiManager.setPayoutButtonLoading(false);
    }
}

async function pollPayoutStatus() {
    // Clear any existing polling
    if (state.activePoll) {
        clearInterval(state.activePoll);
    }
    
    // Set initial status
    state.payoutStatus = 'processing';
    uiManager.updatePayoutStatus('processing');
    
    // Start polling
    state.activePoll = setInterval(async () => {
        if (!state.payoutId) {
            console.error('No payout ID available for status check');
            return;
        }
        
        try {
            // Check payout status
            const response = await apiClient.getPayout(state.payoutId);
            
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
                uiManager.updatePayoutConfirmationDetails(response.data);
                
                // Update steps
                uiManager.updatePayoutSteps(3);
                
                // Show completed screen
                uiManager.showScreen('payoutCompletedScreen', 'payout');
            } else if (response.data.status === 'FAILED') {
                // Payout failed
                clearInterval(state.activePoll);
                
                // Set error status
                state.payoutStatus = 'error';
                
                // Show error screen
                uiManager.setErrorMessage(
                    response.data.failureReason || 'Payout failed. Please try again.',
                    'payout'
                );
                uiManager.showScreen('payoutErrorScreen', 'payout');
            }
            // For other statuses (processing, pending), continue polling
        } catch (error) {
            console.error('Error checking payout status:', error);
            // Don't stop polling on temporary errors
        }
    }, config.refreshInterval);
}

// Event handlers setup
function setupEventListeners() {
    // Payment flow events
    if (elements.generatePaymentBtn) {
        elements.generatePaymentBtn.addEventListener('click', generatePaymentAddress);
    }
    
    if (elements.copyAddressBtn) {
        elements.copyAddressBtn.addEventListener('click', copyAddressToClipboard);
    }
    
    if (elements.cancelPaymentBtn) {
        elements.cancelPaymentBtn.addEventListener('click', () => {
            clearInterval(state.paymentTimerInterval);
            clearInterval(state.activePoll);
            uiManager.resetToInitScreen();
        });
    }
    
    if (elements.returnToMerchantBtn) {
        elements.returnToMerchantBtn.addEventListener('click', () => {
            uiManager.resetToInitScreen();
        });
    }
    
    if (elements.tryAgainBtn) {
        elements.tryAgainBtn.addEventListener('click', () => {
            uiManager.resetToInitScreen();
        });
    }
    
    // Payout flow events
    if (payoutElements.createPayoutBtn) {
        payoutElements.createPayoutBtn.addEventListener('click', createPayout);
    }
    
    if (payoutElements.returnToPayoutBtn) {
        payoutElements.returnToPayoutBtn.addEventListener('click', () => {
            uiManager.resetToPayoutInitScreen();
        });
    }
    
    if (payoutElements.tryPayoutAgainBtn) {
        payoutElements.tryPayoutAgainBtn.addEventListener('click', () => {
            uiManager.resetToPayoutInitScreen();
        });
    }
}

// Initialize the application
function initApp() {
    // Initialize UI manager
    uiManager.initialize();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set default values if needed
    if (elements.paymentAmount) {
        elements.paymentAmount.value = "10.00";
    }
    
    if (payoutElements.payoutAmount) {
        payoutElements.payoutAmount.value = "10.00";
    }
    
    console.log('Crypto Payment Gateway initialized in', 
                config.apiBaseUrl === 'http://localhost:3000/api/v1' ? 'demo mode' : 'production mode');
}

// Run the initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);