/**
 * Crypto Payment Gateway - Main Application
 * 
 * This file initializes the payment webapp and connects it to the API
 * Enhanced with multi-currency support, dark mode, and mobile features
 */

// Configuration
const CONFIG = {
    // API configuration
    apiBaseUrl: 'http://localhost:3000/api/v1',  // Replace with actual API URL in production
    
    // Default payment settings
    defaultCurrency: 'USDT',
    defaultNetwork: 'BEP20',
    defaultExpiryMinutes: 15,
    
    // UI configuration
    logoUrl: 'https://via.placeholder.com/80',  // Replace with actual logo
    supportEmail: 'support@example.com',
    supportUrl: '#',
    
    // Feature flags
    enableQrScanner: true,
    enableDarkMode: true,
    enableMultiCurrency: true,
    enableTransactionHistory: true,
    enableNotifications: true,
};

/**
 * Initialize the payment application
 */
async function initializePayment() {
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const amount = urlParams.get('amount');
    const currency = urlParams.get('currency') || CONFIG.defaultCurrency;
    const network = urlParams.get('network') || CONFIG.defaultNetwork;
    const apiKey = urlParams.get('key');
    const returnUrl = urlParams.get('return_url');
    
    // Check for dark mode preference in URL
    const darkMode = urlParams.get('dark_mode') === 'true';
    
    // Validate required parameters
    if (!reference || !amount || !apiKey) {
        showError('Missing required parameters. Please check the integration documentation.');
        return;
    }
    
    try {
        // Initialize API client
        const paymentApi = new PaymentAPI(CONFIG.apiBaseUrl, apiKey);
        
        // Initialize UI controller
        const paymentUI = new PaymentUI(paymentApi, returnUrl);
        
        // Store in window for debugging and global access
        window.paymentApi = paymentApi;
        window.paymentUI = paymentUI;
        
        // If we have an existing payment reference, try to load it
        if (reference) {
            try {
                // Check if payment already exists
                const existingPayment = await paymentApi.checkPaymentStatus(reference);
                
                // Initialize UI with existing payment data
                paymentUI.initialize(existingPayment);
                
                // Update UI based on payment status
                switch(existingPayment.status) {
                    case 'pending':
                        paymentUI.showScreen('payment-screen');
                        break;
                    case 'confirming':
                        paymentUI.showScreen('confirming-screen');
                        paymentUI.updateConfirmationStatus(existingPayment);
                        break;
                    case 'confirmed':
                        paymentUI.showScreen('success-screen');
                        paymentUI.updateSuccessStatus(existingPayment);
                        break;
                    case 'failed':
                        paymentUI.showScreen('error-screen');
                        document.getElementById('error-message').textContent = 
                            existingPayment.errorMessage || 'Payment failed';
                        break;
                }
            } catch (error) {
                // Payment doesn't exist yet, create a new one
                createNewPayment(paymentApi, paymentUI, reference, amount, currency, returnUrl);
            }
        } else {
            // Create a new payment
            createNewPayment(paymentApi, paymentUI, reference, amount, currency, returnUrl);
        }
    } catch (error) {
        console.error('Failed to initialize payment:', error);
        showError('Failed to initialize payment. Please try again later.');
    }
}

/**
 * Create a new payment
 */
