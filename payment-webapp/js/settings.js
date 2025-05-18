/**
 * Settings JavaScript for Crypto Payment Gateway
 */

document.addEventListener('DOMContentLoaded', function() {
    initSettingsPage();
});

/**
 * Initialize the settings page
 */
function initSettingsPage() {
    // Initialize API client
    const api = new PaymentAPI();
    
    // Get elements
    const profileForm = document.getElementById('profile-settings-form');
    const securityForm = document.getElementById('security-settings-form');
    const notificationForm = document.getElementById('notification-settings-form');
    const apiSettingsForm = document.getElementById('api-settings-form');
    
    // Load settings
    loadSettings();
    
    // Set up form submissions
    if (profileForm) {
        profileForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveProfileSettings();
        });
    }
    
    if (securityForm) {
        securityForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveSecuritySettings();
        });
    }
    
    if (notificationForm) {
        notificationForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveNotificationSettings();
        });
    }
    
    if (apiSettingsForm) {
        apiSettingsForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveApiSettings();
        });
    }
    
    /**
     * Load user settings
     */
    async function loadSettings() {
        try {
            // Show loading state
            document.querySelectorAll('.settings-section').forEach(section => {
                section.classList.add('loading');
            });
            
            // Get settings from API
            const settings = await api.getUserSettings();
            
            // Update profile settings form
            if (profileForm) {
                profileForm.querySelector('#first-name').value = settings.profile.firstName || '';
                profileForm.querySelector('#last-name').value = settings.profile.lastName || '';
                profileForm.querySelector('#email').value = settings.profile.email || '';
                profileForm.querySelector('#company').value = settings.profile.company || '';
                profileForm.querySelector('#website').value = settings.profile.website || '';
                
                // Set timezone
                const timezoneSelect = profileForm.querySelector('#timezone');
                if (timezoneSelect && settings.profile.timezone) {
                    timezoneSelect.value = settings.profile.timezone;
                }
            }
            
            // Update notification settings form
            if (notificationForm) {
                notificationForm.querySelector('#email-payment-received').checked = settings.notifications.emailPaymentReceived || false;
                notificationForm.querySelector('#email-payment-confirmed').checked = settings.notifications.emailPaymentConfirmed || false;
                notificationForm.querySelector('#email-payment-failed').checked = settings.notifications.emailPaymentFailed || false;
                notificationForm.querySelector('#email-payout-completed').checked = settings.notifications.emailPayoutCompleted || false;
                notificationForm.querySelector('#email-payout-failed').checked = settings.notifications.emailPayoutFailed || false;
                notificationForm.querySelector('#email-security-alerts').checked = settings.notifications.emailSecurityAlerts || false;
                notificationForm.querySelector('#webhook-failure-alerts').checked = settings.notifications.webhookFailureAlerts || false;
            }
            
            // Update API settings form
            if (apiSettingsForm) {
                apiSettingsForm.querySelector('#webhook-retries').value = settings.api.webhookRetries || 3;
                apiSettingsForm.querySelector('#webhook-timeout').value = settings.api.webhookTimeout || 5000;
                apiSettingsForm.querySelector('#ip-whitelist').value = settings.api.ipWhitelist ? settings.api.ipWhitelist.join('\n') : '';
                apiSettingsForm.querySelector('#rate-limiting-enabled').checked = settings.api.rateLimitingEnabled || false;
                
                // Update rate limit inputs
                const rateLimitValue = apiSettingsForm.querySelector('#rate-limit-value');
                const rateLimitPeriod = apiSettingsForm.querySelector('#rate-limit-period');
                
                if (rateLimitValue && rateLimitPeriod && settings.api.rateLimit) {
                    rateLimitValue.value = settings.api.rateLimit.value || 100;
                    rateLimitPeriod.value = settings.api.rateLimit.period || 'minute';
                }
                
                // Set enabled/disabled state
                toggleRateLimitInputs(settings.api.rateLimitingEnabled);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            showNotification('error', 'Failed to load settings: ' + (error.message || 'Unknown error'));
        } finally {
            // Hide loading state
            document.querySelectorAll('.settings-section').forEach(section => {
                section.classList.remove('loading');
            });
        }
    }
    
    /**
     * Save profile settings
     */
    async function saveProfileSettings() {
        try {
            // Show loading state
            const submitBtn = profileForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
            
            // Get form data
            const profileData = {
                firstName: profileForm.querySelector('#first-name').value,
                lastName: profileForm.querySelector('#last-name').value,
                email: profileForm.querySelector('#email').value,
                company: profileForm.querySelector('#company').value,
                website: profileForm.querySelector('#website').value,
                timezone: profileForm.querySelector('#timezone').value
            };
            
            // Save to API
            await api.updateUserProfile(profileData);
            
            // Update local data
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            userData.firstName = profileData.firstName;
            userData.lastName = profileData.lastName;
            userData.email = profileData.email;
            localStorage.setItem('user_data', JSON.stringify(userData));
            
            // Update UI with new user data
            if (userData.firstName && userData.lastName) {
                document.getElementById('user-name').textContent = `${userData.firstName} ${userData.lastName}`;
                const userInitials = document.getElementById('user-initials');
                if (userInitials) {
                    userInitials.textContent = `${userData.firstName.charAt(0)}${userData.lastName.charAt(0)}`;
                }
            }
            if (userData.email) {
                document.getElementById('user-email').textContent = userData.email;
            }
            
            // Show success message
            showNotification('success', 'Profile settings saved successfully');
        } catch (error) {
            console.error('Error saving profile settings:', error);
            showNotification('error', 'Failed to save profile settings: ' + (error.message || 'Unknown error'));
        } finally {
            // Reset button state
            const submitBtn = profileForm.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
    
    /**
     * Save security settings
     */
    async function saveSecuritySettings() {
        try {
            // Show loading state
            const submitBtn = securityForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
            
            // Get form data
            const currentPassword = securityForm.querySelector('#current-password').value;
            const newPassword = securityForm.querySelector('#new-password').value;
            const confirmPassword = securityForm.querySelector('#confirm-password').value;
            
            // Validate passwords
            if (!currentPassword) {
                throw new Error('Current password is required');
            }
            
            if (newPassword && newPassword !== confirmPassword) {
                throw new Error('New passwords do not match');
            }
            
            // Prepare security data
            const securityData = {
                currentPassword: currentPassword,
                newPassword: newPassword || undefined,
                twoFactorEnabled: securityForm.querySelector('#enable-2fa').checked,
                autoLogout: securityForm.querySelector('#auto-logout').checked,
                sessionTimeout: parseInt(securityForm.querySelector('#session-timeout').value, 10)
            };
            
            // Save to API
            await api.updateSecuritySettings(securityData);
            
            if (newPassword && newPassword.length < 8) {
                throw new Error('New password must be at least 8 characters long');
            }
            
            // Save to API
            await api.updateUserPassword({
                currentPassword,
                newPassword
            });
            
            // Clear form
            securityForm.reset();
            
            // Show success message
            showNotification('success', 'Password updated successfully');
        } catch (error) {
            console.error('Error saving security settings:', error);
            showNotification('error', 'Failed to update password: ' + (error.message || 'Unknown error'));
        } finally {
            // Reset button state
            const submitBtn = securityForm.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Password';
        }
    }
    
    /**
     * Save notification settings
     */
    async function saveNotificationSettings() {
        try {
            // Show loading state
            const submitBtn = notificationForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
            
            // Get form data
            const notificationData = {
                emailPaymentReceived: notificationForm.querySelector('#notify-payments').checked,
                emailPayoutCompleted: notificationForm.querySelector('#notify-payouts').checked,
                emailSecurityAlerts: notificationForm.querySelector('#notify-security').checked,
                marketingUpdates: notificationForm.querySelector('#notify-marketing').checked,
                notificationEmail: notificationForm.querySelector('#notification-email').value,
                smsEnabled: notificationForm.querySelector('#enable-sms').checked,
                phoneNumber: notificationForm.querySelector('#notification-phone').value
            };
            
            // Save to API
            await api.updateNotificationSettings(notificationData);
            
            // Show success message
            showNotification('success', 'Notification settings saved successfully');
        } catch (error) {
            console.error('Error saving notification settings:', error);
            showNotification('error', 'Failed to save notification settings: ' + (error.message || 'Unknown error'));
        } finally {
            // Reset button state
            const submitBtn = notificationForm.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
    
    /**
     * Save API settings
     */
    async function saveApiSettings() {
        try {
            // Show loading state
            const submitBtn = apiSettingsForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
            
            // Get form data
            const webhookRetries = parseInt(apiSettingsForm.querySelector('#webhook-retries').value, 10) || 3;
            const webhookTimeout = parseInt(apiSettingsForm.querySelector('#webhook-timeout').value, 10) || 5000;
            const ipWhitelistText = apiSettingsForm.querySelector('#ip-whitelist').value;
            const rateLimitingEnabled = apiSettingsForm.querySelector('#rate-limiting-enabled').checked;
            const rateLimitValue = parseInt(apiSettingsForm.querySelector('#rate-limit-value').value, 10) || 100;
            const rateLimitPeriod = apiSettingsForm.querySelector('#rate-limit-period').value || 'minute';
            
            // Parse IP whitelist (split by newlines and remove empty entries)
            const ipWhitelist = ipWhitelistText
                .split('\n')
                .map(ip => ip.trim())
                .filter(ip => ip);
            
            // Prepare API settings data
            const apiSettingsData = {
                webhookRetries,
                webhookTimeout,
                ipWhitelist,
                rateLimitingEnabled,
                rateLimit: {
                    value: rateLimitValue,
                    period: rateLimitPeriod
                }
            };
            
            // Save to API
            await api.updateApiSettings(apiSettingsData);
            
            // Show success message
            showNotification('success', 'API settings saved successfully');
        } catch (error) {
            console.error('Error saving API settings:', error);
            showNotification('error', 'Failed to save API settings: ' + (error.message || 'Unknown error'));
        } finally {
            // Reset button state
            const submitBtn = apiSettingsForm.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
    
    // Setup event listeners for rate limit toggle
    const rateLimitToggle = document.getElementById('rate-limiting-enabled');
    if (rateLimitToggle) {
        rateLimitToggle.addEventListener('change', function() {
            toggleRateLimitInputs(this.checked);
        });
    }
    
    // Helper function to toggle rate limit inputs
    function toggleRateLimitInputs(enabled) {
        const rateLimitValue = document.getElementById('rate-limit-value');
        const rateLimitPeriod = document.getElementById('rate-limit-period');
        
        if (rateLimitValue && rateLimitPeriod) {
            rateLimitValue.disabled = !enabled;
            rateLimitPeriod.disabled = !enabled;
        }
    }
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
