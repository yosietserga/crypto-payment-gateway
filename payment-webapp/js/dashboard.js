/**
 * Dashboard JavaScript for Crypto Payment Gateway
 */

// Configuration
const DASHBOARD_CONFIG = {
    apiBaseUrl: '/api/v1',
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
        info: '#4cc9f0',
        dark: '#212529',
        light: '#f8f9fa',
        muted: '#6c757d',
        background: '#f5f7fa'
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

    // Set initial state from URL params if available
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('range')) {
        dashboardState.selectedDateRange = parseInt(urlParams.get('range'));
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
            // Remove active class from all buttons
            document.querySelectorAll('.date-range-selector button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Update selected range
            dashboardState.selectedDateRange = parseInt(this.dataset.range);
            
            // Update URL without reloading
            const url = new URL(window.location);
            url.searchParams.set('range', dashboardState.selectedDateRange);
            window.history.replaceState({}, '', url);
            
            // Fetch data with new range
            fetchDashboardData();
        });
    });
    
    // Chart view selector
    document.querySelectorAll('[data-chart-view]').forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            document.querySelectorAll('[data-chart-view]').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Update selected view
            dashboardState.volumeChartView = this.dataset.chartView;
            
            // Update chart
            updateVolumeChart();
        });
    });
}

/**
 * Fetch dashboard data from API
 */
