/**
 * Dashboard JavaScript for Crypto Payment Gateway
 */

// Configuration
const DASHBOARD_CONFIG = {
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
        light: '#f8f9fa',
        dark: '#212529'
    },
    timePeriods: {
        day: 1,
        week: 7,
        month: 30,
        quarter: 90,
        year: 365
    }
};

// Create API instance
let api;

// Initialize the dashboard when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create API instance
    api = new PaymentAPI();
    
    // Initialize dashboard
    initializeDashboard();
    
    // Set up refresh interval
    setInterval(fetchDashboardData, DASHBOARD_CONFIG.refreshInterval);
});

/**
 * Initialize the dashboard with data
 */
function initializeDashboard() {
    // Check if we're on the dashboard page
    if (document.getElementById('dashboard-container')) {
        fetchDashboardData();
    }
}

/**
 * Fetch dashboard data
 */
async function fetchDashboardData() {
    try {
        console.log('Fetching dashboard data...');
        showLoading(true);
        
        // Get dashboard data from API
        const [payments, payouts, addresses] = await Promise.all([
            api.getPayments({ limit: 100 }),
            api.getPayouts({ limit: 100 }),
            api.getAddresses()
        ]);
        
        // Process stats
        const stats = processStats(payments, payouts, addresses);
        
        // Process transaction history
        const transactionHistory = processTransactionHistory(payments, payouts);
        
        // Process currency distribution
        const distribution = processCurrencyDistribution(payments);
        
        // Get recent transactions
        const recentTransactions = processRecentTransactions(payments, payouts);
        
        // Combine all data into one object
        const dashboardData = {
            stats: stats,
            transactionHistory: transactionHistory,
            distribution: distribution,
            recentTransactions: recentTransactions
        };
        
        // Update the dashboard with the data
        updateDashboard(dashboardData);
        showLoading(false);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        showError('Failed to load dashboard data. ' + (error.message || 'Please try again later.'));
        showLoading(false);
        
    }
}

/**
 * Show loading indicator
 * @param {boolean} isLoading - Whether loading is in progress
 */
function showLoading(isLoading) {
    const loadingEl = document.getElementById('dashboard-loading');
    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    }
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
    const errorEl = document.getElementById('dashboard-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

/**
 * Process stats from payments, payouts, and addresses
 * @param {Array} payments - Payments data
 * @param {Array} payouts - Payouts data
 * @param {Array} addresses - Addresses data
 * @returns {Object} - Processed stats
 */
function processStats(payments, payouts, addresses) {
    // Calculate current volume
    const currentVolume = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + parseFloat(p.expectedAmount || 0), 0);
    
    // Calculate previous volume for trend
    const now = new Date();
    const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
    const twoMonthsAgo = new Date(now.setMonth(now.getMonth() - 1));
    
    const previousMonthPayments = payments.filter(p => {
        const date = new Date(p.createdAt);
        return date >= twoMonthsAgo && date < oneMonthAgo && p.status === 'completed';
    });
    
    const previousVolume = previousMonthPayments
        .reduce((sum, p) => sum + parseFloat(p.expectedAmount || 0), 0);
    
    // Calculate volume trend percentage
    const volumeTrend = previousVolume > 0 
        ? ((currentVolume - previousVolume) / previousVolume) * 100 
        : 0;
    
    // Calculate total transactions count
    const totalTransactions = payments.length;
    
    // Calculate transaction trend
    const previousMonthTransactionCount = previousMonthPayments.length;
    const transactionTrend = previousMonthTransactionCount > 0 
        ? ((totalTransactions - previousMonthTransactionCount) / previousMonthTransactionCount) * 100 
        : 0;
    
    // Calculate active addresses
    const activeAddresses = addresses.filter(a => a.status === 'active').length;
    
    // Calculate address trend
    const addressTrend = 0; // For demonstration, we're not calculating a real trend
    
    // Calculate total fees
    const totalFees = payments
        .filter(p => p.status === 'completed' && p.fee)
        .reduce((sum, p) => sum + parseFloat(p.fee || 0), 0);
    
    // Calculate fee trend
    const previousMonthFees = previousMonthPayments
        .reduce((sum, p) => sum + parseFloat(p.fee || 0), 0);
    
    const feeTrend = previousMonthFees > 0 
        ? ((totalFees - previousMonthFees) / previousMonthFees) * 100 
        : 0;
    
    return {
        total: {
            volume: currentVolume,
            transactions: totalTransactions,
            addresses: activeAddresses,
            fee: totalFees
        },
        trends: {
            volume: parseFloat(volumeTrend.toFixed(1)),
            transactions: parseFloat(transactionTrend.toFixed(1)),
            addresses: parseFloat(addressTrend.toFixed(1)),
            fee: parseFloat(feeTrend.toFixed(1))
        }
    };
}

