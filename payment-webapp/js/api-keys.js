/**
 * API Keys JavaScript for Crypto Payment Gateway
 * Handles the creation, viewing, updating, and deletion of API keys
 */

// Initialize global variables
let api;
let apiKeysTable;
let apiKeysTableBody;
let apiKeysLoader;
let apiKeysEmpty;
let apiKeysError;

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the API client
    api = new PaymentAPI();
    
    // Initialize the page
    initApiKeysPage();
});

/**
 * Initialize the API keys page
 */
function initApiKeysPage() {
    // Initialize DOM elements
    apiKeysTable = document.getElementById('api-keys-table');
    apiKeysTableBody = document.getElementById('api-keys-table-body');
    apiKeysLoader = document.getElementById('api-keys-loader');
    apiKeysEmpty = document.getElementById('api-keys-empty');
    apiKeysError = document.getElementById('api-keys-error');
    
    // Set up event listeners for create API key form
    const createApiKeyForm = document.getElementById('create-api-key-form');
    if (createApiKeyForm) {
        createApiKeyForm.addEventListener('submit', function(event) {
            event.preventDefault();
            createApiKey();
        });
    }
    
    // Set up event listener for the create button (outside form)
    const createApiKeyBtn = document.getElementById('create-api-key-btn');
    if (createApiKeyBtn) {
        createApiKeyBtn.addEventListener('click', createApiKey);
    }
    
    // Set up delete API key confirmation
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('delete-api-key-btn') || event.target.closest('.delete-api-key-btn')) {
            const button = event.target.classList.contains('delete-api-key-btn') ? 
                event.target : event.target.closest('.delete-api-key-btn');
                
            const apiKeyId = button.dataset.apiKeyId;
            const apiKeyName = button.dataset.apiKeyName || 'this API key';
            
            if (confirm(`Are you sure you want to revoke ${apiKeyName}? This action cannot be undone, and any applications using this key will no longer be able to access the API.`)) {
                deleteApiKey(apiKeyId, button);
            }
        }
    });
    
    // Set up event listener for permission checkboxes
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('permission-checkbox')) {
            handlePermissionCheckboxChange(event.target);
        }
    });
    
    // Load API keys
    loadApiKeys();
}

/**
 * Handle permission checkbox change event
 * @param {HTMLElement} checkbox - The checkbox that was changed
 */
function handlePermissionCheckboxChange(checkbox) {
    // If "All Permissions" is checked/unchecked, update all other checkboxes
    if (checkbox.id === 'permission-all') {
        const allChecked = checkbox.checked;
        document.querySelectorAll('.permission-checkbox:not(#permission-all)').forEach(cb => {
            cb.checked = allChecked;
            cb.disabled = allChecked;
        });
    }
    
    // If all individual permissions are checked, check "All Permissions"
    const allCheckbox = document.getElementById('permission-all');
    const individualCheckboxes = document.querySelectorAll('.permission-checkbox:not(#permission-all)');
    const allIndividualChecked = Array.from(individualCheckboxes).every(cb => cb.checked);
    
    if (allCheckbox && allIndividualChecked) {
        allCheckbox.checked = true;
        individualCheckboxes.forEach(cb => {
            cb.disabled = true;
        });
    } else if (allCheckbox && !allIndividualChecked) {
        allCheckbox.checked = false;
        individualCheckboxes.forEach(cb => {
            cb.disabled = false;
        });
    }
}

/**
 * Create a new API key
 */
