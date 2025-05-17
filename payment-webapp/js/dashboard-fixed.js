/**
 * Dashboard JavaScript for Crypto Payment Gateway
 */

// Configuration
const DASHBOARD_CONFIG = {
    apiBaseUrl: 'http://localhost:3000/api/v1',
    refreshInterval: 30000, // 30 seconds
    dateFormat: {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    },
    chartColors: {
        primary: '#3a86ff',
        success: '#06d6a0',
        warning: '#ffbe0b',
        danger: '#ef476f',
        info: '#4cc9f0'
    }
};

// State
let dashboardState = {
    volumeChartInstance: null,
    distributionChartInstance: null,
    selectedDateRange: 7, // Default to 7 days
    volumeChartView: 'day', // Default to daily view
    lastUpdate: null,
    refreshTimer: null,
    transactionData: null,
    isLoading: false
};

/**
 * Initialize the dashboard
 */
function initializeDashboard() {
    // Get JWT token from localStorage
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Set up event listeners
    setupEventListeners();

    // Initial data fetch
    fetchDashboardData();

    // Set up refresh timer
    dashboardState.refreshTimer = setInterval(fetchDashboardData, DASHBOARD_CONFIG.refreshInterval);
}

/**
 * Set up event listeners for dashboard controls
 */
function setupEventListeners() {
    // Date range selector
    document.querySelectorAll('.date-range-selector button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.date-range-selector button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            this.classList.add('active');
            dashboardState.selectedDateRange = parseInt(this.dataset.range);
            
            // Update URL without reloading
            const url = new URL(window.location);
            url.searchParams.set('range', dashboardState.selectedDateRange);
            window.history.replaceState({}, '', url);
            
            // Fetch data with new range
            fetchDashboardData();
        });
    });
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container') || 
        (() => {
            const container = document.createElement('div');
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
            return container;
        })();
    
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('id', toastId);
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    new bootstrap.Toast(toast).show();
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

/**
 * Fetch dashboard data or use mock data
 */
function fetchDashboardData() {
    if (dashboardState.isLoading) return;
    
    dashboardState.isLoading = true;
    
    // Show loading indicators
    document.querySelectorAll('.loading-skeleton').forEach(el => {
        el.classList.remove('d-none');
    });
    
    // Use mock data instead of real API call
    setTimeout(() => {
        const mockData = getMockDashboardData();
        
        // Update state
        dashboardState.transactionData = mockData;
        dashboardState.lastUpdate = new Date();
        
        // Update UI
        updateDashboardUI(mockData);
        
        // Hide loading indicators
        document.querySelectorAll('.loading-skeleton').forEach(el => {
            el.classList.add('d-none');
        });
        
        // Update status
        dashboardState.isLoading = false;
        
        // Show success message
        showToast('Dashboard data updated successfully', 'success');
    }, 500);
}

/**
 * Generate mock dashboard data
 */
function getMockDashboardData() {
    const today = new Date();
    return {
        stats: {
            total: {
                volume: 52487.65,
                trend: 12.3
            },
            byStatus: [
                { status: 'confirmed', count: 243, trend: 8.7 },
                { status: 'pending', count: 18, trend: 2.5 },
                { status: 'failed', count: 5, trend: -1.2 }
            ],
            activeAddresses: 32,
            addressesTrend: 5.4,
            totalAddresses: 45,
            conversionTrend: 3.8
        },
        recentTransactions: [
            {
                id: 'TX123456',
                amount: 250.00,
                currency: 'USDT',
                status: 'confirmed',
                date: new Date(today.getTime() - 2 * 60 * 60 * 1000),
                address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
            },
            {
                id: 'TX123455',
                amount: 0.0125,
                currency: 'BTC',
                status: 'confirmed',
                date: new Date(today.getTime() - 5 * 60 * 60 * 1000),
                address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
            },
            {
                id: 'TX123454',
                amount: 0.25,
                currency: 'ETH',
                status: 'pending',
                date: new Date(today.getTime() - 12 * 60 * 60 * 1000),
                address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
            }
        ],
        alerts: [
            {
                type: 'success',
                message: 'Large transaction of 1.25 BTC processed successfully',
                date: new Date(today.getTime() - 1 * 60 * 60 * 1000)
            },
            {
                type: 'warning',
                message: 'System maintenance scheduled for tomorrow',
                date: new Date(today.getTime() - 8 * 60 * 60 * 1000)
            }
        ]
    };
}