/**
 * Process transaction history from payments and payouts
 * @param {Array} payments - Payments data
 * @param {Array} payouts - Payouts data
 * @returns {Array} - Processed transaction history
 */
function processTransactionHistory(payments, payouts) {
    // Get date range for the last 7 days
    const dates = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        dates.push({
            date: date.toISOString().split('T')[0],
            volume: 0,
            transactions: 0
        });
    }
    
    // Process payments
    payments.forEach(payment => {
        const paymentDate = new Date(payment.createdAt);
        paymentDate.setHours(0, 0, 0, 0);
        const dateStr = paymentDate.toISOString().split('T')[0];
        
        const dateItem = dates.find(d => d.date === dateStr);
        if (dateItem && payment.status === 'completed') {
            dateItem.volume += parseFloat(payment.expectedAmount || 0);
            dateItem.transactions += 1;
        }
    });
    
    return dates;
}

/**
 * Process currency distribution from payments
 * @param {Array} payments - Payments data
 * @returns {Array} - Processed currency distribution
 */
function processCurrencyDistribution(payments) {
    // Get completed payments
    const completedPayments = payments.filter(p => p.status === 'completed');
    
    // Group by currency
    const currencyGroups = {};
    completedPayments.forEach(payment => {
        const currency = payment.currency || 'Unknown';
        if (!currencyGroups[currency]) {
            currencyGroups[currency] = {
                currency: currency,
                volume: 0
            };
        }
        currencyGroups[currency].volume += parseFloat(payment.expectedAmount || 0);
    });
    
    // Convert to array and sort by volume
    let distribution = Object.values(currencyGroups).sort((a, b) => b.volume - a.volume);
    
    // Calculate total volume
    const totalVolume = distribution.reduce((sum, item) => sum + item.volume, 0);
    
    // Calculate percentage and limit to top 4 plus 'Other'
    if (distribution.length > 4) {
        // Take top 4
        const top4 = distribution.slice(0, 4);
        
        // Combine the rest as 'Other'
        const otherVolume = distribution.slice(4).reduce((sum, item) => sum + item.volume, 0);
        
        // Add 'Other' category
        top4.push({
            currency: 'Other',
            volume: otherVolume
        });
        
        distribution = top4;
    }
    
    // Calculate percentages
    distribution.forEach(item => {
        item.percentage = totalVolume > 0 ? parseFloat(((item.volume / totalVolume) * 100).toFixed(1)) : 0;
    });
    
    return distribution;
}

/**
 * Process recent transactions from payments and payouts
 * @param {Array} payments - Payments data
 * @param {Array} payouts - Payouts data
 * @returns {Array} - Processed recent transactions
 */
function processRecentTransactions(payments, payouts) {
    // Combine payments and payouts
    const allTransactions = [
        ...payments.map(p => ({
            id: p.id,
            type: 'payment',
            status: p.status,
            amount: parseFloat(p.expectedAmount || 0),
            currency: p.currency || 'USDT',
            fiatAmount: p.fiatAmount || p.expectedAmount,
            fiatCurrency: p.fiatCurrency || 'USD',
            date: p.createdAt,
            customer: p.metadata?.customer || 'Unknown'
        })),
        ...payouts.map(p => ({
            id: p.id,
            type: 'payout',
            status: p.status,
            amount: parseFloat(p.amount || 0),
            currency: p.currency || 'USDT',
            fiatAmount: p.fiatAmount || p.amount,
            fiatCurrency: p.fiatCurrency || 'USD',
            date: p.createdAt,
            customer: p.metadata?.recipient || 'Unknown'
        }))
    ];
    
    // Sort by date (newest first) and take top 5
    return allTransactions
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
}


/**
 * Update the dashboard with data
 * @param {Object} data - Dashboard data
 */