async function createApiKey() {
    console.log('createApiKey function called');
    const form = document.getElementById('create-api-key-form');
    const nameInput = document.getElementById('api-key-name');
    console.log('nameInput element:', nameInput);
    const readOnlyCheckbox = document.getElementById('api-key-readonly');
    const ipRestrictionsInput = document.getElementById('api-key-ip-restrictions');
    const expirationSelect = document.getElementById('api-key-expiration');
    
    // Validate input
    if (!nameInput || nameInput.value.trim() === '') {
        showNotification('error', 'Please enter a description for the API key');
        return;
    }
    
    // Ensure we have a value for the description
    const description = nameInput.value.trim();
    
    // Get selected permissions
    const permissions = {
        payments: false,
        payouts: false,
        addresses: false
    };
    
    // Set permission values based on checkboxes
    const permCheckboxes = document.querySelectorAll('.permission-checkbox');
    permCheckboxes.forEach(checkbox => {
        if (checkbox.id !== 'permission-all') {
            // Extract the permission name from the checkbox value
            const permName = checkbox.value;
            if (permName && permName in permissions) {
                permissions[permName] = checkbox.checked;
            }
        }
    });
    
    // If "All Permissions" is checked, set all permissions to true
    const allPermissionsCheckbox = document.getElementById('permission-all');
    if (allPermissionsCheckbox && allPermissionsCheckbox.checked) {
        Object.keys(permissions).forEach(key => {
            permissions[key] = true;
        });
    }
    
    console.log('Permissions to send:', permissions);
    
    try {
        // Show loading on submit button
        const submitButton = document.getElementById('create-api-key-btn');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating...';
        }
        
        // Calculate expiration date if needed
        let expiresAt = null;
        if (expirationSelect && expirationSelect.value !== 'never') {
            const now = new Date();
            switch (expirationSelect.value) {
                case '30days':
                    now.setDate(now.getDate() + 30);
                    break;
                case '90days':
                    now.setDate(now.getDate() + 90);
                    break;
                case '1year':
                    now.setFullYear(now.getFullYear() + 1);
                    break;
            }
            expiresAt = now.toISOString();
        }
        
        // Prepare API key data
        const apiKeyData = {
            description: description, // Use the validated description
            readOnly: readOnlyCheckbox && readOnlyCheckbox.checked ? true : false,
            ipRestrictions: ipRestrictionsInput && ipRestrictionsInput.value ? ipRestrictionsInput.value.trim() : '',
            permissions: permissions,
            expiresAt: expiresAt
        };
        
        // Log the data we're sending - this helps debugging
        console.log('Creating API key with data:', JSON.stringify(apiKeyData));
        
        // Call API to create key
        console.log('Calling API to create API key...');
        const result = await api.createApiKey(apiKeyData);
        console.log('Raw API response:', result);
        
        // Debug the full result structure to help identify where the keys are located
        console.log('API Response Structure:', JSON.stringify(result, null, 2));
        try {
            if (result.data && result.data.key) {
                console.log('Found key at result.data.key:', result.data.key);
            }
            if (result.data && result.data.secret) {
                console.log('Found secret at result.data.secret: [SECRET PRESENT]');
            }
            if (result.data && result.data.data && result.data.data.key) {
                console.log('Found key at result.data.data.key:', result.data.data.key);
            }
            if (result.data && result.data.data && result.data.data.secret) {
                console.log('Found secret at result.data.data.secret: [SECRET PRESENT]');
            }
        } catch (e) {
            console.error('Error during response inspection:', e);
        }
        
        // Extract the API key data from the result
        let newApiKey;
        if (result.data && result.data.data) {
            // Handle nested data structure from API
            newApiKey = result.data.data;
        } else if (result.data) {
            // Handle direct data structure
            newApiKey = result.data;
        } else {
            // Fallback to the whole result
            newApiKey = result;
        }
        
        console.log('Processed API Key:', newApiKey);
        
        // Close current modal
        const createModal = bootstrap.Modal.getInstance(document.getElementById('createApiKeyModal'));
        if (createModal) {
            createModal.hide();
        }
        
        // Set the API key details in the result modal
        const apiKeyInput = document.getElementById('new-api-key');
        const publicKeyInput = document.getElementById('api-key-public-id');
        const apiKeyName = document.getElementById('api-key-detail-name');
        
        console.log('API response data:', JSON.stringify(newApiKey, null, 2));
        
        // The API response can be nested in different ways depending on how the server returns it
        // Let's search through all possible locations to find the keys
        let secretKey = null;
        let publicKey = null;
        
        // Check common locations for the keys based on the API structure
        // Direct properties on the response object
        if (newApiKey.secret) secretKey = newApiKey.secret;
        if (newApiKey.key) publicKey = newApiKey.key;
        
        // Inside data property
        if (newApiKey.data && newApiKey.data.secret) secretKey = newApiKey.data.secret;
        if (newApiKey.data && newApiKey.data.key) publicKey = newApiKey.data.key;
        
        // Inside data.data property (double nested)
        if (newApiKey.data && newApiKey.data.data && newApiKey.data.data.secret) secretKey = newApiKey.data.data.secret;
        if (newApiKey.data && newApiKey.data.data && newApiKey.data.data.key) publicKey = newApiKey.data.data.key;
        
        console.log('Extracted keys after deep search:', {
            secretKey: secretKey ? 'Present' : 'Not found',
            publicKey: publicKey || 'Not found'
        });
        
        // For backend reference, also log the IDs we found
        if (publicKey) console.log('Found public key (for DB reference):', publicKey);
        if (secretKey) console.log('Found secret key (only shown once)');
        
        // Also check for an ID field which might contain the public key
        if (!publicKey && newApiKey.id) {
            console.log('No public key found, but ID exists:', newApiKey.id);
            if (newApiKey.id.startsWith('pk_')) {
                publicKey = newApiKey.id;
                console.log('Using ID as public key:', publicKey);
            }
        }
        
        // Display the secret key (only shown once)
        if (apiKeyInput && secretKey) {
            apiKeyInput.value = secretKey;
            console.log('Set secret key in input field');
        } else if (apiKeyInput) {
            apiKeyInput.value = 'Secret key not available';
            console.log('No secret key available');
        }
        
        // Display the public key ID
        if (publicKeyInput && publicKey) {
            publicKeyInput.value = publicKey;
            console.log('Set public key in input field:', publicKey);
        } else if (publicKeyInput) {
            publicKeyInput.value = 'Public key not available';
            console.log('No public key available');
        }
        
        if (apiKeyName) {
            apiKeyName.textContent = newApiKey.description || 
                                    (newApiKey.data && newApiKey.data.description) || 
                                    description; // Fall back to the original description
            console.log('Setting API key name:', apiKeyName.textContent);
        }
        
        // Reset form
        if (form) form.reset();
        
        // Show the created modal
        const createdModal = new bootstrap.Modal(document.getElementById('apiKeyCreatedModal'));
        if (createdModal) {
            createdModal.show();
        }
        
        // Show success notification
        showNotification('success', 'API key created successfully');
        
        // Reload API keys table
        loadApiKeys();
    } catch (error) {
        console.error('Error creating API key:', error);
        showNotification('error', `Failed to create API key: ${error.message || 'Unknown error'}`);
    } finally {
        // Reset button state
        const submitButton = document.getElementById('create-api-key-btn');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Generate API Key';
        }
    }
}

