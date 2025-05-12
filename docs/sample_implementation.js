/**
 * Sample Implementation for Crypto Payment Gateway API
 * 
 * This file demonstrates how to integrate with the Crypto Payment Gateway API
 * including the new payout endpoint and sandbox environment functionality.
 */

const crypto = require('crypto');
const axios = require('axios');

class CryptoPaymentGateway {
  constructor(apiKey, apiSecret, sandbox = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = sandbox 
      ? 'https://sandbox.eoscryptopago.com/api/v1'
      : 'https://eoscryptopago.com/api/v1';
  }

  /**
   * Generate HMAC signature for API authentication
   */
  generateSignature(timestamp, requestBody) {
    const message = timestamp + (requestBody ? JSON.stringify(requestBody) : '');
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
  }

  /**
   * Make an authenticated API request
   */
  async request(method, endpoint, data = null) {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, data);

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        data,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
          'X-TIMESTAMP': timestamp,
          'X-SIGNATURE': signature
        }
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        throw new Error(`Network Error: ${error.message}`);
      }
    }
  }

  /**
   * Create a new payment address
   */
  async createPaymentAddress(params) {
    return this.request('POST', '/payment-addresses', params);
  }

  /**
   * Get payment address details
   */
  async getPaymentAddress(addressId) {
    return this.request('GET', `/payment-addresses/${addressId}`);
  }

  /**
   * List transactions with optional filters
   */
  async listTransactions(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return this.request('GET', `/transactions${queryParams ? `?${queryParams}` : ''}`);
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId) {
    return this.request('GET', `/transactions/${transactionId}`);
  }

  /**
   * Create a new payout
   */
  async createPayout(params) {
    return this.request('POST', '/payouts', params);
  }

  /**
   * Get payout status
   */
  async getPayout(payoutId) {
    return this.request('GET', `/payouts/${payoutId}`);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(webhookBody, receivedSignature) {
    const expectedSignature = crypto.createHmac('sha256', this.apiSecret)
      .update(JSON.stringify(webhookBody))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  }
}

// Example usage
async function example() {
  // Initialize the client (use sandbox for testing)
  const client = new CryptoPaymentGateway(
    'your_api_key',
    'your_api_secret',
    true // Set to true for sandbox mode
  );

  try {
    // Create a payment address
    const paymentAddress = await client.createPaymentAddress({
      currency: 'USDT',
      expectedAmount: '100.00',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      callbackUrl: 'https://your-website.com/payment-callback',
      metadata: {
        orderId: 'ORD-12345',
        customerEmail: 'customer@example.com'
      }
    });
    console.log('Payment Address Created:', paymentAddress);

    // Check payment address status
    const addressStatus = await client.getPaymentAddress(paymentAddress.data.id);
    console.log('Payment Address Status:', addressStatus);

    // Create a payout
    const payout = await client.createPayout({
      amount: '50.00',
      currency: 'USDT',
      network: 'BSC',
      recipientAddress: '0x0987654321fedcba0987654321fedcba09876543',
      webhookUrl: 'https://your-website.com/payout-webhook',
      metadata: {
        withdrawalId: 'WD-67890',
        userId: 'user_12345'
      }
    });
    console.log('Payout Created:', payout);

    // Check payout status
    const payoutStatus = await client.getPayout(payout.data.id);
    console.log('Payout Status:', payoutStatus);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example webhook handler (Express.js)
function webhookHandler(req, res) {
  const client = new CryptoPaymentGateway('your_api_key', 'your_api_secret');
  const signature = req.headers['x-webhook-signature'];
  
  // Verify the webhook signature
  if (!signature || !client.verifyWebhook(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process the webhook based on event type
  const { event, data } = req.body;
  
  switch (event) {
    case 'PAYMENT_RECEIVED':
      console.log(`Payment received: ${data.amount} ${data.currency}`);
      // Update order status in your system
      break;
    
    case 'PAYMENT_CONFIRMED':
      console.log(`Payment confirmed: ${data.amount} ${data.currency}`);
      // Fulfill the order
      break;
    
    case 'PAYOUT_COMPLETED':
      console.log(`Payout completed: ${data.amount} ${data.currency}`);
      // Update withdrawal status in your system
      break;
    
    case 'PAYOUT_FAILED':
      console.log(`Payout failed: ${data.amount} ${data.currency}`);
      // Handle failed payout
      break;
    
    default:
      console.log(`Received webhook event: ${event}`);
  }
  
  // Acknowledge receipt of the webhook
  res.status(200).json({ received: true });
}

// Uncomment to run the example
// example();

module.exports = { CryptoPaymentGateway, webhookHandler };