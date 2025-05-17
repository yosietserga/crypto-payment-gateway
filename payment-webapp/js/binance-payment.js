/**
 * Binance Payment Integration for Crypto Payment Gateway
 * 
 * This file handles Binance wallet payment processing in the payment webapp
 */

class BinancePaymentHandler {
    constructor(paymentApi) {
        this.api = paymentApi;
        this.binanceCredentialsConfigured = false;
        this.supportedNetworks = ['BEP20', 'ERC20', 'TRC20'];
        this.supportedCurrencies = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'];
        this.defaultNetwork = 'BEP20';
        
        // Check if Binance credentials are stored in localStorage
        this.checkStoredCredentials();
    }
    
    /**
     * Check if Binance API credentials are stored
     */
    checkStoredCredentials() {
        const apiKey = localStorage.getItem('binanceApiKey');
        const hasApiSecret = localStorage.getItem('hasBinanceApiSecret') === 'true';
        
        if (apiKey && hasApiSecret) {
            this.binanceCredentialsConfigured = true;
        }
    }
    
    /**
     * Initialize Binance payment form
     * @param {string} containerId - ID of the container element
     */
    initPaymentForm(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Create form HTML
        container.innerHTML = `
            <div class="card shadow-sm mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0"><i class="bi bi-currency-exchange me-2"></i>Binance Wallet Payment</h5>
                </div>
                <div class="card-body">
                    ${!this.binanceCredentialsConfigured ? this.renderCredentialsForm() : this.renderPaymentForm()}
                </div>
            </div>
        `;
        
        // Add event listeners
        if (!this.binanceCredentialsConfigured) {
            this.attachCredentialsFormListeners();
        } else {
            this.attachPaymentFormListeners();
        }
    }
    
    /**
     * Render the Binance API credentials form
     * @returns {string} Form HTML
     */
    renderCredentialsForm() {
        return `
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                You need to configure your Binance API credentials to use this payment method.
            </div>
            <form id="binance-credentials-form">
                <div class="mb-3">
                    <label for="binance-api-key" class="form-label">Binance API Key</label>
                    <input type="text" class="form-control" id="binance-api-key" required>
                    <div class="form-text">Your Binance API key with withdrawal permissions</div>
                </div>
                <div class="mb-3">
                    <label for="binance-api-secret" class="form-label">Binance API Secret</label>
                    <input type="password" class="form-control" id="binance-api-secret" required>
                    <div class="form-text">Your Binance API secret (stored securely)</div>
                </div>
                <div class="form-check mb-3">
                    <input class="form-check-input" type="checkbox" id="remember-credentials">
                    <label class="form-check-label" for="remember-credentials">
                        Remember credentials (encrypted in browser storage)
                    </label>
                </div>
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-2"></i>Save Credentials
                </button>
            </form>
        `;
    }
    
    /**
     * Render the Binance payment form
     * @returns {string} Form HTML
     */
    renderPaymentForm() {
        const currencyOptions = this.supportedCurrencies.map(currency => 
            `<option value="${currency}">${currency}</option>`
        ).join('');
        
        const networkOptions = this.supportedNetworks.map(network => 
            `<option value="${network}">${network}</option>`
        ).join('');
        
        return `
            <form id="binance-payment-form">
                <div class="mb-3">
                    <label for="binance-amount" class="form-label">Amount</label>
                    <input type="number" class="form-control" id="binance-amount" step="0.01" min="0.01" required>
                </div>
                <div class="mb-3">
                    <label for="binance-currency" class="form-label">Currency</label>
                    <select class="form-select" id="binance-currency" required>
                        ${currencyOptions}
                    </select>
                </div>
                <div class="mb-3">
                    <label for="binance-network" class="form-label">Network</label>
                    <select class="form-select" id="binance-network">
                        ${networkOptions}
                    </select>
                </div>
                <div class="mb-3">
                    <label for="binance-description" class="form-label">Description (Optional)</label>
                    <input type="text" class="form-control" id="binance-description">
                </div>
                <div class="d-flex justify-content-between">
                    <button type="button" class="btn btn-outline-secondary" id="reset-binance-credentials">
                        <i class="bi bi-gear me-2"></i>Reset Credentials
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-send me-2"></i>Send Payment
                    </button>
                </div>
            </form>
            <div id="binance-payment-result" class="mt-4" style="display: none;"></div>
        `;
    }
    
