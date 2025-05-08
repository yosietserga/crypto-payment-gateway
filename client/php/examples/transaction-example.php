<?php
/**
 * Transaction Management Example
 * 
 * This example demonstrates how to list, retrieve, and manage transactions
 * using the Crypto Payment Gateway PHP client.
 */

require_once '../CryptoPaymentClient.php'; // Adjust path as needed
require_once '../CryptoPaymentException.php'; // Include exception classes
// Or if using Composer: require_once 'vendor/autoload.php';

use CryptoPaymentGateway\CryptoPaymentClient;
use CryptoPaymentGateway\CryptoPaymentException;
use CryptoPaymentGateway\CryptoPaymentRateLimitException;
use CryptoPaymentGateway\CryptoPaymentValidationException;

// Load configuration (in a real application, use environment variables or a secure config system)
// SECURITY NOTE: Never hardcode API credentials in production code
$apiKey = getenv('CRYPTO_PAYMENT_API_KEY') ?: 'pk_941a83045834ad23c8e38587f2bbf90c';
$apiSecret = getenv('CRYPTO_PAYMENT_API_SECRET') ?: 'sk_1517e70a64bab54a0a9ea9f9376327dee76e8011f0b22e6d23d8e09e6b2485a6';
$apiBaseUrl = getenv('CRYPTO_PAYMENT_API_BASEURL') ?: 'https://eoscryptopago.com/api/v1';

// Initialize the client
try {
    $client = new CryptoPaymentClient($apiKey, $apiSecret, $apiBaseUrl);
    
    // Configure client settings
    $client->setTimeout(60)           // Set request timeout (in seconds)
           ->setVerifySsl(true)       // Enable/disable SSL verification
           ->setMaxRetries(3)         // Set maximum number of retries for rate-limited requests
           ->setRetryDelay(1000);     // Set base delay between retries in milliseconds
} catch (CryptoPaymentException $e) {
    die("Error initializing client: {$e->getMessage()}\n");
}

