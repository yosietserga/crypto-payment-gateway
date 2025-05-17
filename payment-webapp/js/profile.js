/**
 * Profile Management JavaScript for Crypto Payment Gateway
 */

// Configuration
const PROFILE_CONFIG = {
    apiBaseUrl: 'http://localhost:3000/api/v1',
    passwordMinLength: 8,
    passwordRegex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
};

// DOM Elements
const elements = {
    profileForm: document.getElementById('profile-form'),
    firstName: document.getElementById('firstName'),
    lastName: document.getElementById('lastName'),
    email: document.getElementById('email'),
    company: document.getElementById('company'),
    phone: document.getElementById('phone'),
    updateProfileBtn: document.getElementById('update-profile-btn'),
    profileErrors: document.getElementById('profile-errors'),
    
    passwordForm: document.getElementById('password-form'),
    currentPassword: document.getElementById('current-password'),
    newPassword: document.getElementById('new-password'),
    confirmPassword: document.getElementById('confirm-password'),
    passwordStrength: document.getElementById('password-strength'),
    passwordFeedback: document.getElementById('password-feedback'),
    changePasswordBtn: document.getElementById('change-password-btn'),
    passwordErrors: document.getElementById('password-errors')
};

/**
 * Initialize profile page
 */
function initializeProfile() {
    // Check authentication
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Load user data
    loadUserProfile();

    // Set up event listeners
    setupEventListeners();
}

/**
 * Load user profile data
 */
async function loadUserProfile() {
    try {
        // Get user data from localStorage
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        
        // Populate form fields
        if (elements.firstName) elements.firstName.value = userData.firstName || '';
        if (elements.lastName) elements.lastName.value = userData.lastName || '';
        if (elements.email) elements.email.value = userData.email || '';
        if (elements.company) elements.company.value = userData.merchant?.companyName || '';
        if (elements.phone) elements.phone.value = userData.phone || '';
        
        // Get fresh data from API
        await fetchUserProfile();
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Error loading profile data', 'error');
    }
}

/**
 * Fetch user profile from API
 */
async function fetchUserProfile() {
    try {
        const token = localStorage.getItem('jwt_token');
        
        const response = await fetch(`${PROFILE_CONFIG.apiBaseUrl}/users/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
    console.log(response);        throw new Error('Failed to fetch profile data');
        }
        
        const userData = await response.json();
        
        // Update local storage
        localStorage.setItem('user_data', JSON.stringify(userData));
        
        // Update form fields with fresh data
        if (elements.firstName) elements.firstName.value = userData.firstName || '';
        if (elements.lastName) elements.lastName.value = userData.lastName || '';
        if (elements.email) elements.email.value = userData.email || '';
        if (elements.company) elements.company.value = userData.merchant?.companyName || '';
        if (elements.phone) elements.phone.value = userData.phone || '';
        
        // Update header user info
        updateHeaderUserInfo(userData);
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        // We don't show notification here as we already have data from localStorage
    }
}

/**
 * Update header user info
 * @param {Object} userData - User data
 */
function updateHeaderUserInfo(userData) {
    const userNameElement = document.getElementById('user-name');
    const userEmailElement = document.getElementById('user-email');
    const userInitialsElement = document.getElementById('user-initials');
    
    if (userData.email && userEmailElement) {
        userEmailElement.textContent = userData.email;
    }
    
    if (userData.firstName && userData.lastName && userNameElement) {
        const fullName = `${userData.firstName} ${userData.lastName}`;
        userNameElement.textContent = fullName;
        
        if (userInitialsElement) {
            userInitialsElement.textContent = `${userData.firstName.charAt(0)}${userData.lastName.charAt(0)}`;
        }
    }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.add('show');
        });
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.remove('show');
        });
    }
    
    // Logout functionality
    const logoutLinks = document.querySelectorAll('#logout-link, #header-logout-link');
    logoutLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Clear authentication data
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_data');
            // Redirect to login
            window.location.href = 'login.html';
        });
    });

    // Profile form submission
    if (elements.profileForm) {
        elements.profileForm.addEventListener('submit', handleUpdateProfile);
    }

    // Password form submission
    if (elements.passwordForm) {
        elements.passwordForm.addEventListener('submit', handleChangePassword);
    }

    // Password strength checker
    if (elements.newPassword) {
        elements.newPassword.addEventListener('input', checkPasswordStrength);
    }

    // Password confirmation validator
    if (elements.confirmPassword) {
        elements.confirmPassword.addEventListener('input', validatePasswordMatch);
    }
}

/**
 * Handle profile update form submission
 * @param {Event} event - Form submit event
 */
async function handleUpdateProfile(event) {
    event.preventDefault();
    
    // Validate form
    if (!elements.profileForm.checkValidity()) {
        event.stopPropagation();
        elements.profileForm.classList.add('was-validated');
        return;
    }
    
    // Get form data
    const profileData = {
        firstName: elements.firstName.value.trim(),
        lastName: elements.lastName.value.trim(),
        phone: elements.phone ? elements.phone.value.trim() : ''
    };
    
    // Disable button to prevent multiple submissions
    elements.updateProfileBtn.disabled = true;
    elements.updateProfileBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...';
    
    // Clear previous errors
    if (elements.profileErrors) {
        elements.profileErrors.textContent = '';
        elements.profileErrors.classList.add('d-none');
    }
    
    try {
        // Get token from localStorage
        const token = localStorage.getItem('jwt_token');
        
        // Update profile via API
        const response = await fetch(`${PROFILE_CONFIG.apiBaseUrl}/users/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profileData)
        });
        
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update profile');
        }
        
        const data = await response.json();
        
        // Update local storage with new user data
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        localStorage.setItem('user_data', JSON.stringify({
            ...userData,
            ...data
        }));
        
        // Update header user info
        updateHeaderUserInfo(data);
        
        // Show success message
        showNotification('Profile updated successfully', 'success');
        
    } catch (error) {
        // Show error message
        console.error('Profile update error:', error);
        
        if (elements.profileErrors) {
            elements.profileErrors.textContent = error.message;
            elements.profileErrors.classList.remove('d-none');
        }
    } finally {
        // Re-enable button
        elements.updateProfileBtn.disabled = false;
        elements.updateProfileBtn.innerHTML = 'Update Profile';
    }
}

