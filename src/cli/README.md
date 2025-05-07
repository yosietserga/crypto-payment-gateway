# CLI Tools for Crypto Payment Gateway

This directory contains command-line interface (CLI) tools for managing the crypto payment gateway system.

## Generate Merchant

The `generate-merchant.ts` script allows you to create new merchant records in the database programmatically, without going through the web registration process.

## Generate API Key

The `generate-api-key.ts` script allows you to create new API keys for existing merchants in the database.

### Usage

```bash
npm run generate-api-key -- [options]
```

### Options

| Option | Alias | Description | Required | Default |
|--------|-------|-------------|----------|--------|
| --merchantId | -m | Merchant ID | Yes | - |
| --description | -d | API key description | No | Auto-generated timestamp |
| --expiresAt | -e | Expiration date (ISO format, e.g. 2023-12-31) | No | Never expires |
| --ipRestrictions | -i | Comma-separated list of allowed IPs | No | No restrictions |
| --readOnly | -r | Whether the API key is read-only (true/false) | No | false |
| --permissions | -p | JSON string of permissions | No | No specific permissions |

### Example

```bash
# Create a basic API key for a merchant
npm run generate-api-key -- -m "merchant-uuid-here"

# Create an API key with description and expiration
npm run generate-api-key -- -m "merchant-uuid-here" -d "Payment processing key" -e "2023-12-31"

# Create a read-only API key with IP restrictions
npm run generate-api-key -- -m "merchant-uuid-here" -r true -i "192.168.1.1,10.0.0.1"

# Create an API key with specific permissions
npm run generate-api-key -- -m "merchant-uuid-here" -p '{"payments":true,"reports":true,"settings":false}'

# Alternatively, you can use npx directly
npx ts-node src/cli/generate-api-key.ts --merchantId "merchant-uuid-here" --description "Payment processing key"
```

### Output

Upon successful execution, the script will output the created API key details, including the key ID, the API key, and the secret. **Note that the secret is displayed only once and should be stored securely.**

### Error Handling

The script performs validation on the input parameters and will exit with an error message if:

- The merchant ID does not exist in the database
- The expiration date format is invalid
- The permissions JSON format is invalid

### Audit Logging

All API key creation operations are logged in the audit log with the action type `CREATE` and entity type `API_KEY`.

## Generate Merchant

### Usage

```bash
npm run generate-merchant -- [options]
```

### Options

| Option | Alias | Description | Required | Default |
|--------|-------|-------------|----------|--------|
| --email | -e | Merchant email address | Yes | - |
| --password | -p | User password (min 8 characters) | Yes | - |
| --companyName | -c | Company/Business name | Yes | - |
| --contactName | -n | Contact person name | Yes | - |
| --phone | -ph | Contact phone number | No | - |
| --status | -s | Merchant status (active, pending, suspended) | No | pending |
| --role | -r | User role (admin, operator, viewer) | No | viewer |

### Example

```bash
# Create a new merchant with default status (pending) and role (viewer)
npm run generate-merchant -- -e merchant@example.com -p securepassword -c "Example Company" -n "John Doe" -ph "+1234567890"

# Create a merchant with active status and operator role
npm run generate-merchant -- -e merchant@example.com -p securepassword -c "Example Company" -n "John Doe" -ph "+1234567890" -s active -r operator

# Alternatively, you can use npx directly
npx ts-node src/cli/generate-merchant.ts --email merchant@example.com --password securepassword --companyName "Example Company" --contactName "John Doe" --phone "+1234567890" --status active --role operator
```

### Output

Upon successful execution, the script will output the created user and merchant details, including their IDs, email, role, business name, and status.

### Error Handling

The script performs validation on the input parameters and will exit with an error message if:

- The email format is invalid
- The password is less than 8 characters
- The company name or contact name is less than 2 characters
- The status or role is not one of the allowed values
- A user with the provided email already exists in the database

### Audit Logging

All merchant creation operations are logged in the audit log with the action type `CREATE` and entity type `USER`.