/**
 * Delete an API key
 * @param {string} apiKeyId - The API key ID
 * @param {HTMLElement} button - The delete button element
 */
async function deleteApiKey(apiKeyId, button) {
    if (!apiKeyId) {
        showNotification('error', 'API key ID is required');
        return;
    }
    
    try {
        // Show loading indicator
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        }
        
        // Call API to delete API key
        await api.deleteApiKey(apiKeyId);
        
        // Show success notification
        showNotification('success', 'API key revoked successfully');
        
        // Reload API keys
        loadApiKeys();
    } catch (error) {
        console.error('Error revoking API key:', error);
        showNotification('error', `Failed to revoke API key: ${error.message || 'Unknown error'}`);
        
        // Reset button state in case of error
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-trash"></i>';
        }
    }
}
    
/**
 * Delete an API key
 * @param {string} apiKeyId - The API key ID
 * @param {HTMLElement} button - The delete button element
 */
async function deleteApiKey(apiKeyId, button) {
    if (!apiKeyId) {
        showNotification('error', 'API key ID is required');
        return;
    }
    
    try {
        // Show loading indicator
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        }
        
        // Call API to delete API key
        await api.deleteApiKey(apiKeyId);
        
        // Show success notification
        showNotification('success', 'API key revoked successfully');
        
        // Reload API keys
        loadApiKeys();
    } catch (error) {
        console.error('Error revoking API key:', error);
        showNotification('error', `Failed to revoke API key: ${error.message || 'Unknown error'}`);
        
        // Reset button state in case of error
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-trash"></i>';
        }
    }
}
    