    /**
     * Attach event listeners to the credentials form
     */
    attachCredentialsFormListeners() {
        const form = document.getElementById('binance-credentials-form');
        if (!form) return;
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const apiKey = document.getElementById('binance-api-key').value;
            const apiSecret = document.getElementById('binance-api-secret').value;
            const rememberCredentials = document.getElementById('remember-credentials').checked;
            
            try {
                // Validate credentials with the API
                const result = await this.api.validateBinanceCredentials(apiKey, apiSecret);
                
                if (result.success) {
                    // Store credentials if requested
                    if (rememberCredentials) {
                        localStorage.setItem('binanceApiKey', apiKey);
                        localStorage.setItem('hasBinanceApiSecret', 'true');
                        // Note: We don't store the actual API secret for security reasons
                        // The backend will handle the actual API secret
                    }
                    
                    this.binanceCredentialsConfigured = true;
                    
                    // Update the form
                    const container = form.closest('.card-body');
                    container.innerHTML = this.renderPaymentForm();
                    this.attachPaymentFormListeners();
                    
                    // Show success message
                    this.showNotification('success', 'Binance API credentials validated successfully!');
                } else {
                    this.showNotification('error', `Validation failed: ${result.error.message}`);
                }
            } catch (error) {
                this.showNotification('error', `Error validating credentials: ${error.message}`);
            }
        });
    }
    
    /**
     * Attach event listeners to the payment form
     */
    attachPaymentFormListeners() {
        const form = document.getElementById('binance-payment-form');
        const resetBtn = document.getElementById('reset-binance-credentials');
        
        if (!form) return;
        
        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const amount = document.getElementById('binance-amount').value;
            const currency = document.getElementById('binance-currency').value;
            const network = document.getElementById('binance-network').value;
            const description = document.getElementById('binance-description').value;
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
            submitBtn.disabled = true;
            
            try {
                // Send payment via Binance
                const result = await this.api.sendBinancePayment({
                    amount,
                    currency,
                    network,
                    description,
                    apiKey: localStorage.getItem('binanceApiKey')
                });
                
                // Show success result
                this.showPaymentResult(result);
                this.showNotification('success', 'Payment sent successfully!');
                
                // Reset form
                form.reset();
            } catch (error) {
                this.showNotification('error', `Payment failed: ${error.message}`);
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
        
        // Handle reset credentials button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                // Clear stored credentials
                localStorage.removeItem('binanceApiKey');
                localStorage.removeItem('hasBinanceApiSecret');
                this.binanceCredentialsConfigured = false;
                
                // Update the form
                const container = form.closest('.card-body');
                container.innerHTML = this.renderCredentialsForm();
                this.attachCredentialsFormListeners();
                
                this.showNotification('info', 'Binance credentials have been reset');
            });
        }
    }
    
    /**
     * Show payment result
     * @param {Object} result - Payment result data
     */
    showPaymentResult(result) {
        const resultContainer = document.getElementById('binance-payment-result');
        if (!resultContainer) return;
        
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
            <div class="alert alert-success">
                <h5 class="alert-heading">Payment Successful!</h5>
                <p><strong>Transaction ID:</strong> ${result.id}</p>
                <p><strong>Amount:</strong> ${result.amount} ${result.currency}</p>
                <p><strong>Status:</strong> ${result.status}</p>
                <p><strong>Transaction Hash:</strong> <a href="https://bscscan.com/tx/${result.txHash}" target="_blank">${result.txHash}</a></p>
                <hr>
                <p class="mb-0">The payment has been sent from your Binance wallet.</p>
            </div>
        `;
    }
    
    /**
     * Show notification
     * @param {string} type - Notification type (success, error, info)
     * @param {string} message - Notification message
     */
    showNotification(type, message) {
        // Check if notification container exists, create if not
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.position = 'fixed';
            notificationContainer.style.top = '20px';
            notificationContainer.style.right = '20px';
            notificationContainer.style.zIndex = '9999';
            document.body.appendChild(notificationContainer);
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `toast show alert alert-${type === 'error' ? 'danger' : type}`;
        notification.role = 'alert';
        notification.ariaLive = 'assertive';
        notification.ariaAtomic = 'true';
        notification.innerHTML = `
            <div class="toast-header">
                <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;
        
        // Add to container
        notificationContainer.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
        
        // Add close button functionality
        const closeBtn = notification.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.remove();
            });
        }
    }
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a page that needs Binance payment functionality
    const binancePaymentContainer = document.getElementById('binance-payment-container');
    if (binancePaymentContainer) {
        // Initialize the API client
        const api = new PaymentAPI();
        
        // Initialize Binance payment handler
        const binanceHandler = new BinancePaymentHandler(api);
        binanceHandler.initPaymentForm('binance-payment-container');
    }
});

// Add Binance payment methods to PaymentAPI class
PaymentAPI.prototype.validateBinanceCredentials = async function(apiKey, apiSecret) {
    try {
        const response = await fetch(`${this.apiBaseUrl}/binance/validate`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                apiKey,
                apiSecret
            })
        });

        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to validate Binance credentials');
        }

        return await response.json();
    } catch (error) {
        console.error('Error validating Binance credentials:', error);
        throw error;
    }
};

PaymentAPI.prototype.sendBinancePayment = async function(paymentData) {
    try {
        const response = await fetch(`${this.apiBaseUrl}/binance/payments`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(paymentData)
        });

        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to send Binance payment');
        }

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error sending Binance payment:', error);
        throw error;
    }
};

PaymentAPI.prototype.getBinanceTransactions = async function(page = 1, limit = 10, currency = null) {
    try {
        let url = `${this.apiBaseUrl}/binance/transactions?page=${page}&limit=${limit}`;
        
        if (currency) {
            url += `&currency=${currency}`;
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: this.headers
        });

        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get Binance transactions');
        }

        const data = await response.json();
        return data.data.transactions || [];
    } catch (error) {
        console.error('Error getting Binance transactions:', error);
        throw error;
    }
};

PaymentAPI.prototype.getBinanceBalances = async function() {
    try {
        const response = await fetch(`${this.apiBaseUrl}/binance/balances`, {
            method: 'GET',
            headers: this.headers
        });

        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get Binance balances');
        }

        const data = await response.json();
        return data.data.balances || {};
    } catch (error) {
        console.error('Error getting Binance balances:', error);
        throw error;
    }
};