// Basic styling
echo "<style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; }
    h2 { color: #3498db; margin-top: 30px; }
    .container { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .warning { color: #f39c12; }
    .info { color: #3498db; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; }
    tr:hover { background-color: #f9f9f9; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type=text], input[type=date], select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button, .button { padding: 10px 15px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover, .button:hover { background: #2980b9; }
    .actions { margin-top: 20px; }
    .status-COMPLETED { color: #27ae60; font-weight: bold; }
    .status-PENDING { color: #f39c12; font-weight: bold; }
    .status-FAILED { color: #e74c3c; font-weight: bold; }
    .status-PROCESSING { color: #3498db; font-weight: bold; }
    .pagination { margin: 20px 0; text-align: center; }
    .pagination a { display: inline-block; padding: 8px 16px; text-decoration: none; color: #3498db; border: 1px solid #ddd; margin: 0 4px; }
    .pagination a.active { background-color: #3498db; color: white; border: 1px solid #3498db; }
    .pagination a:hover:not(.active) { background-color: #f1f1f1; }
</style>";

// Determine which example to run based on URL parameter
$action = isset($_GET['action']) ? $_GET['action'] : 'list';

echo "<h1>Transaction Management</h1>";
echo "<div class='actions'>";
echo "<a href='?action=list' class='button'>List Transactions</a> ";
echo "<a href='?action=dashboard' class='button'>Transaction Dashboard</a> ";
echo "<a href='?action=exchange' class='button'>Exchange Rates</a>";
echo "</div>";

switch ($action) {
    case 'list':
        listTransactions($client);
        break;
    case 'view':
        viewTransaction($client, $_GET['id'] ?? '');
        break;
    case 'dashboard':
        showDashboard($client);
        break;
    case 'exchange':
        showExchangeRates($client);
        break;
    default:
        listTransactions($client);
}

/**
 * List transactions with filtering and pagination
 * 
 * @param CryptoPaymentClient $client The API client
 */
function listTransactions($client) {
    try {
        echo "<h2>Transaction List</h2>";
        
        // Get filter parameters
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $status = isset($_GET['status']) ? $_GET['status'] : null;
        $startDate = isset($_GET['startDate']) ? $_GET['startDate'] : null;
        $endDate = isset($_GET['endDate']) ? $_GET['endDate'] : null;
        
        // Show filter form
        echo "<div class='container'>";
        echo "<h3>Filter Transactions</h3>";
        echo "<form method='get'>";
        echo "<input type='hidden' name='action' value='list'>";
        
        echo "<div class='form-group'>";
        echo "<label for='status'>Status:</label>";
        echo "<select id='status' name='status'>";
        echo "<option value=''>All Statuses</option>";
        echo "<option value='PENDING'" . ($status === 'PENDING' ? ' selected' : '') . ">Pending</option>";
        echo "<option value='PROCESSING'" . ($status === 'PROCESSING' ? ' selected' : '') . ">Processing</option>";
        echo "<option value='COMPLETED'" . ($status === 'COMPLETED' ? ' selected' : '') . ">Completed</option>";
        echo "<option value='FAILED'" . ($status === 'FAILED' ? ' selected' : '') . ">Failed</option>";
        echo "</select>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='startDate'>Start Date:</label>";
        echo "<input type='date' id='startDate' name='startDate' value='{$startDate}'>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='endDate'>End Date:</label>";
        echo "<input type='date' id='endDate' name='endDate' value='{$endDate}'>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='limit'>Items per page:</label>";
        echo "<select id='limit' name='limit'>";
        echo "<option value='10'" . ($limit === 10 ? ' selected' : '') . ">10</option>";
        echo "<option value='25'" . ($limit === 25 ? ' selected' : '') . ">25</option>";
        echo "<option value='50'" . ($limit === 50 ? ' selected' : '') . ">50</option>";
        echo "</select>";
        echo "</div>";
        
        echo "<button type='submit'>Apply Filters</button>";
        echo "</form>";
        echo "</div>";
        
        // Get transactions list
        $transactions = $client->getTransactions($page, $limit, $status, $startDate, $endDate);
        
        if (empty($transactions['data'])) {
            echo "<div class='container'>";
            echo "<p>No transactions found matching your criteria.</p>";
            echo "</div>";
            return;
        }
        
        // Display transactions
        echo "<div class='container'>";
        echo "<table>";
        echo "<tr>";
        echo "<th>ID</th>";
        echo "<th>Amount</th>";
        echo "<th>Currency</th>";
        echo "<th>Status</th>";
        echo "<th>Created At</th>";
        echo "<th>Actions</th>";
        echo "</tr>";
        
        foreach ($transactions['data'] as $transaction) {
            $statusClass = 'status-' . $transaction['status'];
            echo "<tr>";
            echo "<td>{$transaction['id']}</td>";
            echo "<td>{$transaction['amount']}</td>";
            echo "<td>{$transaction['currency']}</td>";
            echo "<td class='{$statusClass}'>{$transaction['status']}</td>";
            echo "<td>{$transaction['createdAt']}</td>";
            echo "<td><a href='?action=view&id={$transaction['id']}'>View Details</a></td>";
            echo "</tr>";
        }
        
        echo "</table>";
        
        // Pagination
        $totalPages = ceil($transactions['meta']['total'] / $limit);
        if ($totalPages > 1) {
            echo "<div class='pagination'>";
            
            // Previous page link
            if ($page > 1) {
                echo "<a href='?action=list&page=" . ($page - 1) . "&limit={$limit}&status={$status}&startDate={$startDate}&endDate={$endDate}'>&laquo; Previous</a>";
            }
            
            // Page links
            $startPage = max(1, $page - 2);
            $endPage = min($totalPages, $page + 2);
            
            for ($i = $startPage; $i <= $endPage; $i++) {
                $activeClass = ($i === $page) ? 'active' : '';
                echo "<a href='?action=list&page={$i}&limit={$limit}&status={$status}&startDate={$startDate}&endDate={$endDate}' class='{$activeClass}'>{$i}</a>";
            }
            
            // Next page link
            if ($page < $totalPages) {
                echo "<a href='?action=list&page=" . ($page + 1) . "&limit={$limit}&status={$status}&startDate={$startDate}&endDate={$endDate}'>Next &raquo;</a>";
            }
            
            echo "</div>";
        }
        
        echo "</div>";
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * View transaction details
 * 
 * @param CryptoPaymentClient $client        The API client
 * @param string              $transactionId Transaction ID
 */
function viewTransaction($client, $transactionId) {
    if (empty($transactionId)) {
        displayError("Missing parameter", "Transaction ID is required");
        return;
    }
    
    try {
        // Get transaction details
        $transaction = $client->getTransaction($transactionId);
        $data = $transaction['data'];
        
        echo "<h2>Transaction Details</h2>";
        echo "<div class='container'>";
        
        // Transaction status with appropriate styling
        $statusClass = 'status-' . $data['status'];
        echo "<div class='transaction-status'>";
        echo "<h3>Status: <span class='{$statusClass}'>{$data['status']}</span></h3>";
        echo "</div>";
        
        // Basic transaction information
        echo "<div class='transaction-info'>";
        echo "<h3>Transaction Information</h3>";
        echo "<table>";
        echo "<tr><th>Transaction ID</th><td>{$data['id']}</td></tr>";
        echo "<tr><th>Amount</th><td>{$data['amount']} {$data['currency']}</td></tr>";
        echo "<tr><th>Fee</th><td>{$data['fee']} {$data['currency']}</td></tr>";
        echo "<tr><th>Net Amount</th><td>{$data['netAmount']} {$data['currency']}</td></tr>";
        echo "<tr><th>Created At</th><td>{$data['createdAt']}</td></tr>";
        echo "<tr><th>Updated At</th><td>{$data['updatedAt']}</td></tr>";
        echo "</table>";
        echo "</div>";
        
        // Blockchain information
        if (isset($data['blockchain'])) {
            echo "<div class='blockchain-info'>";
            echo "<h3>Blockchain Information</h3>";
            echo "<table>";
            echo "<tr><th>Network</th><td>{$data['blockchain']['network']}</td></tr>";
            echo "<tr><th>Transaction Hash</th><td>{$data['blockchain']['txHash']}</td></tr>";
            echo "<tr><th>Confirmations</th><td>{$data['blockchain']['confirmations']}</td></tr>";
            echo "<tr><th>Block Number</th><td>{$data['blockchain']['blockNumber']}</td></tr>";
            echo "</table>";
            echo "</div>";
        }
        
        // Payment address information
        if (isset($data['address'])) {
            echo "<div class='address-info'>";
            echo "<h3>Payment Address Information</h3>";
            echo "<table>";
            echo "<tr><th>Address ID</th><td>{$data['address']['id']}</td></tr>";
            echo "<tr><th>Blockchain Address</th><td>{$data['address']['address']}</td></tr>";
            echo "<tr><th>Expected Amount</th><td>{$data['address']['expectedAmount']} {$data['address']['currency']}</td></tr>";
            
            // Show metadata if available
            if (!empty($data['address']['metadata'])) {
                echo "<tr><th>Metadata</th><td>";
                echo "<ul>";
                foreach ($data['address']['metadata'] as $key => $value) {
                    echo "<li><strong>{$key}:</strong> {$value}</li>";
                }
                echo "</ul>";
                echo "</td></tr>";
            }
            
            echo "</table>";
            echo "</div>";
        }
        
        // Refund information if available
        if (isset($data['refunds']) && !empty($data['refunds'])) {
            echo "<div class='refunds-info'>";
            echo "<h3>Refunds</h3>";
            echo "<table>";
            echo "<tr><th>Refund ID</th><th>Amount</th><th>Status</th><th>Created At</th></tr>";
            
            foreach ($data['refunds'] as $refund) {
                $refundStatusClass = 'status-' . $refund['status'];
                echo "<tr>";
                echo "<td>{$refund['id']}</td>";
                echo "<td>{$refund['amount']} {$refund['currency']}</td>";
                echo "<td class='{$refundStatusClass}'>{$refund['status']}</td>";
                echo "<td>{$refund['createdAt']}</td>";
                echo "</tr>";
            }
            
            echo "</table>";
            echo "</div>";
        }
        
        // Actions based on transaction status
        echo "<div class='transaction-actions'>";
        echo "<h3>Actions</h3>";
        
        if ($data['status'] === 'COMPLETED') {
            echo "<a href='?example=refund&transactionId={$data['id']}' class='button'>Process Refund</a>";
        }
        
        echo " <a href='?action=list' class='button'>Back to Transaction List</a>";
        echo "</div>";
        
        echo "</div>";
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Show merchant dashboard data
 * 
 * @param CryptoPaymentClient $client The API client
 */
function showDashboard($client) {
    try {
        // Get dashboard data
        $dashboard = $client->getDashboardData();
        $data = $dashboard['data'];
        
        echo "<h2>Transaction Dashboard</h2>";
        echo "<div class='container'>";
        
        // Transaction summary
        echo "<div class='dashboard-summary'>";
        echo "<h3>Transaction Summary</h3>";
        echo "<table>";
        echo "<tr>";
        echo "<th>Total Volume</th>";
        echo "<th>Completed Transactions</th>";
        echo "<th>Pending Transactions</th>";
        echo "<th>Failed Transactions</th>";
        echo "</tr>";
        echo "<tr>";
        echo "<td>{$data['totalVolume']} {$data['currency']}</td>";
        echo "<td>{$data['completedTransactions']}</td>";
        echo "<td>{$data['pendingTransactions']}</td>";
        echo "<td>{$data['failedTransactions']}</td>";
        echo "</tr>";
        echo "</table>";
        echo "</div>";
        
        // Recent transactions
        if (!empty($data['recentTransactions'])) {
            echo "<div class='recent-transactions'>";
            echo "<h3>Recent Transactions</h3>";
            echo "<table>";
            echo "<tr>";
            echo "<th>ID</th>";
            echo "<th>Amount</th>";
            echo "<th>Currency</th>";
            echo "<th>Status</th>";
            echo "<th>Created At</th>";
            echo "<th>Actions</th>";
            echo "</tr>";
            
            foreach ($data['recentTransactions'] as $transaction) {
                $statusClass = 'status-' . $transaction['status'];
                echo "<tr>";
                echo "<td>{$transaction['id']}</td>";
                echo "<td>{$transaction['amount']}</td>";
                echo "<td>{$transaction['currency']}</td>";
                echo "<td class='{$statusClass}'>{$transaction['status']}</td>";
                echo "<td>{$transaction['createdAt']}</td>";
                echo "<td><a href='?action=view&id={$transaction['id']}'>View Details</a></td>";
                echo "</tr>";
            }
            
            echo "</table>";
            echo "</div>";
        }
        
        // Volume by currency
        if (!empty($data['volumeByCurrency'])) {
            echo "<div class='volume-by-currency'>";
            echo "<h3>Volume by Currency</h3>";
            echo "<table>";
            echo "<tr>";
            echo "<th>Currency</th>";
            echo "<th>Volume</th>";
            echo "<th>Transactions</th>";
            echo "</tr>";
            
            foreach ($data['volumeByCurrency'] as $currency) {
                echo "<tr>";
                echo "<td>{$currency['currency']}</td>";
                echo "<td>{$currency['volume']}</td>";
                echo "<td>{$currency['transactions']}</td>";
                echo "</tr>";
            }
            
            echo "</table>";
            echo "</div>";
        }
        
        echo "</div>";
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Show current exchange rates
 * 
 * @param CryptoPaymentClient $client The API client
 */
function showExchangeRates($client) {
    try {
        // Get base currency from query parameter or default to USD
        $baseCurrency = isset($_GET['base']) ? $_GET['base'] : 'USD';
        
        // Get supported currencies
        $currencies = $client->getSupportedCurrencies();
        
        // Get exchange rates
        $rates = $client->getExchangeRates($baseCurrency);
        
        echo "<h2>Exchange Rates</h2>";
        echo "<div class='container'>";
        
        // Currency selector form
        echo "<div class='currency-selector'>";
        echo "<form method='get'>";
        echo "<input type='hidden' name='action' value='exchange'>";
        echo "<div class='form-group'>";
        echo "<label for='base'>Base Currency:</label>";
        echo "<select id='base' name='base' onchange='this.form.submit()'>";
        
        foreach ($currencies['data'] as $currency) {
            $selected = ($currency['code'] === $baseCurrency) ? 'selected' : '';
            echo "<option value='{$currency['code']}' {$selected}>{$currency['name']} ({$currency['code']})</option>";
        }
        
        echo "</select>";
        echo "</div>";
        echo "</form>";
        echo "</div>";
        
        // Exchange rates table
        echo "<div class='exchange-rates'>";
        echo "<h3>Current Rates (Base: {$baseCurrency})</h3>";
        echo "<table>";
        echo "<tr>";
        echo "<th>Currency</th>";
        echo "<th>Code</th>";
        echo "<th>Rate</th>";
        echo "</tr>";
        
        foreach ($rates['data']['rates'] as $code => $rate) {
            // Find currency name
            $currencyName = $code;
            foreach ($currencies['data'] as $currency) {
                if ($currency['code'] === $code) {
                    $currencyName = $currency['name'];
                    break;
                }
            }
            
            echo "<tr>";
            echo "<td>{$currencyName}</td>";
            echo "<td>{$code}</td>";
            echo "<td>{$rate}</td>";
            echo "</tr>";
        }
        
        echo "</table>";
        echo "</div>";
        
        // Last updated timestamp
        echo "<div class='rates-timestamp'>";
        echo "<p>Last updated: {$rates['data']['timestamp']}</p>";
        echo "</div>";
        
        echo "</div>";
        
        // Currency converter
        echo "<div class='container'>";
        echo "<h3>Currency Converter</h3>";
        echo "<div class='converter'>";
        echo "<form id='converter-form'>";
        echo "<div class='form-group'>";
        echo "<label for='amount'>Amount:</label>";
        echo "<input type='number' id='amount' step='0.01' min='0' value='1'>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='from-currency'>From Currency:</label>";
        echo "<select id='from-currency'>";
        foreach ($currencies['data'] as $currency) {
            $selected = ($currency['code'] === $baseCurrency) ? 'selected' : '';
            echo "<option value='{$currency['code']}' data-rate='1' {$selected}>{$currency['name']} ({$currency['code']})</option>";
        }
        echo "</select>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='to-currency'>To Currency:</label>";
        echo "<select id='to-currency'>";
        foreach ($currencies['data'] as $currency) {
            $rate = $rates['data']['rates'][$currency['code']] ?? 1;
            echo "<option value='{$currency['code']}' data-rate='{$rate}'>{$currency['name']} ({$currency['code']})</option>";
        }
        echo "</select>";
        echo "</div>";
        
        echo "<div class='form-group'>";
        echo "<label for='result'>Result:</label>";
        echo "<input type='text' id='result' readonly>";
        echo "</div>";
        
        echo "<button type='button' onclick='convertCurrency()'>Convert</button>";
        echo "</form>";
        echo "</div>";
        
        // JavaScript for currency conversion
        echo "<script>
            function convertCurrency() {
                const amount = parseFloat(document.getElementById('amount').value);
                const fromCurrency = document.getElementById('from-currency');
                const toCurrency = document.getElementById('to-currency');
                
                const fromRate = parseFloat(fromCurrency.options[fromCurrency.selectedIndex].dataset.rate);
                const toRate = parseFloat(toCurrency.options[toCurrency.selectedIndex].dataset.rate);
                
                if (isNaN(amount)) {
                    alert('Please enter a valid amount');
                    return;
                }
                
                // Convert to base currency first, then to target currency
                const result = (amount / fromRate) * toRate;
                
                document.getElementById('result').value = result.toFixed(8) + ' ' + toCurrency.value;
            }
        </script>";
        echo "</div>";
        
    } catch (CryptoPaymentRateLimitException $e) {
        displayError("Rate limit exceeded", $e->getMessage(), [
            "Try again in {$e->getSecondsUntilReset()} seconds"
        ]);
    } catch (CryptoPaymentException $e) {
        displayError("API error ({$e->getCode()})", $e->getMessage());
    } catch (Exception $e) {
        displayError("Unexpected error", $e->getMessage());
    }
}

/**
 * Display error message
 * 
 * @param string $title   Error title
 * @param string $message Error message
 * @param array  $details Additional error details
 */
function displayError($title, $message, array $details = []) {
    echo "<div class='container error'>";
    echo "<h3>{$title}</h3>";
    echo "<p>{$message}</p>";
    
    if (!empty($details)) {
        echo "<ul>";
        foreach ($details as $detail) {
            echo "<li>{$detail}</li>";
        }
        echo "</ul>";
    }
    
    echo "</div>";
}