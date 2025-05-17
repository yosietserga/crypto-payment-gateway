/**
 * Authentication Module for Crypto Payment Gateway
 */

// Configuration
const AUTH_CONFIG = {
    apiBaseUrl: 'http://localhost:3000/api/v1',
    tokenName: 'jwt_token',
    userDataName: 'user_data',
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    minPasswordLength: 8,
    passwordStrengthRegex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    refreshTokenName: 'refresh_token',
    tokenRefreshThreshold: 15 * 60 * 1000, // 15 minutes in milliseconds before expiry to refresh
    loginRedirectPath: 'dashboard.html',
    logoutRedirectPath: 'login.html'
};

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {boolean} remember - Whether to remember login
 * @returns {Promise<Object>} - Login response with user data and token
 */
async function loginUser(email, password, remember = false) {
    try {
        // Validate inputs
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Login failed');
        }
        
        // Parse response
        const data = await response.json();
        
        // Validate response data
        if (!data.token || !data.user) {
            throw new Error('Invalid response from server');
        }
        
        // Store token and user data
        const { token, user } = data;
        storeAuthData(token, user, remember);
        
        return data;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} - Registration response with user data and token
 */
async function registerUser(userData) {
    try {
        // Validate required fields
        validateRegistrationData(userData);
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Registration failed');
        }
        
        // Parse response
        const data = await response.json();
        
        // Validate response data
        if (!data.token || !data.user) {
            throw new Error('Invalid response from server');
        }
        
        // Store token and user data
        const { token, user } = data;
        storeAuthData(token, user, true);
        
        return data;
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

/**
 * Validate registration data
 * @param {Object} userData - User registration data
 * @throws {Error} - If validation fails
 */
function validateRegistrationData(userData) {
    // Check required fields
    if (!userData.email) {
        throw new Error('Email is required');
    }
    
    if (!isValidEmail(userData.email)) {
        throw new Error('Invalid email format');
    }
    
    if (!userData.password) {
        throw new Error('Password is required');
    }
    
    if (userData.password.length < AUTH_CONFIG.minPasswordLength) {
        throw new Error(`Password must be at least ${AUTH_CONFIG.minPasswordLength} characters`);
    }
    
    if (!userData.companyName) {
        throw new Error('Company name is required');
    }
    
    if (!userData.contactName) {
        throw new Error('Contact name is required');
    }
    
    // Phone is optional but if provided, it should be valid
    // Validation handled by the server
}

/**
 * Store authentication data in localStorage
 * @param {string} token - JWT token
 * @param {Object} userData - User data
 * @param {boolean} remember - Whether to remember login
 */
function storeAuthData(token, userData, remember = false) {
    // Always store token
    localStorage.setItem(AUTH_CONFIG.tokenName, token);
    
    // Store user data
    localStorage.setItem(AUTH_CONFIG.userDataName, JSON.stringify(userData));
    
    // If remember is true, set expiry to a longer time
    if (remember) {
        const expiry = Date.now() + AUTH_CONFIG.tokenExpiry;
        localStorage.setItem(`${AUTH_CONFIG.tokenName}_expiry`, expiry.toString());
    }
}

/**
 * Check if user is authenticated
 * @returns {boolean} - Whether user is authenticated
 */
function isAuthenticated() {
    const token = localStorage.getItem(AUTH_CONFIG.tokenName);
    if (!token) return false;
    
    // Check token expiry
    const expiry = localStorage.getItem(`${AUTH_CONFIG.tokenName}_expiry`);
    if (expiry && parseInt(expiry) < Date.now()) {
        // Token expired, clear auth data
        logout();
        return false;
    }
    
    return true;
}

/**
 * Get current user data
 * @returns {Object|null} - User data if authenticated, null otherwise
 */
function getCurrentUser() {
    if (!isAuthenticated()) return null;
    
    const userData = localStorage.getItem(AUTH_CONFIG.userDataName);
    return userData ? JSON.parse(userData) : null;
}

/**
 * Logout user by clearing auth data
 */
function logout() {
    localStorage.removeItem(AUTH_CONFIG.tokenName);
    localStorage.removeItem(`${AUTH_CONFIG.tokenName}_expiry`);
    localStorage.removeItem(AUTH_CONFIG.userDataName);
    localStorage.removeItem(AUTH_CONFIG.refreshTokenName);
    
    // Redirect to login page
    window.location.href = AUTH_CONFIG.logoutRedirectPath;
}

/**
 * Refresh authentication token
 * @returns {Promise<boolean>} - Whether token was refreshed successfully
 */
async function refreshToken() {
    try {
        const refreshToken = localStorage.getItem(AUTH_CONFIG.refreshTokenName);
        if (!refreshToken) return false;
        
        // Call refresh token API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/refresh-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });
        
        if (!response.ok) {
    console.log(response);        // If refresh token is invalid, logout user
            logout();
            return false;
        }
        
        const data = await response.json();
        if (!data.token) {
            logout();
            return false;
        }
        
        // Update token
        localStorage.setItem(AUTH_CONFIG.tokenName, data.token);
        if (data.refreshToken) {
            localStorage.setItem(AUTH_CONFIG.refreshTokenName, data.refreshToken);
        }
        
        // Update expiry
        const expiry = Date.now() + AUTH_CONFIG.tokenExpiry;
        localStorage.setItem(`${AUTH_CONFIG.tokenName}_expiry`, expiry.toString());
        
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

/**
 * Check if token needs refresh and refresh if needed
 * @returns {Promise<boolean>} - Whether token is valid
 */
async function checkAndRefreshToken() {
    if (!isAuthenticated()) return false;
    
    // Check if token needs refresh
    const expiry = localStorage.getItem(`${AUTH_CONFIG.tokenName}_expiry`);
    if (expiry && parseInt(expiry) - Date.now() < AUTH_CONFIG.tokenRefreshThreshold) {
        // Token is about to expire, refresh it
        return await refreshToken();
    }
    
    return true;
}

/**
 * Request password reset
 * @param {string} email - User email
 * @returns {Promise<Object>} - Reset request response
 */
async function requestPasswordReset(email) {
    try {
        // Validate email
        if (!email || !isValidEmail(email)) {
            throw new Error('Valid email is required');
        }
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Password reset request failed');
        }
        
        // Parse response
        const data = await response.json();
        
        return data;
    } catch (error) {
        console.error('Password reset request error:', error);
        throw error;
    }
}

/**
 * Reset password with token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Password reset response
 */
async function resetPassword(token, newPassword) {
    try {
        // Validate inputs
        if (!token) {
            throw new Error('Reset token is required');
        }
        
        if (!newPassword || newPassword.length < AUTH_CONFIG.minPasswordLength) {
            throw new Error(`Password must be at least ${AUTH_CONFIG.minPasswordLength} characters`);
        }
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Password reset failed');
        }
        
        // Parse response
        const data = await response.json();
        
        return data;
    } catch (error) {
        console.error('Password reset error:', error);
        throw error;
    }
}

/**
 * Update user profile
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} - Updated user profile
 */
async function updateUserProfile(profileData) {
    try {
        // Check authentication
        if (!isAuthenticated()) {
            throw new Error('You must be logged in');
        }
        
        const token = localStorage.getItem(AUTH_CONFIG.tokenName);
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/merchant/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profileData)
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Profile update failed');
        }
        
        // Parse response
        const data = await response.json();
        
        // Update stored user data
        const userData = getCurrentUser();
        if (userData) {
            const updatedUserData = { ...userData, ...data.data };
            localStorage.setItem(AUTH_CONFIG.userDataName, JSON.stringify(updatedUserData));
        }
        
        return data.data;
    } catch (error) {
        console.error('Profile update error:', error);
        throw error;
    }
}

