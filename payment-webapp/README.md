# Crypto Payment Gateway - Web Application

A responsive, modern web interface for managing cryptocurrency payments and payouts.

## Features

- **Receive Payments**: Generate payment addresses for customers to pay with USDT (BEP-20)
- **Send Payouts**: Create cryptocurrency payouts to customers
- **Real-time Status Updates**: Track payment and payout status in real-time
- **Mobile Responsive**: Works seamlessly on mobile, tablet, and desktop devices
- **Dark Mode Support**: Automatically adapts to user's system preferences

## Architecture

The web application consists of the following components:

- **HTML/CSS**: Modern, responsive UI with Bootstrap 5
- **JavaScript**: Client-side logic for payment processing and UI interactions
- **API Integration**: Connects to the payment gateway backend API

## File Structure

```
payment-webapp/
├── css/
│   ├── styles.css          # Main stylesheet
│   └── dashboard.css       # Dashboard-specific styles
├── images/
│   ├── logo.svg            # Application logo
│   └── favicon.png         # Favicon
├── js/
│   ├── app.js              # Main application logic
│   ├── payment-api.js      # API client for backend communication
│   ├── payment-ui.js       # UI interaction manager
│   ├── auth.js             # Authentication handling
│   ├── dashboard.js        # Dashboard functionality
│   └── main.js             # Initialization and utilities
├── index.html              # Main payment interface
├── dashboard.html          # Merchant dashboard
├── login.html              # Login page
└── register.html           # Registration page
```

## Getting Started

1. Clone the repository
2. Configure your API keys in `js/app.js`
3. Deploy to your web server or run locally
4. Open `index.html` in your browser

## Development Mode

The application includes a mock API mode which allows you to test without a backend connection. To use:

1. Keep the `apiBaseUrl` as `/api/v1` in the config
2. The application will automatically use mock data for demonstration

## Customization

- Modify CSS variables in `styles.css` to change colors and theme
- Update the logo and branding in the HTML files
- Adjust API endpoints in `payment-api.js` to match your backend

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Android Chrome)

## License

Copyright © 2023 Crypto Payment Gateway. All rights reserved.