<?php
/**
 * Crypto Payment Gateway PHP Client Examples
 * 
 * This index page provides links to all available examples demonstrating
 * how to use the Crypto Payment Gateway PHP client library.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Payment Gateway - PHP Client Examples</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        h2 {
            color: #3498db;
            margin-top: 30px;
        }
        .container {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            background-color: #f9f9f9;
        }
        .example-list {
            list-style-type: none;
            padding: 0;
        }
        .example-list li {
            margin-bottom: 15px;
            padding: 15px;
            background-color: #fff;
            border-left: 4px solid #3498db;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .example-list a {
            color: #3498db;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
            display: block;
            margin-bottom: 5px;
        }
        .example-list a:hover {
            text-decoration: underline;
        }
        .example-list p {
            margin: 5px 0 0;
            color: #666;
        }
        .security-note {
            background-color: #fef9e7;
            border-left: 4px solid #f39c12;
            padding: 15px;
            margin-top: 30px;
        }
        .security-note h3 {
            color: #f39c12;
            margin-top: 0;
        }
        footer {
            margin-top: 40px;
            text-align: center;
            font-size: 14px;
            color: #7f8c8d;
            border-top: 1px solid #eee;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <h1>Crypto Payment Gateway - PHP Client Examples</h1>
    
    <div class="container">
        <p>Welcome to the example suite for the Crypto Payment Gateway PHP client library. These examples demonstrate how to integrate cryptocurrency payments into your PHP applications.</p>
        <p>Each example focuses on a specific aspect of the payment gateway functionality, from generating payment addresses to handling webhooks and managing transactions.</p>
    </div>
    
    <h2>Available Examples</h2>
    
    <ul class="example-list">
        <li>
            <a href="payment-example.php">Payment Processing</a>
            <p>Demonstrates how to generate payment addresses, check transaction status, and handle different payment scenarios.</p>
        </li>
        <li>
            <a href="webhook-example.php">Webhook Management</a>
            <p>Shows how to create, list, update, and delete webhook configurations, as well as verify webhook signatures.</p>
        </li>
        <li>
            <a href="transaction-example.php">Transaction Management</a>
            <p>Illustrates how to list, filter, and view transaction details, along with exchange rate information.</p>
        </li>
    </ul>
    
    <div class="security-note">
        <h3>Security Considerations</h3>
        <p>When implementing cryptocurrency payments in production, always follow these security best practices:</p>
        <ul>
            <li>Never hardcode API credentials in your code</li>
            <li>Use environment variables or a secure configuration system</li>
            <li>Always verify webhook signatures to prevent forgery</li>
            <li>Implement proper error handling and logging</li>
            <li>Validate all payment amounts and currencies</li>
            <li>Use HTTPS for all API communications</li>
        </ul>
    </div>
    
    <footer>
        <p>Crypto Payment Gateway PHP Client &copy; <?php echo date('Y'); ?></p>
    </footer>
</body>
</html>