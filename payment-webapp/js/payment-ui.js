/**
 * Crypto Payment Gateway - Payment UI Controller
 * 
 * This file handles the UI interactions and display logic for the payment webapp
 * Enhanced with multi-currency support, dark mode, transaction history, and mobile features
 */

class PaymentUI {
    constructor(paymentApi, returnUrl) {
        this.paymentApi = paymentApi;
        this.returnUrl = returnUrl;
        this.paymentData = null;
        this.countdownInterval = null;
        this.statusCheckInterval = null;
        this.exchangeRatesInterval = null;
        
        // Initialize UI state
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.notificationsEnabled = localStorage.getItem('notificationsEnabled') !== 'false'; // Default to true unless explicitly set to false
        
        // Apply dark mode if enabled
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            if (darkModeToggle) darkModeToggle.checked = true;
        }
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    /**
     * Initialize the UI with payment data
     * @param {Object} paymentData - Payment data from API
     */
    initialize(paymentData) {
        this.paymentData = paymentData;
        
        // Set payment details
        document.getElementById('payment-amount').textContent = `${paymentData.amount} ${paymentData.currency}`;
        document.getElementById('payment-address').textContent = paymentData.address;
        
        // Generate QR code
        const qrCodeUrl = this.paymentApi.generateQRCode(
            paymentData.address,
            paymentData.amount,
            paymentData.currency,
            paymentData.network
        );
        document.getElementById('qr-code-img').src = qrCodeUrl;
        
        // Set currency and network in selectors if they exist
        const currencySelector = document.getElementById('currency-selector');
        if (currencySelector) {
            // Populate currency options
            this.populateCurrencyOptions(currencySelector, paymentData.currency);
        }
        
        // Start countdown timer if payment is pending
        if (paymentData.status === 'pending' && paymentData.expiresAt) {
            this.startCountdown(new Date(paymentData.expiresAt));
        }
        
        // Start status check interval
        this.startStatusCheck();
        
        // Update exchange rates
        this.updateExchangeRateDisplay();
        
        // Start exchange rates update interval
        this.startExchangeRatesInterval();
    }
    
    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Copy address button
        const copyBtn = document.getElementById('copy-address-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyAddressToClipboard());
        }
        
