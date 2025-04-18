# Crypto Payment Gateway - Web Payment Interface

A mobile-first, responsive web application for processing cryptocurrency payments on the Binance Smart Chain (BSC) network. This webapp integrates with the Crypto Payment Gateway backend to provide a seamless payment experience for customers.

## Features

- **Mobile-first responsive design** - Optimized for all device sizes
- **Real-time payment status updates** - Track payment confirmations as they happen
- **QR code generation** - Easy payments via mobile wallet scanning
- **Countdown timer** - Clear payment expiration indication
- **Multi-step payment flow** - Intuitive user journey through the payment process
- **Error handling** - Graceful handling of payment failures
- **Modular architecture** - Separation of concerns between UI and API logic

## Implementation Details

### File Structure

```
payment-webapp/
├── index.html          # Main payment interface
├── js/
│   ├── payment-api.js  # API integration and UI controller
│   └── main.js         # Application initialization
└── README.md          # Documentation
```

### Technologies Used

- **HTML5/CSS3** - Modern, semantic markup and styling
- **JavaScript (ES6+)** - For client-side functionality
- **Bootstrap 5** - Responsive UI framework
- **Bootstrap Icons** - Icon library
- **Fetch API** - For API communication

## Integration Guide for Merchants

### Basic Integration

To integrate the payment gateway into your website or application, redirect your customers to the payment page with the required parameters:

```
https://your-domain.com/payment-webapp/?reference=ORDER_ID&amount=AMOUNT&currency=USDT&key=YOUR_API_KEY&return_url=YOUR_RETURN_URL
```

### Required Parameters

- `reference` - Your unique order reference ID
- `amount` - Payment amount (e.g., "100.50")
- `key` - Your merchant API key

### Optional Parameters

- `currency` - Payment currency (default: "USDT")
- `return_url` - URL to redirect after payment completion

### Example Integration (HTML)

```html
<form action="https://your-domain.com/payment-webapp/" method="GET">
  <input type="hidden" name="reference" value="order_123">
  <input type="hidden" name="amount" value="100.50">
  <input type="hidden" name="currency" value="USDT">
  <input type="hidden" name="key" value="your_api_key">
  <input type="hidden" name="return_url" value="https://your-store.com/order-complete">
  <button type="submit">Pay with Crypto</button>
</form>
```

### Example Integration (JavaScript)

```javascript
function redirectToPayment(orderData) {
  const baseUrl = 'https://your-domain.com/payment-webapp/';
  const params = new URLSearchParams({
    reference: orderData.id,
    amount: orderData.total,
    currency: 'USDT',
    key: 'your_api_key',
    return_url: 'https://your-store.com/order-complete'
  });
  
  window.location.href = `${baseUrl}?${params.toString()}`;
}
```

## Webhook Integration

To receive real-time payment status updates, configure a webhook endpoint in your backend system. The Crypto Payment Gateway will send notifications to this endpoint when payment events occur.

### Webhook Events

- `payment.pending` - Payment has been initiated
- `payment.confirmed` - Payment has been confirmed on the blockchain
- `payment.failed` - Payment has failed

### Webhook Payload Example

```json
{
  "event": "payment.confirmed",
  "timestamp": "2023-12-30T15:30:45Z",
  "data": {
    "reference": "order_123",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "amount": "100.50",
    "currency": "USDT",
    "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "confirmations": 12
  }
}
```

## Customization

### Configuration Options

Edit the `js/main.js` file to customize the payment interface:

```javascript
const CONFIG = {
    // API configuration
    apiBaseUrl: 'http://your-api-url.com/api/v1',
    
    // Default payment settings
    defaultCurrency: 'USDT',
    defaultExpiryMinutes: 15,
    
    // UI configuration
    logoUrl: 'path/to/your/logo.png',
    supportEmail: 'support@your-company.com',
    supportUrl: 'https://your-company.com/support',
};
```

### Styling

The payment interface uses Bootstrap 5 with custom CSS variables. You can customize the look and feel by modifying the CSS variables in the `<style>` section of `index.html`:

```css
:root {
    --primary-color: #3498db;      /* Main brand color */
    --secondary-color: #2ecc71;     /* Success/confirmation color */
    --background-color: #f8f9fa;    /* Page background */
    --text-color: #2c3e50;          /* Main text color */
    --border-radius: 12px;          /* Border radius for cards */
    --box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* Shadow effect */
}
```

## Development Setup

1. Clone the repository
2. Configure your local development environment
3. Update the API base URL in `js/main.js` to point to your local API server
4. Open `index.html` in your browser or serve it using a local web server

## Production Deployment

1. Update the configuration in `js/main.js` with production values
2. Deploy the files to your web server or CDN
3. Ensure HTTPS is enabled for secure payment processing
4. Set up proper CORS headers on your API server to allow requests from the payment webapp domain

## Security Considerations

- Always use HTTPS for the payment interface
- Never expose your merchant API key in client-side code (use a backend proxy if needed)
- Implement proper CORS policies on your API server
- Validate all webhook signatures to prevent tampering

## Support

For support inquiries, please contact support@example.com or visit our support portal.

---

© 2023 Crypto Payment Gateway. All rights reserved.