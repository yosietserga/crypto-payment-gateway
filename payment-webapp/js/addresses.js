/**
 * Addresses JavaScript for Crypto Payment Gateway
 * Handles the listing, viewing, and management of cryptocurrency addresses
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the addresses page
    initAddressesPage();
});

/**
 * Initialize the addresses page
 */
function initAddressesPage() {
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Get elements
    const addressesTable = document.getElementById('addresses-table');
    const addressesTableBody = document.getElementById('addresses-table-body');
    const addressesLoader = document.getElementById('addresses-loader');
    const addressesEmpty = document.getElementById('addresses-empty');
    const addressesError = document.getElementById('addresses-error');
    const addressesFilter = document.getElementById('addresses-filter');
    const addressesSearch = document.getElementById('addresses-search');
    
    // Load addresses
    loadAddresses();
    
    // Set up event listeners
    if (addressesFilter) {
        addressesFilter.addEventListener('change', function() {
            loadAddresses();
        });
    }
    
    if (addressesSearch) {
        addressesSearch.addEventListener('input', debounce(function() {
            loadAddresses();
        }, 500));
    }
    
    // Set up delete address confirmation
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('delete-address-btn')) {
            const addressId = event.target.dataset.addressId;
            const addressLabel = event.target.dataset.addressLabel;
            
            if (confirm(`Are you sure you want to delete the address "${addressLabel}"? This action cannot be undone.`)) {
                deleteAddress(addressId);
            }
        }
    });
    
    /**
     * Load addresses from the API
     */
    async function loadAddresses() {
        // Show loader
        if (addressesLoader) addressesLoader.classList.remove('d-none');
        if (addressesTable) addressesTable.classList.add('d-none');
        if (addressesEmpty) addressesEmpty.classList.add('d-none');
        if (addressesError) addressesError.classList.add('d-none');
        
        try {
            // Get filter and search values
            const filter = addressesFilter ? addressesFilter.value : 'all';
            const search = addressesSearch ? addressesSearch.value : '';
            
            // Call API to get addresses
            const addresses = await api.getAddresses(filter, search);
            
            // Update the table
            if (addressesTableBody) {
                // Clear existing rows
                addressesTableBody.innerHTML = '';
                
                // Ensure addresses is an array
                const addressList = Array.isArray(addresses) ? addresses : [];
                
                if (addressList.length === 0) {
                    // Show empty state
                    if (addressesEmpty) addressesEmpty.classList.remove('d-none');
                    if (addressesTable) addressesTable.classList.add('d-none');
                } else {
                    // Add rows for each address
                    addressList.forEach(address => {
                        const row = document.createElement('tr');
                        
                        // Format expiry date if it exists
                        const expiryDate = address.expiryDate ? formatDate(address.expiryDate) : 'Never';
                        
                        // Format the address for display
                        const displayAddress = address.address ? 
                            `${address.address.substring(0, 10)}...${address.address.substring(address.address.length - 10)}` : 
                            'Unknown';
                            
                        row.innerHTML = `
                            <td>
                                <div class="d-flex align-items-center">
                                    <div>
                                        <div class="fw-semibold">${address.label || 'Unnamed Address'}</div>
                                        <div class="small text-muted">${displayAddress}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="badge bg-${getCryptoBadgeColor(address.currency || address.cryptocurrency)}">${address.currency || address.cryptocurrency || 'USDT'}</span>
                            </td>
                            <td>
                                <span class="text-muted">${address.network || 'BEP20'}</span>
                            </td>
                            <td>
                                <div class="text-muted small">${formatDate(address.createdAt)}</div>
                            </td>
                            <td>
                                <div class="text-muted small">${expiryDate}</div>
                            </td>
                            <td>
                                <span class="badge bg-${getStatusBadgeColor(address.status)}">${formatStatus(address.status)}</span>
                            </td>
                            <td>
                                <div class="d-flex gap-2 justify-content-end">
                                    <button class="btn btn-sm btn-outline-primary view-address-btn" data-address-id="${address.id}" data-bs-toggle="modal" data-bs-target="#addressDetailsModal">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger delete-address-btn" data-address-id="${address.id}" data-address-label="${address.label || displayAddress}">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        `;
                        addressesTableBody.appendChild(row);
                    });
                    
                    // Show the table
                    if (addressesTable) addressesTable.classList.remove('d-none');
                    
                    // Set up view address buttons
                    document.querySelectorAll('.view-address-btn').forEach(button => {
                        button.addEventListener('click', function() {
                            const addressId = this.dataset.addressId;
                            viewAddress(addressId);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error loading addresses:', error);
            
            // Show error state
            if (addressesError) {
                addressesError.classList.remove('d-none');
                addressesError.querySelector('.error-message').textContent = error.message || 'Failed to load addresses';
            }
        } finally {
            // Hide loader
            if (addressesLoader) addressesLoader.classList.add('d-none');
        }
    }
    
    /**
     * View address details
     * @param {string} addressId - The address ID
     */
    async function viewAddress(addressId) {
        try {
            // Call API to get address details
            const address = await api.getAddressById(addressId);
            
            // Update modal with address details
            const modal = document.getElementById('viewAddressModal');
            if (modal) {
                modal.querySelector('.modal-title').textContent = address.label;
                modal.querySelector('#view-address-cryptocurrency').textContent = address.cryptocurrency;
                modal.querySelector('#view-address-address').value = address.address;
                modal.querySelector('#view-address-created').textContent = formatDate(address.createdAt);
                modal.querySelector('#view-address-status').innerHTML = `<span class="badge bg-${getStatusBadgeColor(address.status)}">${address.status}</span>`;
                modal.querySelector('#view-address-description').textContent = address.description || 'No description';
                
                // Generate QR code
                const qrContainer = modal.querySelector('#view-address-qr-code');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    new QRCode(qrContainer, {
                        text: address.address,
                        width: 160,
                        height: 160,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
                
                // Set up copy button
                const copyBtn = modal.querySelector('#copy-view-address');
                if (copyBtn) {
                    copyBtn.addEventListener('click', function() {
                        const addressInput = modal.querySelector('#view-address-address');
                        addressInput.select();
                        document.execCommand('copy');
                        
                        // Show success notification
                        showNotification('success', 'Address copied to clipboard');
                        
                        // Change button icon temporarily
                        const originalIcon = copyBtn.innerHTML;
                        copyBtn.innerHTML = '<i class="bi bi-check"></i>';
                        setTimeout(() => {
                            copyBtn.innerHTML = originalIcon;
                        }, 2000);
                    });
                }
            }
        } catch (error) {
            console.error('Error viewing address:', error);
            showNotification('error', `Failed to load address details: ${error.message}`);
        }
    }
    
    /**
     * Delete an address
     * @param {string} addressId - The address ID
     */
    async function deleteAddress(addressId) {
        try {
            // Call API to delete address
            await api.deleteAddress(addressId);
            
            // Show success notification
            showNotification('success', 'Address deleted successfully');
            
            // Reload addresses
            loadAddresses();
        } catch (error) {
            console.error('Error deleting address:', error);
            showNotification('error', `Failed to delete address: ${error.message}`);
        }
    }
    
    /**
     * Get badge color for cryptocurrency
     * @param {string} crypto - Cryptocurrency code
     * @returns {string} - Bootstrap color class
     */
    function getCryptoBadgeColor(crypto) {
        const colors = {
            'BTC': 'warning',
            'ETH': 'primary',
            'USDT': 'success',
            'SOL': 'info',
            'default': 'secondary'
        };
        return colors[crypto] || colors.default;
    }
    
    /**
     * Format status string for display
     * @param {string} status - Status value from API
     * @returns {string} - Formatted status for display
     */
    function formatStatus(status) {
        if (!status) return 'Unknown';
        
        // Convert to uppercase for consistency in switch statement
        const upperStatus = status.toUpperCase();
        
        // Format status for display
        switch (upperStatus) {
            case 'ACTIVE':
                return 'Active';
            case 'PENDING':
                return 'Pending';
            case 'EXPIRED':
                return 'Expired';
            case 'ARCHIVED':
                return 'Archived';
            case 'INACTIVE':
                return 'Inactive';
            case 'VALID':
                return 'Valid';
            case 'INVALID':
                return 'Invalid';
            case 'PROCESSING':
                return 'Processing';
            default:
                // Convert snake_case or camelCase to Title Case
                return status
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase());
        }
    }
    
    /**
     * Get status badge color based on status
     * @param {string} status - Address status
     * @returns {string} - Bootstrap color class
     */
    function getStatusBadgeColor(status) {
        const statusUpper = (status || '').toUpperCase();
        
        switch (statusUpper) {
            case 'ACTIVE':
            case 'VALID':
                return 'success';
            case 'PENDING':
            case 'PROCESSING':
                return 'warning';
            case 'EXPIRED':
            case 'INVALID':
                return 'danger';
            case 'ARCHIVED':
            case 'INACTIVE':
                return 'secondary';
            default:
                return 'info';
        }
    }
    
    /**
     * Format date
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Debounce function for search input
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
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