async function fetchDashboardData() {
    if (dashboardState.isLoading) return;
    
    dashboardState.isLoading = true;
    
    try {
        const token = localStorage.getItem('jwt_token');
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dashboardState.selectedDateRange);
        
        // Format dates for API
        const startDateStr = startDate.toISOString();
        const endDateStr = endDate.toISOString();
        
        // Fetch dashboard stats
        const statsResponse = await fetch(`${DASHBOARD_CONFIG.apiBaseUrl}/merchant/dashboard?startDate=${startDateStr}&endDate=${endDateStr}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Check for errors
        if (!statsResponse.ok) {
            throw new Error('Failed to fetch dashboard data');
        }
        
        // Parse response
        const statsData = await statsResponse.json();
        
        // Store data
        dashboardState.transactionData = statsData.data;
        dashboardState.lastUpdate = new Date();
        
        // Update UI with data
        updateDashboardUI(statsData.data);
        
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        
        // Show error in alerts section
        const alertsContainer = document.getElementById('alerts-container');
        alertsContainer.innerHTML = `
            <li class="alert-item">
                <div class="alert-icon danger">
                    <i class="bi bi-exclamation-triangle"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-title">Failed to load dashboard data</div>
                    <div class="alert-time">${formatDate(new Date())}</div>
                </div>
            </li>
        `;
        
    } finally {
        dashboardState.isLoading = false;
    }
}

/**
 * Update dashboard UI with data
 * @param {Object} data - Dashboard data from API
 */
function updateDashboardUI(data) {
    // Update stats cards
    updateStatsCards(data.stats);
    
    // Update charts
    initializeCharts(data);
    
    // Update recent transactions
    updateRecentTransactions(data.recentTransactions);
    
    // Update alerts
    updateAlerts(data.alerts || []);
}

/**
 * Update stats cards with data
 * @param {Object} stats - Stats data
 */
function updateStatsCards(stats) {
    // Format volume with 2 decimal places
    document.getElementById('total-volume').textContent = formatCurrency(stats.total.volume);
    
    // Set trend percentage with + or - sign
    const volumeTrendEl = document.getElementById('volume-trend');
    volumeTrendEl.textContent = formatTrendPercentage(stats.total.trend || 0);
    volumeTrendEl.parentElement.classList.toggle('positive', stats.total.trend >= 0);
    volumeTrendEl.parentElement.classList.toggle('negative', stats.total.trend < 0);
    
    // Update successful payments count
    const successfulPayments = stats.byStatus.find(s => s.status === 'confirmed')?.count || 0;
    document.getElementById('successful-payments').textContent = successfulPayments;
    
    // Set payments trend
    const paymentsTrendEl = document.getElementById('payments-trend');
    const paymentsTrend = stats.byStatus.find(s => s.status === 'confirmed')?.trend || 0;
    paymentsTrendEl.textContent = formatTrendPercentage(paymentsTrend);
    paymentsTrendEl.parentElement.classList.toggle('positive', paymentsTrend >= 0);
    paymentsTrendEl.parentElement.classList.toggle('negative', paymentsTrend < 0);
    
    // Update active addresses
    document.getElementById('active-addresses').textContent = stats.activeAddresses || 0;
    
    // Set addresses trend
    const addressesTrendEl = document.getElementById('addresses-trend');
    addressesTrendEl.textContent = formatTrendPercentage(stats.addressesTrend || 0);
    addressesTrendEl.parentElement.classList.toggle('positive', stats.addressesTrend >= 0);
    addressesTrendEl.parentElement.classList.toggle('negative', stats.addressesTrend < 0);
    
    // Calculate conversion rate
    const totalAddresses = stats.totalAddresses || 1; // Avoid division by zero
    const conversionRate = Math.round((successfulPayments / totalAddresses) * 100);
    document.getElementById('conversion-rate').textContent = conversionRate;
    
    // Set conversion trend
    const conversionTrendEl = document.getElementById('conversion-trend');
    conversionTrendEl.textContent = formatTrendPercentage(stats.conversionTrend || 0);
    conversionTrendEl.parentElement.classList.toggle('positive', stats.conversionTrend >= 0);
    conversionTrendEl.parentElement.classList.toggle('negative', stats.conversionTrend < 0);
}

/**
 * Initialize charts with data
 * @param {Object} data - Dashboard data
 */
function initializeCharts(data) {
    initializeVolumeChart(data);
    initializeDistributionChart(data);
}

/**
 * Initialize volume chart
 * @param {Object} data - Dashboard data
 */
function initializeVolumeChart(data) {
    // Prepare data for chart based on view (day, week, month)
    const chartData = prepareVolumeChartData(data);
    
    // Check if chart instance exists
    if (dashboardState.volumeChartInstance) {
        // Update existing chart
        dashboardState.volumeChartInstance.updateOptions({
            series: [{
                name: 'Volume',
                data: chartData.series
            }],
            xaxis: {
                categories: chartData.categories
            }
        });
    } else {
        // Create new chart instance
        const options = {
            series: [{
                name: 'Volume',
                data: chartData.series
            }],
            chart: {
                height: 300,
                type: 'area',
                toolbar: {
                    show: false
                },
                fontFamily: 'Inter, sans-serif',
                background: 'transparent'
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            colors: [DASHBOARD_CONFIG.chartColors.primary],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.3,
                    stops: [0, 90, 100]
                }
            },
            xaxis: {
                categories: chartData.categories,
                labels: {
                    style: {
                        colors: DASHBOARD_CONFIG.chartColors.muted,
                        fontFamily: 'Inter, sans-serif'
                    }
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                }
            },
            yaxis: {
                labels: {
                    formatter: function(val) {
                        return '$' + formatNumber(val);
                    },
                    style: {
                        colors: DASHBOARD_CONFIG.chartColors.muted,
                        fontFamily: 'Inter, sans-serif'
                    }
                }
            },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy'
                },
                y: {
                    formatter: function(val) {
                        return '$' + formatNumber(val);
                    }
                }
            },
            grid: {
                borderColor: DASHBOARD_CONFIG.chartColors.light,
                strokeDashArray: 4,
                xaxis: {
                    lines: {
                        show: true
                    }
                },
                yaxis: {
                    lines: {
                        show: true
                    }
                }
            }
        };
        
        // Create chart
        const volumeChart = new ApexCharts(document.getElementById('volume-chart'), options);
        volumeChart.render();
        
        // Store chart instance
        dashboardState.volumeChartInstance = volumeChart;
    }
}

/**
 * Prepare data for volume chart based on view
 * @param {Object} data - Dashboard data
 * @returns {Object} - Chart data with series and categories
 */
function prepareVolumeChartData(data) {
    let series = [];
    let categories = [];
    
    // Ensure transaction history exists
    if (!data.transactionHistory || !data.transactionHistory.length) {
        return { series, categories };
    }
    
    // Sort by date
    const sortedData = [...data.transactionHistory].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    
    // Group data based on view
    const groupedData = {};
    
    switch (dashboardState.volumeChartView) {
        case 'day':
            // Group by day
            sortedData.forEach(item => {
                const day = new Date(item.date).toLocaleDateString();
                if (!groupedData[day]) {
                    groupedData[day] = 0;
                }
                groupedData[day] += parseFloat(item.amount);
            });
            break;
            
        case 'week':
            // Group by week
            sortedData.forEach(item => {
                const date = new Date(item.date);
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                const week = weekStart.toLocaleDateString();
                if (!groupedData[week]) {
                    groupedData[week] = 0;
                }
                groupedData[week] += parseFloat(item.amount);
            });
            break;
            
        case 'month':
            // Group by month
            sortedData.forEach(item => {
                const date = new Date(item.date);
                const month = `${date.getFullYear()}-${date.getMonth() + 1}`;
                if (!groupedData[month]) {
                    groupedData[month] = 0;
                }
                groupedData[month] += parseFloat(item.amount);
            });
            break;
    }
    
    // Format for chart
    Object.keys(groupedData).forEach(key => {
        categories.push(key);
        series.push(groupedData[key]);
    });
    
    return { series, categories };
}

/**
 * Update volume chart
 */
function updateVolumeChart() {
    // Only update if data is available
    if (!dashboardState.transactionData) return;
    
    // Update chart with existing data and new view
    initializeVolumeChart(dashboardState.transactionData);
}

/**
 * Initialize distribution chart
 * @param {Object} data - Dashboard data
 */
function initializeDistributionChart(data) {
    // Prepare data for chart
    const chartData = prepareDistributionChartData(data);
    
    // Check if chart instance exists
    if (dashboardState.distributionChartInstance) {
        // Update existing chart
        dashboardState.distributionChartInstance.updateOptions({
            series: chartData.series,
            labels: chartData.labels
        });
    } else {
        // Create new chart instance
        const options = {
            series: chartData.series,
            chart: {
                type: 'donut',
                height: 300,
                fontFamily: 'Inter, sans-serif',
                background: 'transparent'
            },
            labels: chartData.labels,
            colors: [
                DASHBOARD_CONFIG.chartColors.success,
                DASHBOARD_CONFIG.chartColors.warning,
                DASHBOARD_CONFIG.chartColors.danger,
                DASHBOARD_CONFIG.chartColors.muted
            ],
            plotOptions: {
                pie: {
                    donut: {
                        size: '65%',
                        labels: {
                            show: true,
                            name: {
                                show: true,
                                fontFamily: 'Inter, sans-serif',
                                offsetY: 0
                            },
                            value: {
                                show: true,
                                fontFamily: 'Inter, sans-serif',
                                formatter: function(val) {
                                    return Math.round(val) + '%';
                                }
                            },
                            total: {
                                show: true,
                                label: 'Total',
                                fontFamily: 'Inter, sans-serif',
                                formatter: function(w) {
                                    const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                    return Math.round(total) + '%';
                                }
                            }
                        }
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            legend: {
                position: 'bottom',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                itemMargin: {
                    horizontal: 10,
                    vertical: 5
                }
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: {
                        height: 250
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }]
        };
        
        // Create chart
        const distributionChart = new ApexCharts(document.getElementById('distribution-chart'), options);
        distributionChart.render();
        
        // Store chart instance
        dashboardState.distributionChartInstance = distributionChart;
    }
}

/**
 * Prepare data for distribution chart
 * @param {Object} data - Dashboard data
 * @returns {Object} - Chart data with series and labels
 */
function prepareDistributionChartData(data) {
    // Default empty data
    const defaultData = {
        series: [0, 0, 0, 0],
        labels: ['Confirmed', 'Pending', 'Failed', 'Expired']
    };
    
    // Ensure stats exist
    if (!data.stats || !data.stats.byStatus || !data.stats.byStatus.length) {
        return defaultData;
    }
    
    // Calculate total count
    const totalCount = data.stats.byStatus.reduce((total, item) => total + item.count, 0);
    
    // Avoid division by zero
    if (totalCount === 0) return defaultData;
    
    // Map status to percentages
    const statusMap = {
        'confirmed': 0,
        'pending': 1,
        'failed': 2,
        'expired': 3
    };
    
    // Initialize series with zeros
    const series = [0, 0, 0, 0];
    
    // Fill in actual percentages
    data.stats.byStatus.forEach(item => {
        const index = statusMap[item.status];
        if (index !== undefined) {
            series[index] = (item.count / totalCount) * 100;
        }
    });
    
    return {
        series,
        labels: defaultData.labels
    };
}

/**
 * Update recent transactions table
 * @param {Array} transactions - Recent transactions
 */
function updateRecentTransactions(transactions) {
    const tableBody = document.getElementById('recent-transactions');
    
    // Clear existing content
    tableBody.innerHTML = '';
    
    // Check if transactions exist
    if (!transactions || !transactions.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">No recent transactions</td>
            </tr>
        `;
        return;
    }
    
    // Add transactions to table
    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        
        // Create shortened transaction ID
        const shortId = transaction.id.substring(0, 8) + '...' + transaction.id.substring(transaction.id.length - 4);
        
        // Format date
        const date = formatDate(new Date(transaction.createdAt));
        
        // Format amount
        const amount = formatCurrency(transaction.amount);
        
        // Determine status class
        const statusClass = getStatusClass(transaction.status);
        
        // Determine type icon
        const typeIcon = transaction.type === 'payment' ? 'bi-wallet2' : 'bi-send';
        
        // Set row content
        row.innerHTML = `
            <td><span class="transaction-id">${shortId}</span></td>
            <td>${date}</td>
            <td><span class="transaction-amount">${amount} ${transaction.currency}</span></td>
            <td><span class="status-badge ${transaction.status.toLowerCase()}">${transaction.status}</span></td>
            <td><i class="${typeIcon} me-1"></i> ${capitalizeFirstLetter(transaction.type)}</td>
        `;
        
        // Add click event to navigate to transaction details
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            window.location.href = `transaction-details.html?id=${transaction.id}`;
        });
        
        // Add row to table
        tableBody.appendChild(row);
    });
}