function updateDashboard(data) {
    // Check if we have the required elements
    if (!document.getElementById('dashboard-container')) {
        return;
    }
    
    // Update stats cards
    updateStatsCards(data.stats);
    
    // Initialize/update charts
    initializeVolumeChart(data.transactionHistory);
    initializeDistributionChart(data.distribution);
    
    // Update recent transactions
    updateRecentTransactions(data.recentTransactions);
    
    console.log('Dashboard updated successfully');
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
    volumeTrendEl.textContent = `${stats.trends.volume > 0 ? '+' : ''}${stats.trends.volume}%`;
    volumeTrendEl.className = `trend ${stats.trends.volume >= 0 ? 'positive' : 'negative'}`;
    
    // Update transactions
    document.getElementById('total-transactions').textContent = stats.total.transactions;
    const txTrendEl = document.getElementById('transactions-trend');
    txTrendEl.textContent = `${stats.trends.transactions > 0 ? '+' : ''}${stats.trends.transactions}%`;
    txTrendEl.className = `trend ${stats.trends.transactions >= 0 ? 'positive' : 'negative'}`;
    
    // Update addresses
    document.getElementById('total-addresses').textContent = stats.total.addresses;
    const addressTrendEl = document.getElementById('addresses-trend');
    addressTrendEl.textContent = `${stats.trends.addresses > 0 ? '+' : ''}${stats.trends.addresses}%`;
    addressTrendEl.className = `trend ${stats.trends.addresses >= 0 ? 'positive' : 'negative'}`;
    
    // Update fees
    document.getElementById('total-fees').textContent = formatCurrency(stats.total.fee);
    const feeTrendEl = document.getElementById('fees-trend');
    feeTrendEl.textContent = `${stats.trends.fee > 0 ? '+' : ''}${stats.trends.fee}%`;
    feeTrendEl.className = `trend ${stats.trends.fee >= 0 ? 'positive' : 'negative'}`;
}

/**
 * Initialize or update the volume chart
 * @param {Array} data - Transaction history data
 */
function initializeVolumeChart(data) {
    // Prepare data for chart based on view (day, week, month)
    const chartData = prepareVolumeChartData(data);
    
    // Check if chart instance exists
    if (window.volumeChart) {
        // Update existing chart
        window.volumeChart.updateOptions({
            xaxis: {
                categories: chartData.categories
            },
            series: chartData.series
        });
    } else {
        // Create new chart
        const options = {
            series: chartData.series,
            chart: {
                type: 'area',
                height: 250,
                toolbar: {
                    show: false
                },
                zoom: {
                    enabled: false
                }
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            colors: [DASHBOARD_CONFIG.chartColors.primary, DASHBOARD_CONFIG.chartColors.info],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.2,
                    stops: [0, 90, 100]
                }
            },
            xaxis: {
                categories: chartData.categories,
                labels: {
                    style: {
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                labels: {
                    formatter: function (value) {
                        return '$' + value.toFixed(0);
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function (value) {
                        return '$' + value.toFixed(2);
                    }
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right'
            }
        };

        if (document.getElementById('volume-chart')) {
            window.volumeChart = new ApexCharts(document.getElementById('volume-chart'), options);
            window.volumeChart.render();
        }
    }
    
    // Set up time period buttons
    setupTimePeriodButtons();
}

/**
 * Prepare data for volume chart
 * @param {Array} data - Transaction history data
 * @returns {Object} - Prepared chart data
 */
function prepareVolumeChartData(data) {
    let series = [];
    let categories = [];
    
    // Ensure transaction history exists
    if (data && data.length > 0) {
        // Extract dates for categories
        categories = data.map(item => {
            const date = new Date(item.date);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        });
        
        // Create series for volume
        const volumeData = data.map(item => item.volume);
        series.push({
            name: 'Volume',
            data: volumeData
        });
        
        // Create series for transactions count
        const transactionsData = data.map(item => item.transactions * 100); // Scale for visualization
        series.push({
            name: 'Transactions',
            data: transactionsData
        });
    } else {
        // Default empty data
        categories = ['No Data'];
        series = [
            {
                name: 'Volume',
                data: [0]
            },
            {
                name: 'Transactions',
                data: [0]
            }
        ];
    }
    
    return {
        categories,
        series
    };
}

/**
 * Setup time period buttons for the chart
 */
function setupTimePeriodButtons() {
    const buttons = document.querySelectorAll('.chart-period-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Update chart based on selected period
            // In a real implementation, this would fetch new data
            const period = this.dataset.period;
            console.log(`Changing chart period to: ${period}`);
            
            // For demo, we'll just simulate a data update
            fetchDashboardData();
        });
    });
}

/**
 * Initialize or update the distribution chart
 * @param {Array} data - Distribution data
 */
function initializeDistributionChart(data) {
    // Prepare data for chart
    const chartData = prepareDistributionChartData(data);
    
    // Check if chart instance exists
    if (window.distributionChart) {
        // Update existing chart
        window.distributionChart.updateOptions({
            labels: chartData.labels,
            series: chartData.series
        });
    } else {
        // Create new chart
        const options = {
            series: chartData.series,
            labels: chartData.labels,
            chart: {
                type: 'donut',
                height: 250
            },
            colors: [
                DASHBOARD_CONFIG.chartColors.primary,
                DASHBOARD_CONFIG.chartColors.success,
                DASHBOARD_CONFIG.chartColors.warning,
                DASHBOARD_CONFIG.chartColors.info,
                DASHBOARD_CONFIG.chartColors.danger
            ],
            dataLabels: {
                enabled: false
            },
            legend: {
                position: 'bottom',
                formatter: function(val, opts) {
                    return val + ' - ' + opts.w.globals.series[opts.seriesIndex].toFixed(1) + '%';
                }
            },
            tooltip: {
                y: {
                    formatter: function(value) {
                        return value.toFixed(1) + '%';
                    }
                }
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '70%',
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: 'Total',
                                formatter: function (w) {
                                    return formatCurrency(chartData.totalVolume);
                                }
                            }
                        }
                    }
                }
            }
        };

        if (document.getElementById('distribution-chart')) {
            window.distributionChart = new ApexCharts(document.getElementById('distribution-chart'), options);
            window.distributionChart.render();
        }
    }
}