/**
 * Handle password change form submission
 * @param {Event} event - Form submit event
 */
async function handleChangePassword(event) {
    event.preventDefault();
    
    // Validate form
    if (!elements.passwordForm.checkValidity()) {
        event.stopPropagation();
        elements.passwordForm.classList.add('was-validated');
        return;
    }
    
    // Validate password match
    if (elements.newPassword.value !== elements.confirmPassword.value) {
        elements.confirmPassword.setCustomValidity('Passwords do not match');
        elements.passwordForm.classList.add('was-validated');
        return;
    } else {
        elements.confirmPassword.setCustomValidity('');
    }
    
    // Get form data
    const passwordData = {
        currentPassword: elements.currentPassword.value,
        newPassword: elements.newPassword.value
    };
    
    // Disable button to prevent multiple submissions
    elements.changePasswordBtn.disabled = true;
    elements.changePasswordBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...';
    
    // Clear previous errors
    if (elements.passwordErrors) {
        elements.passwordErrors.textContent = '';
        elements.passwordErrors.classList.add('d-none');
    }
    
    try {
        // Get token from localStorage
        const token = localStorage.getItem('jwt_token');
        
        // Change password via API
        const response = await fetch(`${PROFILE_CONFIG.apiBaseUrl}/users/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(passwordData)
        });
        
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to change password');
        }
        
        // Show success message
        showNotification('Password updated successfully', 'success');
        
        // Reset form
        elements.passwordForm.reset();
        elements.passwordForm.classList.remove('was-validated');
        
    } catch (error) {
        // Show error message
        console.error('Password change error:', error);
        
        if (elements.passwordErrors) {
            elements.passwordErrors.textContent = error.message;
            elements.passwordErrors.classList.remove('d-none');
        }
    } finally {
        // Re-enable button
        elements.changePasswordBtn.disabled = false;
        elements.changePasswordBtn.innerHTML = 'Change Password';
    }
}

/**
 * Check password strength
 */
function checkPasswordStrength() {
    const password = elements.newPassword.value;
    let strength = 0;
    let feedback = [];
    
    // Check length
    if (password.length >= PROFILE_CONFIG.passwordMinLength) {
        strength += 1;
    } else {
        feedback.push(`Password must be at least ${PROFILE_CONFIG.passwordMinLength} characters`);
    }
    
    // Check lowercase
    if (/[a-z]/.test(password)) {
        strength += 1;
    } else {
        feedback.push('Include at least one lowercase letter');
    }
    
    // Check uppercase
    if (/[A-Z]/.test(password)) {
        strength += 1;
    } else {
        feedback.push('Include at least one uppercase letter');
    }
    
    // Check numbers
    if (/\d/.test(password)) {
        strength += 1;
    } else {
        feedback.push('Include at least one number');
    }
    
    // Check special characters
    if (/[@$!%*?&]/.test(password)) {
        strength += 1;
    } else {
        feedback.push('Include at least one special character (@$!%*?&)');
    }
    
    // Update strength meter
    if (elements.passwordStrength) {
        elements.passwordStrength.style.width = `${(strength / 5) * 100}%`;
        
        if (strength < 2) {
            elements.passwordStrength.className = 'password-strength-meter bg-danger';
        } else if (strength < 4) {
            elements.passwordStrength.className = 'password-strength-meter bg-warning';
        } else {
            elements.passwordStrength.className = 'password-strength-meter bg-success';
        }
    }
    
    // Update feedback
    if (elements.passwordFeedback) {
        if (feedback.length > 0) {
            elements.passwordFeedback.innerHTML = feedback.map(item => `<div>${item}</div>`).join('');
            elements.passwordFeedback.style.display = 'block';
        } else {
            elements.passwordFeedback.innerHTML = '<div class="text-success">Strong password</div>';
            elements.passwordFeedback.style.display = 'block';
        }
    }
    
    // Set custom validity for form validation
    if (password && !PROFILE_CONFIG.passwordRegex.test(password)) {
        elements.newPassword.setCustomValidity('Password does not meet requirements');
    } else {
        elements.newPassword.setCustomValidity('');
    }
}

/**
 * Validate password match
 */
function validatePasswordMatch() {
    const newPassword = elements.newPassword.value;
    const confirmPassword = elements.confirmPassword.value;
    
    if (newPassword !== confirmPassword) {
        elements.confirmPassword.setCustomValidity('Passwords do not match');
    } else {
        elements.confirmPassword.setCustomValidity('');
    }
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.querySelector('.notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    // Add appropriate class for notification type
    notification.className = `notification notification-${type} show`;
    
    // Set message
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="bi ${type === 'success' ? 'bi-check-circle' : 
                           type === 'error' ? 'bi-exclamation-circle' : 
                           type === 'warning' ? 'bi-exclamation-triangle' : 'bi-info-circle'}"></i>
        </div>
        <div class="notification-content">
            <p>${message}</p>
        </div>
        <button class="notification-close" aria-label="Close">&times;</button>
    `;
    
    // Add event listener to close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
    });
    
    // Automatically hide after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', initializeProfile);