/**
 * Update alerts list
 * @param {Array} alerts - System alerts
 */
function updateAlerts(alerts) {
    const alertsContainer = document.getElementById('alerts-container');
    
    // Clear existing content
    alertsContainer.innerHTML = '';
    
    // Check if alerts exist
    if (!alerts || !alerts.length) {
        // Create a default success alert
        alertsContainer.innerHTML = `
            <li class="alert-item">
                <div class="alert-icon info">
                    <i class="bi bi-check-circle"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-title">System operating normally</div>
                    <div class="alert-time">${formatDate(new Date())}</div>
                </div>
            </li>
        `;
        return;
    }
    
    // Add alerts to list
    alerts.forEach(alert => {
        // Determine alert type icon
        let iconClass = 'info';
        let icon = 'bi-info-circle';
        
        switch (alert.severity) {
            case 'warning':
                iconClass = 'warning';
                icon = 'bi-exclamation-circle';
                break;
            case 'error':
                iconClass = 'danger';
                icon = 'bi-exclamation-triangle';
                break;
            case 'success':
                iconClass = 'info';
                icon = 'bi-check-circle';
                break;
        }
        
        // Create alert item
        const alertItem = document.createElement('li');
        alertItem.className = 'alert-item';
        alertItem.innerHTML = `
            <div class="alert-icon ${iconClass}">
                <i class="${icon}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${alert.message}</div>
                <div class="alert-time">${formatDate(new Date(alert.timestamp))}</div>
            </div>
        `;
        
        // Add alert to container
        alertsContainer.appendChild(alertItem);
    });
}

/**
 * Get status class for styling
 * @param {string} status - Transaction status
 * @returns {string} - CSS class for status
 */
function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'confirmed':
        case 'completed':
            return 'confirmed';
        case 'pending':
        case 'processing':
            return 'pending';
        case 'failed':
            return 'failed';
        case 'expired':
            return 'expired';
        default:
            return 'pending';
    }
}

/**
 * Format date
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', DASHBOARD_CONFIG.dateFormat);
}

/**
 * Format currency value
 * @param {number|string} value - Currency value
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return numValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format number
 * @param {number|string} value - Number to format
 * @returns {string} - Formatted number string
 */
function formatNumber(value) {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (numValue >= 1000000) {
        return (numValue / 1000000).toFixed(1) + 'M';
    } else if (numValue >= 1000) {
        return (numValue / 1000).toFixed(1) + 'K';
    } else {
        return numValue.toFixed(2);
    }
}

/**
 * Format trend percentage
 * @param {number} value - Trend percentage value
 * @returns {string} - Formatted trend string with sign
 */
function formatTrendPercentage(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

/**
 * Capitalize first letter of a string
 * @param {string} string - String to capitalize
 * @returns {string} - Capitalized string
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Export functions for use in other files
window.initializeDashboard = initializeDashboard; 