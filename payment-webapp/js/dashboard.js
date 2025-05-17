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
        info: '#4cc9f0',
        light: '#f8f9fa',
        dark: '#212529'
    }
};

// Initialize the dashboard when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize charts
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
        
        // Instead of making real API calls that result in 404 errors,
        // we'll use mock data for demonstration
        
        // The API integration would normally look like this:
        // const response = await fetch(`${DASHBOARD_CONFIG.apiBaseUrl}/dashboard/stats`);
        // const data = await response.json();
        
        // Using mock data
        const mockStats = {
            total: {
                volume: 24850.75,
                transactions: 154,
                addresses: 87,
                fee: 124.25
            },
            trends: {
                volume: 12.5,  // percentage
                transactions: 8.3,
                addresses: -2.1,
                fee: 15.7
            }
        };
        
        const mockTransactionHistory = [
            { date: '2023-01-01', volume: 800, transactions: 5 },
            { date: '2023-01-02', volume: 1200, transactions: 7 },
            { date: '2023-01-03', volume: 950, transactions: 6 },
            { date: '2023-01-04', volume: 1500, transactions: 9 },
            { date: '2023-01-05', volume: 1800, transactions: 11 },
            { date: '2023-01-06', volume: 2200, transactions: 14 },
            { date: '2023-01-07', volume: 1950, transactions: 12 }
        ];
        
        const mockDistribution = [
            { currency: 'BTC', volume: 8500, percentage: 34.2 },
            { currency: 'ETH', volume: 6200, percentage: 24.9 },
            { currency: 'USDT', volume: 5400, percentage: 21.7 },
            { currency: 'USDC', volume: 3100, percentage: 12.5 },
            { currency: 'Other', volume: 1650, percentage: 6.7 }
        ];
        
        const mockRecentTransactions = [
            {
                id: 'tx123456789',
                type: 'payment',
                status: 'completed',
                amount: 0.035,
                currency: 'BTC',
                fiatAmount: 1250,
                fiatCurrency: 'USD',
                date: new Date().toISOString(),
                customer: 'John Doe'
            },
            {
                id: 'tx987654321',
                type: 'payout',
                status: 'pending',
                amount: 1.25,
                currency: 'ETH',
                fiatAmount: 2340,
                fiatCurrency: 'USD',
                date: new Date(Date.now() - 3600000).toISOString(),
                customer: 'Jane Smith'
            },
            {
                id: 'tx567891234',
                type: 'payment',
                status: 'completed',
                amount: 500,
                currency: 'USDT',
                fiatAmount: 500,
                fiatCurrency: 'USD',
                date: new Date(Date.now() - 7200000).toISOString(),
                customer: 'Robert Johnson'
            },
            {
                id: 'tx456789123',
                type: 'payment',
                status: 'failed',
                amount: 0.015,
                currency: 'BTC',
                fiatAmount: 540,
                fiatCurrency: 'USD',
                date: new Date(Date.now() - 10800000).toISOString(),
                customer: 'Sarah Williams'
            },
            {
                id: 'tx345678912',
                type: 'payout',
                status: 'completed',
                amount: 750,
                currency: 'USDC',
                fiatAmount: 750,
                fiatCurrency: 'USD',
                date: new Date(Date.now() - 14400000).toISOString(),
                customer: 'Michael Brown'
            }
        ];
        
        // Combine all mock data into one object
        const mockData = {
            stats: mockStats,
            transactionHistory: mockTransactionHistory,
            distribution: mockDistribution,
            recentTransactions: mockRecentTransactions
        };
        
        // Update the dashboard with the mock data
        updateDashboard(mockData);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
    }
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