/**
 * Change user password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Password change response
 */
async function changePassword(currentPassword, newPassword) {
    try {
        // Check authentication
        if (!isAuthenticated()) {
            throw new Error('You must be logged in');
        }
        
        // Validate inputs
        if (!currentPassword) {
            throw new Error('Current password is required');
        }
        
        if (!newPassword || newPassword.length < AUTH_CONFIG.minPasswordLength) {
            throw new Error(`New password must be at least ${AUTH_CONFIG.minPasswordLength} characters`);
        }
        
        const token = localStorage.getItem(AUTH_CONFIG.tokenName);
        
        // Call API
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        // Handle non-200 responses
        if (!response.ok) {
    console.log(response);        const errorData = await response.json();
            throw new Error(errorData.message || 'Password change failed');
        }
        
        // Parse response
        const data = await response.json();
        
        return data;
    } catch (error) {
        console.error('Password change error:', error);
        throw error;
    }
}

/**
 * Helper: Check if email is valid
 * @param {string} email - Email to validate
 * @returns {boolean} - Whether email is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Helper: Check password strength
 * @param {string} password - Password to check
 * @returns {number} - Strength score from 0-4
 */
function checkPasswordStrength(password) {
    let score = 0;
    
    // Length check
    if (password.length >= AUTH_CONFIG.minPasswordLength) score++;
    
    // Contains lowercase
    if (/[a-z]/.test(password)) score++;
    
    // Contains uppercase
    if (/[A-Z]/.test(password)) score++;
    
    // Contains number
    if (/[0-9]/.test(password)) score++;
    
    // Contains special char
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    
    return score;
}