async function createNewPayment(paymentApi, paymentUI, reference, amount, currency, callbackUrl) {
    try {
        // Prepare payment data
        const paymentData = {
            reference: reference,
            amount: amount,
            currency: currency,
            network: network || CONFIG.defaultNetwork,
            callbackUrl: callbackUrl
        };
        
        // Generate payment address
        const addressData = await paymentApi.generatePaymentAddress(paymentData);
        
        // Initialize UI with payment data
        paymentUI.initialize(addressData);
        paymentUI.showScreen('payment-screen');
    } catch (error) {
        console.error('Failed to create payment:', error);
        showError('Failed to create payment. Please try again later.');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorScreen = document.getElementById('error-screen');
    const errorMessage = document.getElementById('error-message');
    
    if (errorScreen && errorMessage) {
        errorMessage.textContent = message;
        
        // Hide all screens and show error
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        errorScreen.classList.add('active');
    } else {
        // Fallback if error screen elements don't exist
        alert(`Error: ${message}`);
    }
}

/**
 * Setup settings panel toggle
 */
function setupSettingsPanel() {
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsContent = document.getElementById('settings-content');
    
    if (settingsToggle && settingsContent) {
        settingsToggle.addEventListener('click', () => {
            settingsContent.classList.toggle('active');
        });
        
        // Close settings when clicking outside
        document.addEventListener('click', (event) => {
            if (!settingsContent.contains(event.target) && event.target !== settingsToggle) {
                settingsContent.classList.remove('active');
            }
        });
    }
    
    // Setup transaction history toggle
    const historyBtn = document.querySelector('.view-history-btn');
    const historyContainer = document.getElementById('transaction-history');
    
    if (historyBtn && historyContainer) {
        historyBtn.addEventListener('click', () => {
            if (historyContainer.style.display === 'none') {
                historyContainer.style.display = 'block';
                historyBtn.textContent = 'Hide Transaction History';
                // If we have paymentUI initialized, show transaction history
                if (window.paymentUI) {
                    window.paymentUI.showTransactionHistory();
                }
            } else {
                historyContainer.style.display = 'none';
                historyBtn.textContent = 'View Transaction History';
            }
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Setup settings panel and UI enhancements
    setupSettingsPanel();
    
    // Initialize exchange rates display if we have the container
    const ratesContainer = document.querySelector('#exchange-rates');
    if (ratesContainer && window.paymentApi) {
        window.paymentApi.getCachedExchangeRates().then(rates => {
            window.paymentUI.updateExchangeRateDisplay();
        }).catch(error => {
            console.warn('Could not load initial exchange rates:', error);
        });
    }
    
    // Set logo
    document.querySelectorAll('.payment-logo').forEach(logo => {
        logo.src = CONFIG.logoUrl;
    });
    
    // Set support links
    document.querySelectorAll('a[href="#"]').forEach(link => {
        if (link.textContent.includes('Support')) {
            link.href = CONFIG.supportUrl;
            link.textContent = 'Contact Support';
        }
    });
    
    // Setup feature toggles based on configuration
    if (!CONFIG.enableQrScanner) {
        const scanQrBtn = document.getElementById('scan-qr-btn');
        if (scanQrBtn) scanQrBtn.style.display = 'none';
    }
    
    if (!CONFIG.enableTransactionHistory) {
        const historyBtn = document.querySelector('.view-history-btn');
        if (historyBtn) historyBtn.style.display = 'none';
    }
    
    // Setup network selector if multi-currency is enabled
    if (CONFIG.enableMultiCurrency) {
        const networkSelector = document.getElementById('network-selector');
        if (networkSelector && window.paymentApi) {
            // Update network options when currency changes
            const currencySelector = document.getElementById('currency-selector');
            if (currencySelector) {
                currencySelector.addEventListener('change', () => {
                    updateNetworkOptions(currencySelector.value);
                });
            }
            
            // Initial network options setup
            updateNetworkOptions(window.paymentApi.getPreferredCurrency());
        }
    }
    
    // Initialize payment
    initializePayment();
});

/**
 * Update network options based on selected currency
 */
function updateNetworkOptions(currency) {
    if (!window.paymentApi) return;
    
    const networkSelector = document.getElementById('network-selector');
    if (!networkSelector) return;
    
    // Clear existing options
    networkSelector.innerHTML = '';
    
    // Add options for supported networks
    const networks = window.paymentApi.getSupportedNetworks(currency);
    networks.forEach(network => {
        const option = document.createElement('option');
        option.value = network;
        option.textContent = network;
        if (network === window.paymentApi.getPreferredNetwork()) {
            option.selected = true;
        }
        networkSelector.appendChild(option);
    });
    
    // Add change event listener
    networkSelector.addEventListener('change', (e) => {
        window.paymentApi.setPreferredNetwork(e.target.value);
    });
}

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
    if (window.paymentUI) {
        window.paymentUI.cleanup();
    }
});