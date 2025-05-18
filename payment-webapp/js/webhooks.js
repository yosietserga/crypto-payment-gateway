/**
 * Webhooks JavaScript for Crypto Payment Gateway
 * Handles the creation, viewing, updating, and deletion of webhooks
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the webhooks page
    initWebhooksPage();
});

/**
 * Initialize the webhooks page
 */
function initWebhooksPage() {
    // Initialize the API client
    const api = new PaymentAPI();
    
    // Get elements
    const webhooksTable = document.getElementById('webhooks-table');
    const webhooksTableBody = document.getElementById('webhooks-table-body');
    const webhooksLoader = document.getElementById('webhooks-loader');
    const webhooksEmpty = document.getElementById('webhooks-empty');
    const webhooksError = document.getElementById('webhooks-error');
    const createWebhookForm = document.getElementById('create-webhook-form');
    
    // Load webhooks
    loadWebhooks();
    
    // Set up event listeners for create webhook form
    if (createWebhookForm) {
        createWebhookForm.addEventListener('submit', function(event) {
            event.preventDefault();
            createWebhook();
        });
        
        // Generate random webhook secret when clicked
        const generateSecretBtn = document.getElementById('generate-webhook-secret');
        if (generateSecretBtn) {
            generateSecretBtn.addEventListener('click', function() {
                const secretInput = document.getElementById('webhook-secret');
                if (secretInput) {
                    secretInput.value = generateRandomString(32);
                }
            });
        }
        
        // Copy webhook URL when clicked
        const copyUrlBtn = document.getElementById('copy-webhook-url');
        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', function() {
                const urlInput = document.getElementById('webhook-url');
                if (urlInput) {
                    urlInput.select();
                    document.execCommand('copy');
                    showNotification('success', 'Webhook URL copied to clipboard');
                }
            });
        }
    }
    
    // Set up event listener for webhook event checkboxes
    
    // Event delegation for webhook actions (view, edit, delete, etc)
    document.addEventListener('click', function(event) {
        // Handle delete webhook button clicks
        if (event.target && (event.target.classList.contains('delete-webhook-btn') ||
            event.target.closest('.delete-webhook-btn'))) {
            
            const button = event.target.classList.contains('delete-webhook-btn') ? 
                event.target : event.target.closest('.delete-webhook-btn');
            
            const webhookId = button.dataset.webhookId;
            
            if (webhookId) {
                // Show confirmation dialog
                if (confirm('Are you sure you want to delete this webhook? This action cannot be undone.')) {
                    deleteWebhook(webhookId);
                }
            }
        }
    });
    document.addEventListener('change', function(event) {
        if (event.target.classList.contains('webhook-event-checkbox')) {
            // If "All Events" is checked/unchecked, update all other checkboxes
            if (event.target.id === 'webhook-event-all') {
                const allChecked = event.target.checked;
                document.querySelectorAll('.webhook-event-checkbox:not(#webhook-event-all)').forEach(checkbox => {
                    checkbox.checked = allChecked;
                    checkbox.disabled = allChecked;
                });
            }
            
            // If all individual events are checked, check "All Events"
            const allCheckbox = document.getElementById('webhook-event-all');
            const individualCheckboxes = document.querySelectorAll('.webhook-event-checkbox:not(#webhook-event-all)');
            const allIndividualChecked = Array.from(individualCheckboxes).every(checkbox => checkbox.checked);
            
            if (allCheckbox && allIndividualChecked) {
                allCheckbox.checked = true;
                individualCheckboxes.forEach(checkbox => {
                    checkbox.disabled = true;
                });
            }
        }
    });
    
    // Set up delete webhook confirmation
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('delete-webhook-btn') || event.target.closest('.delete-webhook-btn')) {
            const webhookId = event.target.closest('.delete-webhook-btn').dataset.webhookId;
            const webhookUrl = event.target.closest('.delete-webhook-btn').dataset.webhookUrl;
            
            if (confirm(`Are you sure you want to delete the webhook for "${webhookUrl}"? This action cannot be undone.`)) {
                deleteWebhook(webhookId);
            }
        }
    });
    
    /**
     * Load webhooks from the API
     */
    async function loadWebhooks() {
        // Show loader
        if (webhooksLoader) webhooksLoader.classList.remove('d-none');
        if (webhooksTable) webhooksTable.classList.add('d-none');
        if (webhooksEmpty) webhooksEmpty.classList.add('d-none');
        if (webhooksError) webhooksError.classList.add('d-none');
        
        try {
            // Call API to get webhooks
            const webhooks = await api.getWebhooks();
            
            // Show table
            if (webhooksTable) webhooksTable.classList.remove('d-none');
            
            // Update the table
            if (webhooksTableBody) {
                // Clear existing rows
                webhooksTableBody.innerHTML = '';
                
                // Ensure webhooks is an array
                const webhookList = Array.isArray(webhooks) ? webhooks : [];
                
                if (webhookList.length === 0) {
                    // Show empty state
                    if (webhooksEmpty) webhooksEmpty.classList.remove('d-none');
                    if (webhooksTable) webhooksTable.classList.add('d-none');
                } else {
                    // Add rows for each webhook
                    webhookList.forEach(webhook => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>
                                <div class="d-flex align-items-center">
                                    <div class="webhook-icon">
                                        <i class="bi bi-hdd-network"></i>
                                    </div>
                                    <div>
                                        <div class="small text-muted">URL</div>
                                        <div class="fw-semibold">${webhook.url}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="d-flex flex-wrap gap-1">
                                    ${webhook.events.map(event => `<span class="badge bg-secondary">${event}</span>`).join(' ')}
                                </div>
                            </td>
                            <td>
                                <span class="badge bg-${webhook.active ? 'success' : 'secondary'}">${webhook.active ? 'Active' : 'Inactive'}</span>
                            </td>
                            <td>
                                <div class="text-muted small">${formatDate(webhook.createdAt)}</div>
                            </td>
                            <td>
                                <div class="d-flex gap-2 justify-content-end">
                                    <button class="btn btn-sm btn-outline-primary view-webhook-btn" data-webhook-id="${webhook.id}" data-bs-toggle="modal" data-bs-target="#webhookDetailsModal">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger delete-webhook-btn" data-webhook-id="${webhook.id}" data-webhook-url="${webhook.url}">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        `;
                        webhooksTableBody.appendChild(row);
                    });
                    
                    // Show the table
                    if (webhooksTable) webhooksTable.classList.remove('d-none');
                    
                    // Set up view webhook buttons
                    document.querySelectorAll('.view-webhook-btn').forEach(button => {
                        button.addEventListener('click', function() {
                            const webhookId = this.dataset.webhookId;
                            viewWebhook(webhookId);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error loading webhooks:', error);
            
            // Show error message
            if (webhooksError) {
                webhooksError.classList.remove('d-none');
                const errorMessage = webhooksError.querySelector('.error-message');
                if (errorMessage) {
                    errorMessage.textContent = error.message || 'Failed to load webhooks. Please try again.';
                }
            }
            
            // Show notification for better user experience
            showNotification('error', 'Failed to load webhooks: ' + (error.message || 'Unknown error'));
        } finally {
            // Hide loader
            if (webhooksLoader) webhooksLoader.classList.add('d-none');
        }
    }
    
    /**
     * Create a new webhook
     */
    async function createWebhook() {
        // Get form data
        const url = document.getElementById('webhook-url').value;
        const secret = document.getElementById('webhook-secret').value;
        const description = document.getElementById('webhook-description').value;
        
        // Get selected events
        const allEventsCheckbox = document.getElementById('webhook-event-all');
        let events = [];
        
        if (allEventsCheckbox && allEventsCheckbox.checked) {
            // All events selected
            events = ['ALL'];
        } else {
            // Get individually selected events
            document.querySelectorAll('.webhook-event-checkbox:not(#webhook-event-all):checked').forEach(checkbox => {
                events.push(checkbox.value);
            });
        }
        
        // Validate form
        if (!url) {
            showNotification('error', 'Webhook URL is required');
            return;
        }
        
        if (events.length === 0) {
            showNotification('error', 'At least one event must be selected');
            return;
        }
        
        try {
            // Show loading state
            const submitButton = document.querySelector('#create-webhook-form button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Creating...';
            }
            
            // Call API to create webhook
            await api.createWebhook({
                url,
                secret,
                events,
                description
            });
            
            // Show success notification
            showNotification('success', 'Webhook created successfully');
            
            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('createWebhookModal'));
            if (modal) {
                modal.hide();
            }
            
            document.getElementById('create-webhook-form').reset();
            
            // Reload webhooks
            loadWebhooks();
        } catch (error) {
            console.error('Error creating webhook:', error);
            showNotification('error', `Failed to create webhook: ${error.message}`);
        } finally {
            // Reset button state
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = 'Create Webhook';
            }
        }
    }
    
    /**
     * View webhook details
     * @param {string} webhookId - The webhook ID
     */
    async function viewWebhook(webhookId) {
        try {
            // Call API to get webhook details
            const webhook = await api.getWebhookById(webhookId);
            
            // Update modal with webhook details
            const modal = document.getElementById('webhookDetailsModal');
            if (modal) {
                modal.querySelector('.modal-title').textContent = 'Webhook Details';
                modal.querySelector('#view-webhook-url').value = webhook.url;
                modal.querySelector('#view-webhook-status').innerHTML = 
                    `<span class="badge bg-${webhook.active ? 'success' : 'secondary'}">${webhook.active ? 'Active' : 'Inactive'}</span>`;
                modal.querySelector('#view-webhook-created').textContent = formatDate(webhook.createdAt);
                
                // Display events
                const eventsContainer = modal.querySelector('#view-webhook-events');
                if (eventsContainer) {
                    eventsContainer.innerHTML = '';
                    webhook.events.forEach(event => {
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-secondary me-1';
                        badge.textContent = event;
                        eventsContainer.appendChild(badge);
                    });
                }
                
                // Display recent deliveries if available
                const deliveriesContainer = modal.querySelector('#webhook-recent-deliveries');
                if (deliveriesContainer && webhook.recentDeliveries) {
                    deliveriesContainer.innerHTML = '';
                    
                    if (webhook.recentDeliveries.length === 0) {
                        deliveriesContainer.innerHTML = '<div class="text-muted">No recent deliveries found</div>';
                    } else {
                        webhook.recentDeliveries.forEach(delivery => {
                            const deliveryItem = document.createElement('div');
                            deliveryItem.className = 'webhook-delivery-item';
                            deliveryItem.innerHTML = `
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <span class="badge bg-${delivery.success ? 'success' : 'danger'} me-2">
                                            ${delivery.success ? 'Success' : 'Failed'}
                                        </span>
                                        <span class="fw-semibold">${delivery.event}</span>
                                    </div>
                                    <div class="text-muted small">${formatDate(delivery.timestamp)}</div>
                                </div>
                                <div class="small text-muted mt-1">Response: ${delivery.responseCode} ${delivery.responseStatus}</div>
                            `;
                            deliveriesContainer.appendChild(deliveryItem);
                        });
                    }
                }
                
                // Set up copy button
                const copyUrlBtn = modal.querySelector('#copy-view-webhook-url');
                if (copyUrlBtn) {
                    copyUrlBtn.addEventListener('click', function() {
                        const urlInput = modal.querySelector('#view-webhook-url');
                        urlInput.select();
                        document.execCommand('copy');
                        
                        // Show success notification
                        showNotification('success', 'Webhook URL copied to clipboard');
                        
                        // Change button icon temporarily
                        const originalIcon = copyUrlBtn.innerHTML;
                        copyUrlBtn.innerHTML = '<i class="bi bi-check"></i>';
                        setTimeout(() => {
                            copyUrlBtn.innerHTML = originalIcon;
                        }, 2000);
                    });
                }
                
                // Set up delete button
                const deleteBtn = modal.querySelector('#delete-webhook-btn');
                if (deleteBtn) {
                    deleteBtn.dataset.webhookId = webhookId;
                    deleteBtn.dataset.webhookUrl = webhook.url;
                }
                
                // Set up test button
                const testBtn = modal.querySelector('#test-webhook-btn');
                if (testBtn) {
                    testBtn.dataset.webhookId = webhookId;
                    testBtn.addEventListener('click', function() {
                        testWebhook(webhookId);
                    });
                }
            }
        } catch (error) {
            console.error('Error viewing webhook:', error);
            showNotification('error', `Failed to load webhook details: ${error.message}`);
            
            // Set up copy button
            const copyUrlBtn = modal.querySelector('#copy-view-webhook-url');
            if (copyUrlBtn) {
                copyUrlBtn.addEventListener('click', function() {
                    const urlInput = modal.querySelector('#view-webhook-url');
                    urlInput.select();
                    document.execCommand('copy');
                    
                    // Show success notification
                    showNotification('success', 'Webhook URL copied to clipboard');
                    
                    // Change button icon temporarily
                    const originalIcon = copyUrlBtn.innerHTML;
                    copyUrlBtn.innerHTML = '<i class="bi bi-check"></i>';
                    setTimeout(() => {
                        copyUrlBtn.innerHTML = originalIcon;
                    }, 2000);
                });
            }
            
            // Set up delete button
            const deleteBtn = modal.querySelector('#delete-webhook-btn');
            if (deleteBtn) {
                deleteBtn.dataset.webhookId = webhookId;
                deleteBtn.dataset.webhookUrl = webhook.url;
            }
        }
    }
    
    /**
     * Delete a webhook
     * @param {string} webhookId - The webhook ID
     */
    async function deleteWebhook(webhookId) {
        try {
            // Show loading indicator
            const deleteBtn = document.querySelector(`.delete-webhook-btn[data-webhook-id="${webhookId}"]`);
            if (deleteBtn) {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
            }
            
            // Call API to delete webhook
            await api.deleteWebhook(webhookId);
            
            // Show success notification
            showNotification('success', 'Webhook deleted successfully');
            
            // Close modal if open
            const modal = bootstrap.Modal.getInstance(document.getElementById('webhookDetailsModal'));
            if (modal) {
                modal.hide();
            }
            
            // Reload webhooks
            loadWebhooks();
        } catch (error) {
            console.error('Error deleting webhook:', error);
            showNotification('error', `Failed to delete webhook: ${error.message}`);
            
            // Reset button state in case of error
            const deleteBtn = document.querySelector(`.delete-webhook-btn[data-webhook-id="${webhookId}"]`);
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            }
        }
    }
    
    /**
     * Test a webhook
     * @param {string} webhookId - The webhook ID
     */
    async function testWebhook(webhookId) {
        try {
            // Update button state
            const testBtn = document.querySelector(`#test-webhook-btn[data-webhook-id="${webhookId}"]`);
            if (testBtn) {
                testBtn.disabled = true;
                testBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Testing...';
            }
            
            // Call API to test webhook
            const result = await api.testWebhook(webhookId);
            
            // Show notification based on result
            if (result.success) {
                showNotification('success', 'Test webhook delivered successfully!');
            } else {
                showNotification('error', `Test webhook failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Error testing webhook:', error);
            showNotification('error', `Failed to test webhook: ${error.message}`);
        } finally {
            // Reset button state
            const testBtn = document.querySelector(`#test-webhook-btn[data-webhook-id="${webhookId}"]`);
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.innerHTML = 'Test Webhook';
            }
        }
    }
}

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return result;
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