/**
 * Prepare data for distribution chart
 * @param {Array} data - Distribution data
 * @returns {Object} - Prepared chart data
 */
function prepareDistributionChartData(data) {
    let series = [];
    let labels = [];
    let totalVolume = 0;
    
    // Ensure distribution data exists
    if (data && data.length > 0) {
        // Extract data for chart
        series = data.map(item => item.percentage);
        labels = data.map(item => item.currency);
        
        // Calculate total volume
        totalVolume = data.reduce((sum, item) => sum + item.volume, 0);
    } else {
        // Default empty data
        series = [100];
        labels = ['No Data'];
        totalVolume = 0;
    }
    
    return {
        series,
        labels,
        totalVolume
    };
}

/**
 * Update recent transactions section
 * @param {Array} transactions - Recent transactions data
 */
function updateRecentTransactions(transactions) {
    const tableBody = document.getElementById('recent-transactions');
    
    // Clear existing content
    tableBody.innerHTML = '';
    
    // Check if we have transactions
    if (!transactions || transactions.length === 0) {
        // Show empty state
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="5" class="text-center py-4">
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="bi bi-credit-card"></i>
                    </div>
                    <h5>No transactions found</h5>
                    <p class="text-muted">There are no recent transactions to display.</p>
                </div>
            </td>
        `;
        tableBody.appendChild(emptyRow);
    } else {
        // Add transactions to table
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            
            // Format date
            const date = new Date(tx.date);
            const formattedDate = date.toLocaleDateString('en-US', DASHBOARD_CONFIG.dateFormat);
            
            // Get status class
            const statusClass = getStatusClass(tx.status);
            
            // Set row HTML
            row.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <div class="transaction-icon ${tx.type === 'payment' ? 'received' : 'sent'}">
                            <i class="bi ${tx.type === 'payment' ? 'bi-arrow-down-left' : 'bi-arrow-up-right'}"></i>
                        </div>
                        <div>
                            <div class="fw-semibold">${tx.customer}</div>
                            <div class="small text-muted">${formattedDate}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge bg-${statusClass}">${tx.status}</span>
                </td>
                <td>
                    <div class="currency-amount">
                        <span class="crypto-amount">${tx.amount} ${tx.currency}</span>
                        <span class="fiat-amount text-muted">≈ ${formatCurrency(tx.fiatAmount)}</span>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="currency-icon currency-icon-${tx.currency.toLowerCase()} me-2"></div>
                        <span>${tx.currency}</span>
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-tx-btn" data-tx-id="${tx.id}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Set up transaction view buttons
        setupTransactionViewButtons();
    }
}

/**
 * Set up transaction view buttons
 */
function setupTransactionViewButtons() {
    const buttons = document.querySelectorAll('.view-tx-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const txId = this.dataset.txId;
            console.log(`View transaction: ${txId}`);
            
            // In a real implementation, this would open a modal or navigate to a transaction details page
            // For demo purposes, we'll just log the action
        });
    });
}

/**
 * Get status class for badge
 * @param {string} status - Transaction status
 * @returns {string} - Bootstrap color class
 */
function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'completed':
            return 'success';
        case 'pending':
            return 'warning';
        case 'failed':
            return 'danger';
        case 'processing':
            return 'info';
        default:
            return 'secondary';
    }
}

/**
 * Format currency value
 * @param {number|string} value - Currency value
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
    const num = parseFloat(value);
    
    if (isNaN(num)) {
        return '$0.00';
    }
    
    // Format with $ and commas
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format crypto amount
 * @param {number|string} amount - Crypto amount
 * @param {string} currency - Cryptocurrency code
 * @returns {string} - Formatted amount
 */
function formatCryptoAmount(amount, currency) {
    const num = parseFloat(amount);
    
    if (isNaN(num)) {
        return '0';
    }
    
    // Format based on currency
    switch (currency) {
        case 'BTC':
            return num.toFixed(8);
        case 'ETH':
            return num.toFixed(6);
        case 'USDT':
        case 'USDC':
            return num.toFixed(2);
        default:
            return num.toFixed(4);
    }
}