        // Dark mode toggle
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        }
        
        // Notifications toggle
        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', (e) => this.toggleNotifications(e.target.checked));
        }
        
        // QR scanner button
        const scanQrBtn = document.getElementById('scan-qr-btn');
        if (scanQrBtn) {
            scanQrBtn.addEventListener('click', () => this.openQRScanner());
        }
        
        // Currency selector
        const currencySelector = document.getElementById('currency-selector');
        if (currencySelector) {
            currencySelector.addEventListener('change', (e) => this.changeCurrency(e.target.value));
        }
        
        // Add to address book button
        const addToAddressBookBtn = document.getElementById('add-to-address-book');
        if (addToAddressBookBtn) {
            addToAddressBookBtn.addEventListener('click', () => this.addToAddressBook());
        }
        
        // Return button
        const returnBtn = document.getElementById('return-btn');
        if (returnBtn && this.returnUrl) {
            returnBtn.addEventListener('click', () => window.location.href = this.returnUrl);
        }
    }
    
    /**
     * Show a specific screen
     * @param {string} screenId - ID of the screen to show
     */
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show requested screen
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            
            // Update step indicators
            this.updateStepIndicators(screenId);
        }
    }
    
    /**
     * Update step indicators based on current screen
     * @param {string} currentScreenId - ID of the current active screen
     */
    updateStepIndicators(currentScreenId) {
        const steps = document.querySelectorAll('.step');
        if (!steps.length) return;
        
        // Reset all steps
        steps.forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        // Set active and completed steps based on current screen
        switch(currentScreenId) {
            case 'payment-screen':
                steps[0].classList.add('active');
                break;
            case 'confirming-screen':
                steps[0].classList.add('completed');
                steps[1].classList.add('active');
                break;
            case 'success-screen':
                steps[0].classList.add('completed');
                steps[1].classList.add('completed');
                steps[2].classList.add('completed');
                break;
            case 'error-screen':
                // No steps are active or completed on error
                break;
        }
    }
    
    /**
     * Start countdown timer
     * @param {Date} expiryDate - Payment expiry date
     */
    startCountdown(expiryDate) {
        const countdownElement = document.getElementById('countdown');
        if (!countdownElement) return;
        
        // Clear any existing interval
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        // Update countdown every second
        this.countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            const expiryTime = new Date(expiryDate).getTime();
            const timeLeft = expiryTime - now;
            
            if (timeLeft <= 0) {
                // Payment expired
                clearInterval(this.countdownInterval);
                countdownElement.textContent = '00:00';
                countdownElement.style.color = 'var(--danger-color)';
                
                // Show expired message
                const statusElement = document.getElementById('payment-status-message');
                if (statusElement) {
                    statusElement.textContent = 'Payment time expired';
                    statusElement.className = 'payment-status status-failed';
                }
                
                return;
            }
            
            // Calculate minutes and seconds
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            
            // Display countdown
            countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Change color when less than 2 minutes left
            if (timeLeft < 2 * 60 * 1000) {
                countdownElement.style.color = 'var(--danger-color)';
            }
        }, 1000);
    }
    
    /**
     * Start payment status check interval
     */
    startStatusCheck() {
        // Clear any existing interval
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        
        // Check status every 10 seconds
        this.statusCheckInterval = setInterval(async () => {
            try {
                if (!this.paymentData || !this.paymentData.reference) return;
                
                // Check payment status
                const statusData = await this.paymentApi.checkPaymentStatus(this.paymentData.reference);
                
                // Update UI based on status
                if (statusData.status !== this.paymentData.status) {
                    this.paymentData = statusData;
                    
                    switch(statusData.status) {
                        case 'pending':
                            this.showScreen('payment-screen');
                            break;
                        case 'confirming':
                            this.showScreen('confirming-screen');
                            this.updateConfirmationStatus(statusData);
                            break;
                        case 'confirmed':
                            this.showScreen('success-screen');
                            this.updateSuccessStatus(statusData);
                            // Add to transaction history
                            this.addToTransactionHistory(statusData);
                            // Show notification if enabled
                            if (this.notificationsEnabled) {
                                this.showNotification('Payment Confirmed', `Your payment of ${statusData.amount} ${statusData.currency} has been confirmed.`);
                            }
                            break;
                        case 'failed':
                            this.showScreen('error-screen');
                            document.getElementById('error-message').textContent = 
                                statusData.errorMessage || 'Payment failed';
                            break;
                    }
                } else if (statusData.status === 'confirming') {
                    // Update confirmation progress
                    this.updateConfirmationStatus(statusData);
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
            }
        }, 10000); // Check every 10 seconds
    }
    
    /**
     * Update confirmation status display
     * @param {Object} statusData - Payment status data
     */
    updateConfirmationStatus(statusData) {
        const confirmationsElement = document.getElementById('confirmations-count');
        const progressElement = document.getElementById('confirmation-progress');
        
        if (confirmationsElement && statusData.confirmations !== undefined) {
            confirmationsElement.textContent = `${statusData.confirmations}/${statusData.requiredConfirmations}`;
        }
        
        if (progressElement && statusData.confirmations !== undefined && statusData.requiredConfirmations) {
            const progressPercentage = Math.min(100, Math.round((statusData.confirmations / statusData.requiredConfirmations) * 100));
            progressElement.style.width = `${progressPercentage}%`;
            progressElement.setAttribute('aria-valuenow', progressPercentage);
        }
    }
    
    /**
     * Update success status display
     * @param {Object} statusData - Payment status data
     */
    updateSuccessStatus(statusData) {
        const amountElement = document.getElementById('success-amount');
        const txIdElement = document.getElementById('transaction-id');
        
        if (amountElement) {
            amountElement.textContent = `${statusData.amount} ${statusData.currency}`;
        }
        
        if (txIdElement && statusData.transactionId) {
            txIdElement.textContent = statusData.transactionId;
        }
    }
    
    /**
     * Copy payment address to clipboard
     */
    copyAddressToClipboard() {
        const addressElement = document.getElementById('payment-address');
        const copyBtn = document.getElementById('copy-address-btn');
        
        if (addressElement && copyBtn) {
            // Copy to clipboard
            navigator.clipboard.writeText(addressElement.textContent.trim())
                .then(() => {
                    // Show success feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('btn-success');
                    copyBtn.classList.remove('btn-primary');
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.classList.add('btn-primary');
                        copyBtn.classList.remove('btn-success');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy address:', err);
                });
        }
    }
    
    /**
     * Toggle dark mode
     * @param {boolean} enabled - Whether dark mode should be enabled
     */
    toggleDarkMode(enabled) {
        this.isDarkMode = enabled;
        localStorage.setItem('darkMode', enabled);
        
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    /**
     * Toggle notifications
     * @param {boolean} enabled - Whether notifications should be enabled
     */
    toggleNotifications(enabled) {
        this.notificationsEnabled = enabled;
        localStorage.setItem('notificationsEnabled', enabled);
        
        if (enabled && 'Notification' in window) {
            Notification.requestPermission().then(permission => {
                // Store the actual permission state
                this.notificationPermissionGranted = permission === 'granted';
                
                // If permission denied but notifications are enabled, inform the user
                if (permission !== 'granted' && enabled) {
                    console.warn('Notification permission not granted but notifications are enabled');
                }
            });
        }
    }
    
    /**
     * Show browser notification
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     */
    showNotification(title, message) {
        if (!this.notificationsEnabled || !('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            try {
                new Notification(title, { body: message });
            } catch (error) {
                console.error('Failed to show notification:', error);
            }
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    try {
                        new Notification(title, { body: message });
                    } catch (error) {
                        console.error('Failed to show notification after permission granted:', error);
                    }
                }
                // Update the stored permission state
                this.notificationPermissionGranted = permission === 'granted';
            });
        }
    }
    
    /**
     * Open QR code scanner
     */
    openQRScanner() {
        const scannerContainer = document.getElementById('qr-scanner-container');
        const scannerElement = document.getElementById('qr-scanner');
        
        if (!scannerContainer || !scannerElement) return;
        
        // Show scanner container
        scannerContainer.style.display = 'block';
        
        // Initialize scanner
        this.paymentApi.initQRScanner()
            .then(scanner => {
                // Start scanner
                this.paymentApi.startQRScanner(scanner, (result) => {
                    // Handle scanned result
                    console.log('QR code scanned:', result);
                    
                    // Update address field if we have an address
                    if (result.address) {
                        const addressInput = document.getElementById('recipient-address');
                        if (addressInput) addressInput.value = result.address;
                    }
                    
                    // Hide scanner container
                    scannerContainer.style.display = 'none';
                    
                    // Show success message
                    this.showNotification('QR Code Scanned', 'Address successfully scanned');
                });
                
                // Add close button event listener
                const closeBtn = document.getElementById('close-scanner-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        scanner.stop();
                        scannerContainer.style.display = 'none';
                    });
                }
            })
            .catch(error => {
                console.error('Failed to initialize QR scanner:', error);
                scannerContainer.style.display = 'none';
                alert('Failed to initialize QR scanner. Please check camera permissions.');
            });
    }
    
    /**
     * Populate currency options in selector
     * @param {HTMLElement} selector - Currency selector element
     * @param {string} selectedCurrency - Currently selected currency
     */
    populateCurrencyOptions(selector, selectedCurrency) {
        // Clear existing options
        selector.innerHTML = '';
        
        // Add options for supported currencies
        this.paymentApi.supportedCurrencies.forEach(currency => {
            const option = document.createElement('option');
            option.value = currency;
            option.textContent = currency;
            if (currency === selectedCurrency) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    }
    
    /**
     * Change payment currency
     * @param {string} currency - New currency code
     */
    changeCurrency(currency) {
        if (!currency || !this.paymentData) return;
        
        // Update preferred currency in API
        this.paymentApi.preferredCurrency = currency;
        localStorage.setItem('preferredCurrency', currency);
        
        // Update network options
        const networkSelector = document.getElementById('network-selector');
        if (networkSelector) {
            // Clear existing options
            networkSelector.innerHTML = '';
            
            // Add options for supported networks
            const networks = this.paymentApi.supportedNetworks[currency] || [];
            networks.forEach(network => {
                const option = document.createElement('option');
                option.value = network;
                option.textContent = network;
                if (network === this.paymentApi.preferredNetwork) {
                    option.selected = true;
                }
                networkSelector.appendChild(option);
            });
        }
        
        // Update exchange rate display
        this.updateExchangeRateDisplay();
    }
    
    /**
     * Update exchange rate display
     */
    updateExchangeRateDisplay() {
        const ratesContainer = document.getElementById('exchange-rates');
        if (!ratesContainer) return;
        
        this.paymentApi.getExchangeRates()
            .then(rates => {
                // Clear container
                ratesContainer.innerHTML = '';
                
                // Add heading
                const heading = document.createElement('h6');
                heading.textContent = 'Exchange Rates';
                ratesContainer.appendChild(heading);
                
                // Create rates list
                const ratesList = document.createElement('ul');
                ratesList.className = 'list-unstyled rates-list';
                
                // Add rates for major currencies
                const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
                majorCurrencies.forEach(currency => {
                    if (rates[currency]) {
                        const listItem = document.createElement('li');
                        listItem.innerHTML = `<span>${currency}:</span> <span>${rates[currency].toFixed(2)}</span>`;
                        ratesList.appendChild(listItem);
                    }
                });
                
                ratesContainer.appendChild(ratesList);
                
                // Add last updated timestamp
                const timestamp = document.createElement('small');
                timestamp.className = 'text-muted';
                timestamp.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
                ratesContainer.appendChild(timestamp);
            })
            .catch(error => {
                console.error('Failed to update exchange rates:', error);
                ratesContainer.innerHTML = '<p class="text-muted">Exchange rates unavailable</p>';
            });
    }
    
    /**
     * Start exchange rates update interval
     */
    startExchangeRatesInterval() {
        // Clear any existing interval
        if (this.exchangeRatesInterval) {
            clearInterval(this.exchangeRatesInterval);
        }
        
        // Update exchange rates every 5 minutes
        this.exchangeRatesInterval = setInterval(() => {
            this.updateExchangeRateDisplay();
        }, 5 * 60 * 1000); // Every 5 minutes
    }
    
    /**
     * Add current payment to address book
     */
    addToAddressBook() {
        if (!this.paymentData || !this.paymentData.address) return;
        
        // Get label from user
        const label = prompt('Enter a label for this address:', '');
        if (!label) return; // User cancelled
        
        // Create address entry
        const addressEntry = {
            label: label,
            address: this.paymentData.address,
            currency: this.paymentData.currency,
            network: this.paymentData.network,
            dateAdded: new Date().toISOString()
        };
        
        // Add to favorites in API
        this.paymentApi.addFavoriteAddress(addressEntry);
        
        // Show success message
        alert(`Address saved as "${label}"`);
    }
    
    /**
     * Show transaction history
     */
    showTransactionHistory() {
        const historyContainer = document.getElementById('transaction-history');
        if (!historyContainer) return;
        
        // Get transaction history from API
        const transactions = this.paymentApi.getTransactionHistory();
        
        // Clear container
        historyContainer.innerHTML = '';
        
        if (transactions.length === 0) {
            historyContainer.innerHTML = '<p class="text-center text-muted">No transaction history available</p>';
            return;
        }
        
        // Create table
        const table = document.createElement('table');
        table.className = 'table table-striped table-hover';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Status</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Add transactions
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            
            // Format date
            const date = new Date(tx.timestamp);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            // Set row content
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${tx.amount}</td>
                <td>${tx.currency}</td>
                <td><span class="badge ${this.getStatusBadgeClass(tx.status)}">${tx.status}</span></td>
            `;
            
            // Add click event to show details
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => this.showTransactionDetails(tx));
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        historyContainer.appendChild(table);
    }
    
    /**
     * Get CSS class for status badge
     * @param {string} status - Transaction status
     * @returns {string} - CSS class name
     */
    getStatusBadgeClass(status) {
        switch(status) {
            case 'confirmed':
                return 'bg-success';
            case 'confirming':
                return 'bg-primary';
            case 'pending':
                return 'bg-warning';
            case 'failed':
                return 'bg-danger';
            default:
                return 'bg-secondary';
        }
    }
    
    /**
     * Show transaction details
     * @param {Object} transaction - Transaction data
     */
    showTransactionDetails(transaction) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('transaction-details-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'transaction-details-modal';
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('aria-hidden', 'true');
            
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Transaction Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="transaction-details-content">
                            <!-- Content will be inserted here -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }
        
        // Update modal content
        const modalContent = document.getElementById('transaction-details-content');
        if (modalContent) {
            // Format date
            const date = new Date(transaction.timestamp);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            modalContent.innerHTML = `
                <div class="transaction-detail-item">
                    <strong>Reference:</strong> ${transaction.reference}
                </div>
                <div class="transaction-detail-item">
                    <strong>Date:</strong> ${formattedDate}
                </div>
                <div class="transaction-detail-item">
                    <strong>Amount:</strong> ${transaction.amount} ${transaction.currency}
                </div>
                <div class="transaction-detail-item">
                    <strong>Status:</strong> <span class="badge ${this.getStatusBadgeClass(transaction.status)}">${transaction.status}</span>
                </div>
                ${transaction.transactionId ? `
                <div class="transaction-detail-item">
                    <strong>Transaction ID:</strong> <span class="transaction-id">${transaction.transactionId}</span>
                </div>` : ''}
                ${transaction.address ? `
                <div class="transaction-detail-item">
                    <strong>Address:</strong> <span class="transaction-address">${transaction.address}</span>
                </div>` : ''}
                ${transaction.network ? `
                <div class="transaction-detail-item">
                    <strong>Network:</strong> ${transaction.network}
                </div>` : ''}
            `;
        }
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
    
    /**
     * Add transaction to history
     * @param {Object} transaction - Transaction data
     */
    addToTransactionHistory(transaction) {
        if (!transaction) return;
        
        // Add to API transaction history
        this.paymentApi.addTransactionToHistory({
            reference: transaction.reference,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            address: transaction.address,
            network: transaction.network,
            transactionId: transaction.transactionId,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Clean up resources when component is destroyed
     */
    cleanup() {
        // Clear all intervals
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
        if (this.exchangeRatesInterval) clearInterval(this.exchangeRatesInterval);
    }
}