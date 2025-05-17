/**
 * Generate Address JavaScript for Crypto Payment Gateway
 * Handles the creation of new cryptocurrency addresses
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the address generation form
    initAddressForm();
});

/**
 * Initialize the address generation form
 */
function initAddressForm() {
    const addressForm = document.getElementById('generate-address-form');
    const addressResult = document.getElementById('address-result');
    const generatedAddressField = document.getElementById('generated-address');
    const copyAddressBtn = document.getElementById('copy-address');
    
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Handle form submission
    if (addressForm) {
        addressForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            // Show loading state
            const submitBtn = addressForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
            submitBtn.disabled = true;
            
            try {
                // Collect form data
                const addressData = {
                    cryptocurrency: document.getElementById('address-cryptocurrency').value,
                    label: document.getElementById('address-label').value,
                    description: document.getElementById('address-description').value || '',
                    notifyOnPayment: document.getElementById('notify-on-payment').checked,
                    autoConvert: document.getElementById('auto-convert').checked,
                    expiry: document.getElementById('address-expiry').value,
                    enableWebhook: document.getElementById('enable-webhook').checked,
                    confirmationThreshold: document.getElementById('confirmation-threshold').value
                };
                
                // Call API to generate address
                const response = await api.generateAddress(addressData);
                
                // Display the generated address
                if (response && response.address) {
                    // Set the address in the result field
                    generatedAddressField.value = response.address;
                    
                    // Generate QR code
                    generateQRCode(response.address, addressData.cryptocurrency);
                    
                    // Show the result section
                    addressResult.classList.remove('d-none');
                    
                    // Scroll to the result section
                    addressResult.scrollIntoView({ behavior: 'smooth' });
                }
            } catch (error) {
                // Show error notification
                showNotification('error', `Failed to generate address: ${error.message}`);
            } finally {
                // Restore button state
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // Handle copy address button
    if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', function() {
            // Copy the address to clipboard
            generatedAddressField.select();
            document.execCommand('copy');
            
            // Show success notification
            showNotification('success', 'Address copied to clipboard');
            
            // Change button icon temporarily
            const originalIcon = copyAddressBtn.innerHTML;
            copyAddressBtn.innerHTML = '<i class="bi bi-check"></i>';
            setTimeout(() => {
                copyAddressBtn.innerHTML = originalIcon;
            }, 2000);
        });
    }
}

/**
 * Generate QR code for the address
 * @param {string} address - The cryptocurrency address
 * @param {string} currency - The cryptocurrency code
 */
function generateQRCode(address, currency) {
    const qrContainer = document.getElementById('address-qr-code');
    
    if (qrContainer) {
        // Clear previous QR code
        qrContainer.innerHTML = '';
        
        // Create QR code with the address
        const qrCode = new QRCode(qrContainer, {
            text: address,
            width: 160,
            height: 160,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    }
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
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add QRCode library if not already included
if (typeof QRCode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    document.head.appendChild(script);
}