/**
 * Helper: Get password strength text
 * @param {number} score - Strength score
 * @returns {string} - Strength description
 */
function getPasswordStrengthText(score) {
    switch (score) {
        case 0:
        case 1:
            return 'Weak';
        case 2:
        case 3:
            return 'Medium';
        case 4:
        case 5:
            return 'Strong';
        default:
            return 'Weak';
    }
}

/**
 * Initialize form validation
 * @param {string} formId - Form element ID
 */
function initFormValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    form.addEventListener('submit', function(event) {
        if (!this.checkValidity()) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        this.classList.add('was-validated');
    });
}

// Export functions
window.loginUser = loginUser;
window.registerUser = registerUser;
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.requestPasswordReset = requestPasswordReset;
window.resetPassword = resetPassword;
window.updateUserProfile = updateUserProfile;
window.changePassword = changePassword;
window.checkPasswordStrength = checkPasswordStrength;
window.getPasswordStrengthText = getPasswordStrengthText;
window.initFormValidation = initFormValidation;
window.refreshToken = refreshToken;
window.checkAndRefreshToken = checkAndRefreshToken;

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Skip auth check for public pages
    const publicPages = ['login.html', 'register.html', 'forgot-password.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (publicPages.some(page => currentPage.includes(page))) {
        // On public pages, redirect to dashboard if already authenticated
        if (isAuthenticated() && currentPage !== '') {
            window.location.href = AUTH_CONFIG.loginRedirectPath;
        }
        return;
    }
    
    // For protected pages, ensure user is authenticated
    if (!isAuthenticated()) {
        // Redirect to login
        window.location.href = AUTH_CONFIG.logoutRedirectPath;
        return;
    }
    
    // Check if token needs refresh
    await checkAndRefreshToken();
    
    // Update user info in UI if elements exist
    const user = getCurrentUser();
    if (user) {
        const userNameElement = document.getElementById('user-name');
        const userInitialsElement = document.getElementById('user-initials');
        
        if (userNameElement && user.firstName && user.lastName) {
            userNameElement.textContent = `${user.firstName} ${user.lastName}`;
        }
        
        if (userInitialsElement && user.firstName && user.lastName) {
            userInitialsElement.textContent = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
        }
    }
});