/**
 * Load API keys from the API
 */
async function loadApiKeys() {
    // Show loader, hide other states
    if (apiKeysLoader) apiKeysLoader.classList.remove('d-none');
    if (apiKeysTable) apiKeysTable.classList.add('d-none');
    if (apiKeysEmpty) apiKeysEmpty.classList.add('d-none');
    if (apiKeysError) apiKeysError.classList.add('d-none');
    
    try {
        // Call API to get API keys
        const apiKeys = await api.getApiKeys();
        console.log('API Keys loaded:', apiKeys);
        
        // Hide loader
        if (apiKeysLoader) apiKeysLoader.classList.add('d-none');
        
        // Update the table
        if (apiKeysTableBody) {
            // Clear existing rows
            apiKeysTableBody.innerHTML = '';
            
            // Check if we have API keys to display
            if (!apiKeys || apiKeys.length === 0) {
                // Show empty state
                if (apiKeysEmpty) apiKeysEmpty.classList.remove('d-none');
            } else {
                // Show table and add rows for each API key
                if (apiKeysTable) apiKeysTable.classList.remove('d-none');
                
                apiKeys.forEach(apiKey => {
                    // Format the permissions display
                    let permissionsDisplay = '';
                    if (apiKey.permissions) {
                        const permissions = Object.entries(apiKey.permissions)
                            .filter(([_, enabled]) => enabled)
                            .map(([name]) => name);
                        
                        permissionsDisplay = permissions.length > 0 ? 
                            permissions.join(', ') : 'No permissions';
                    } else {
                        permissionsDisplay = apiKey.readOnly ? 'Read-only' : 'Full access';
                    }
                    
                    const lastUsed = apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : 'Never';
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="api-key-icon me-2">
                                    <i class="bi bi-key"></i>
                                </div>
                                <div>
                                    <div class="fw-semibold">${apiKey.description || 'API Key'}</div>
                                    <div class="small text-muted">Created ${formatDate(apiKey.createdAt)}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="text-monospace">${apiKey.keyPrefix || apiKey.key.substring(0, 8) + '...'}</div>
                        </td>
                        <td>
                            <div class="permissions-tags">
                                ${permissionsDisplay}
                            </div>
                        </td>
                        <td>${formatDate(apiKey.createdAt)}</td>
                        <td>${lastUsed}</td>
                        <td>
                            <span class="badge bg-${getStatusBadgeColor(apiKey.status)}">${formatStatus(apiKey.status)}</span>
                        </td>
                        <td>
                            <div class="d-flex gap-2 justify-content-end">
                                <button class="btn btn-sm btn-outline-danger delete-api-key-btn" data-api-key-id="${apiKey.id}" data-api-key-name="${apiKey.description || 'API Key'}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                        `;
                        apiKeysTableBody.appendChild(row);
                    });
                    
                    // Show the table
                    if (apiKeysTable) apiKeysTable.classList.remove('d-none');
                    
                    // Set up view API key buttons
                    document.querySelectorAll('.view-api-key-btn').forEach(button => {
                        button.addEventListener('click', function() {
                            const apiKeyId = this.dataset.apiKeyId;
                            viewApiKey(apiKeyId);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
            
            // Show error state
            if (apiKeysError) {
                apiKeysError.classList.remove('d-none');
                const errorMessage = apiKeysError.querySelector('.error-message');
                if (errorMessage) {
                    errorMessage.textContent = error.message || 'Failed to load API keys. Please try again.';
                }
            }
            
            // Show notification for better user experience
            showNotification('error', 'Failed to load API keys: ' + (error.message || 'Unknown error'));
        } finally {
            // Hide loader
            if (apiKeysLoader) apiKeysLoader.classList.add('d-none');
        }
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
            case 'REVOKED':
                return 'Revoked';
            case 'EXPIRED':
                return 'Expired';
            default:
                // Convert snake_case or camelCase to Title Case
                return status
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase());
        }
    }
    
    /**
     * Get status badge color based on API key status
     * @param {string} status - API key status
     * @returns {string} - Bootstrap color class
     */
    function getStatusBadgeColor(status) {
        if (!status) return 'secondary';
        
        const statusLower = status.toLowerCase();
        
        switch (statusLower) {
            case 'active':
                return 'success';
            case 'pending':
                return 'warning';
            case 'inactive':
                return 'warning';
            case 'expired':
                return 'danger';
            case 'revoked':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} - Formatted date string
     */
    function formatDate(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        // Check if the date is today
        const today = new Date();
        const isToday = date.getDate() === today.getDate() &&
                       date.getMonth() === today.getMonth() &&
                       date.getFullYear() === today.getFullYear();
                       
        if (isToday) {
            return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Check if the date is yesterday
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.getDate() === yesterday.getDate() &&
                         date.getMonth() === yesterday.getMonth() &&
                         date.getFullYear() === yesterday.getFullYear();
                         
        if (isYesterday) {
            return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // For other dates, show the full date
        return date.toLocaleDateString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    /**
     * Show the newly created API key
     * @param {string} key - API key
     * @param {string} secret - API secret
     */
    function showNewApiKey(key, secret) {
        // Create modal element
        const modalElement = document.createElement('div');
        modalElement.className = 'modal fade';
        modalElement.id = 'newApiKeyModal';
        modalElement.tabIndex = '-1';
        modalElement.setAttribute('aria-labelledby', 'newApiKeyModalLabel');
        modalElement.setAttribute('aria-hidden', 'true');
        
        // Set modal content
        modalElement.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="newApiKeyModalLabel">API Key Created</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <i class="bi bi-exclamation-triangle-fill me-2"></i>
                            <strong>Important:</strong> Save this information securely. The API secret will not be shown again.
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">API Key</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="new-api-key" value="${key}" readonly>
                                <button class="btn btn-outline-secondary" type="button" id="copy-new-api-key">
                                    <i class="bi bi-clipboard"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">API Secret</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="new-api-secret" value="${secret}" readonly>
                                <button class="btn btn-outline-secondary" type="button" id="copy-new-api-secret">
                                    <i class="bi bi-clipboard"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">I've Saved These Securely</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(modalElement);
        
        // Initialize modal
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // Set up copy buttons
        document.getElementById('copy-new-api-key').addEventListener('click', function() {
            const input = document.getElementById('new-api-key');
            input.select();
            document.execCommand('copy');
            showNotification('success', 'API key copied to clipboard');
        });
        
        document.getElementById('copy-new-api-secret').addEventListener('click', function() {
            const input = document.getElementById('new-api-secret');
            input.select();
            document.execCommand('copy');
            showNotification('success', 'API secret copied to clipboard');
        });
        
        // Clean up after modal is closed
        modalElement.addEventListener('hidden.bs.modal', function() {
            modalElement.remove();
        });
    }
    
    /**
     * View API key details
     * @param {string} apiKeyId - The API key ID
     */
    async function viewApiKey(apiKeyId) {
        try {
            // Call API to get API key details
            const apiKey = await api.getApiKeyById(apiKeyId);
            
            // Update modal with API key details
            const modal = document.getElementById('apiKeyDetailsModal');
            if (modal) {
                modal.querySelector('.modal-title').textContent = apiKey.name;
                
                // Set key metadata
                modal.querySelector('#view-api-key-prefix').textContent = apiKey.prefix + '•••••••••••••••';
                modal.querySelector('#view-api-key-status').innerHTML = 
                    `<span class="badge bg-${apiKey.active ? 'success' : 'secondary'}">${apiKey.active ? 'Active' : 'Inactive'}</span>`;
                modal.querySelector('#view-api-key-created').textContent = formatDate(apiKey.createdAt);
                modal.querySelector('#view-api-key-description').textContent = apiKey.description || 'No description';
                
                // Set expiration
                const expiresElement = modal.querySelector('#view-api-key-expires');
                if (expiresElement) {
                    if (apiKey.expiresAt) {
                        const expiryDate = new Date(apiKey.expiresAt);
                        const now = new Date();
                        
                        if (expiryDate > now) {
                            expiresElement.innerHTML = `
                                <span class="text-warning">
                                    <i class="bi bi-clock"></i> Expires ${formatDate(apiKey.expiresAt)}
                                </span>
                            `;
                        } else {
                            expiresElement.innerHTML = `
                                <span class="text-danger">
                                    <i class="bi bi-x-circle"></i> Expired ${formatDate(apiKey.expiresAt)}
                                </span>
                            `;
                        }
                    } else {
                        expiresElement.innerHTML = `
                            <span class="text-success">
                                <i class="bi bi-infinity"></i> Never expires
                            </span>
                        `;
                    }
                }
                
                // Set last used
                const lastUsedElement = modal.querySelector('#view-api-key-last-used');
                if (lastUsedElement) {
                    if (apiKey.lastUsed) {
                        lastUsedElement.textContent = formatDate(apiKey.lastUsed);
                    } else {
                        lastUsedElement.textContent = 'Never used';
                    }
                }
                
                // Display permissions
                const permissionsContainer = modal.querySelector('#view-api-key-permissions');
                if (permissionsContainer) {
                    permissionsContainer.innerHTML = '';
                    apiKey.permissions.forEach(permission => {
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-secondary me-1';
                        badge.textContent = permission;
                        permissionsContainer.appendChild(badge);
                    });
                }
                
                // Set up toggle status button
                const toggleBtn = modal.querySelector('#toggle-api-key-btn');
                if (toggleBtn) {
                    toggleBtn.dataset.apiKeyId = apiKeyId;
                    toggleBtn.dataset.currentStatus = apiKey.active ? 'active' : 'inactive';
                    toggleBtn.innerHTML = apiKey.active ? 
                        '<i class="bi bi-pause-fill me-1"></i> Deactivate Key' : 
                        '<i class="bi bi-play-fill me-1"></i> Activate Key';
                    toggleBtn.className = apiKey.active ? 
                        'btn btn-warning' : 
                        'btn btn-success';
                    
                    toggleBtn.addEventListener('click', function() {
                        const currentStatus = this.dataset.currentStatus;
                        toggleApiKeyStatus(apiKeyId, currentStatus === 'active' ? false : true);
                    });
                }
                
                // Set up delete button
                const deleteBtn = modal.querySelector('#delete-api-key-btn');
                if (deleteBtn) {
                    deleteBtn.dataset.apiKeyId = apiKeyId;
                    deleteBtn.dataset.apiKeyName = apiKey.name;
                }
            }
        } catch (error) {
            console.error('Error viewing API key:', error);
            showNotification('error', `Failed to load API key details: ${error.message}`);
        }
    }
    
    /**
     * Toggle API key status (active/inactive)
     * @param {string} apiKeyId - The API key ID
     * @param {boolean} active - Whether to set the key as active
     */
    async function toggleApiKeyStatus(apiKeyId, active) {
        try {
            // Call API to update API key status
            await api.updateApiKey(apiKeyId, { active });
            
            // Show success notification
            showNotification('success', `API key ${active ? 'activated' : 'deactivated'} successfully`);
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('apiKeyDetailsModal'));
            if (modal) {
                modal.hide();
            }
            
            // Reload API keys
            loadApiKeys();
        } catch (error) {
            console.error('Error updating API key:', error);
            showNotification('error', `Failed to update API key: ${error.message}`);
        }
    }
    
    /**
     * Format a date string or timestamp
     * @param {string|number} date - Date string or timestamp
     * @returns {string} - Formatted date
     */
    function formatDate(date) {
        const options = { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        if (!date) return 'Never';
        
        try {
            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) return 'Invalid date';
            
            return dateObj.toLocaleDateString(undefined, options);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    }

/**
 * Format a date string or timestamp
 * @param {string|number} date - Date string or timestamp
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString('en-US', options);
}

/**
 * Show a notification
 * @param {string} type - Notification type (success, error, info)
 * @param {string} message - Notification message
 */
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} show`;
    
    // Set icon based on type
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    
    // Set notification content
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="bi bi-${icon}"></i>
        </div>
        <div class="notification-content">
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" aria-label="Close">
            <i class="bi bi-x"></i>
        </button>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Add event listener for close button
    notification.querySelector('.notification-close').addEventListener('click', function() {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}