/**
 * Update dashboard UI with data
 */
function updateDashboardUI(data) {
    // Only update if elements exist
    if (document.getElementById('total-volume')) {
        updateStatsCards(data.stats);
    }
    
    if (document.getElementById('recent-transactions-container')) {
        updateRecentTransactions(data.recentTransactions);
    }
    
    if (document.getElementById('alerts-container')) {
        updateAlerts(data.alerts || []);
    }
}

/**
 * Update stats cards with data
 */
function updateStatsCards(stats) {
    if (document.getElementById('total-volume')) {
        document.getElementById('total-volume').textContent = formatCurrency(stats.total.volume);
    }
    
    const volumeTrendEl = document.getElementById('volume-trend');
    if (volumeTrendEl) {
        volumeTrendEl.textContent = formatTrendPercentage(stats.total.trend || 0);
        volumeTrendEl.parentElement.classList.toggle('positive', stats.total.trend >= 0);
        volumeTrendEl.parentElement.classList.toggle('negative', stats.total.trend < 0);
    }
    
    if (document.getElementById('successful-payments')) {
        const successfulPayments = stats.byStatus.find(s => s.status === 'confirmed')?.count || 0;
        document.getElementById('successful-payments').textContent = successfulPayments;
    }
}

/**
 * Update recent transactions table
 */
function updateRecentTransactions(transactions) {
    const container = document.getElementById('recent-transactions-container');
    if (!container) return;
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No recent transactions found.</div>';
        return;
    }
    
    let transactionsHtml = '';
    transactions.forEach(tx => {
        const formattedDate = formatDate(tx.date);
        const statusClass = getStatusClass(tx.status);
        
        transactionsHtml += `
            <div class="transaction-item">
                <div class="transaction-icon ${statusClass}">
                    <i class="bi bi-currency-exchange"></i>
                </div>
                <div class="transaction-content">
                    <div class="transaction-id">${tx.id}</div>
                    <div class="transaction-amount">${formatCurrency(tx.amount)} ${tx.currency}</div>
                    <div class="transaction-status">${capitalizeFirstLetter(tx.status)}</div>
                    <div class="transaction-time">${formattedDate}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = transactionsHtml;
}

/**
 * Update alerts list
 */
function updateAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No alerts at this time.</div>';
        return;
    }
    
    let alertsHtml = '';
    alerts.forEach(alert => {
        const formattedDate = formatDate(alert.date);
        
        alertsHtml += `
            <li class="alert-item">
                <div class="alert-icon ${alert.type}">
                    <i class="bi bi-${alert.type === 'warning' ? 'exclamation-triangle' : 
                        alert.type === 'danger' ? 'x-circle' : 
                        alert.type === 'success' ? 'check-circle' : 'info-circle'}"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-title">${alert.message}</div>
                    <div class="alert-time">${formattedDate}</div>
                </div>
            </li>
        `;
    });
    
    container.innerHTML = alertsHtml;
}

/**
 * Get status class for styling
 */
function getStatusClass(status) {
    const statusMap = {
        'confirmed': 'success',
        'completed': 'success',
        'pending': 'warning',
        'processing': 'warning',
        'failed': 'danger',
        'error': 'danger',
        'expired': 'secondary'
    };
    
    return statusMap[status.toLowerCase()] || 'info';
}

/**
 * Format date
 */
function formatDate(date) {
    if (!date) return 'Unknown';
    
    const dateObj = new Date(date);
    return dateObj.toLocaleString();
}

/**
 * Format currency value
 */
function formatCurrency(value) {
    if (value === undefined || value === null) return '$0.00';
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '$0.00';
    
    return '$' + numValue.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

/**
 * Format number
 */
function formatNumber(value) {
    if (value === undefined || value === null) return '0';
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '0';
    
    return numValue.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

/**
 * Format trend percentage
 */
function formatTrendPercentage(value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '0%';
    
    const sign = numValue >= 0 ? '+' : '';
    return sign + numValue.toFixed(1) + '%';
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Export functions for use in other files
window.initializeDashboard = initializeDashboard;
