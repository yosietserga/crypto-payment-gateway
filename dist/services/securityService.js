"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const connection_1 = require("../db/connection");
const ApiKey_1 = require("../db/entities/ApiKey");
const Merchant_1 = require("../db/entities/Merchant");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
/**
 * Service for handling security-related functionality
 */
class SecurityService {
    /**
     * Generate a JWT token for a user
     * @param user The user to generate a token for
     */
    generateJwtToken(user) {
        try {
            const payload = {
                id: user.id,
                email: user.email,
                role: user.role
            };
            return jsonwebtoken_1.default.sign(payload, config_1.config.security.jwtSecret, {
                expiresIn: config_1.config.security.jwtExpiresIn
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error generating JWT token: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Verify a JWT token
     * @param token The token to verify
     */
    verifyJwtToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, config_1.config.security.jwtSecret);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error verifying JWT token: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Hash a password
     * @param password The password to hash
     */
    async hashPassword(password) {
        try {
            const salt = await bcrypt_1.default.genSalt(10);
            return bcrypt_1.default.hash(password, salt);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error hashing password: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Compare a password with a hash
     * @param password The password to compare
     * @param hash The hash to compare against
     */
    async comparePassword(password, hash) {
        try {
            return await bcrypt_1.default.compare(password, hash);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error comparing password: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Generate an API key for a merchant
     * @param merchantId The merchant ID
     */
    async generateApiKey(merchantId) {
        try {
            // Generate a random API key
            const apiKey = crypto_1.default.randomBytes(32).toString('hex');
            // Hash the API key for storage
            const hashedKey = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
            // Create a new API key record
            const connection = await (0, connection_1.getConnection)();
            const apiKeyRepository = connection.getRepository(ApiKey_1.ApiKey);
            const apiKeyRecord = new ApiKey_1.ApiKey();
            apiKeyRecord.merchantId = merchantId;
            apiKeyRecord.key = hashedKey;
            // Calculate expiration time based on days
            const expirationMs = config_1.config.security.apiKeys.expirationDays * 24 * 60 * 60 * 1000;
            apiKeyRecord.expiresAt = new Date(Date.now() + expirationMs);
            await apiKeyRepository.save(apiKeyRecord);
            // Return the unhashed API key to the client
            return apiKey;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error generating API key: ${errorMessage}`, { error, merchantId });
            throw error;
        }
    }
    /**
     * Validate an API key
     * @param apiKey The API key to validate
     */
    async validateApiKey(apiKey) {
        try {
            // Hash the provided API key
            const hashedKey = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
            // Look up the API key
            const connection = await (0, connection_1.getConnection)();
            const apiKeyRepository = connection.getRepository(ApiKey_1.ApiKey);
            const merchantRepository = connection.getRepository(Merchant_1.Merchant);
            const apiKeyRecord = await apiKeyRepository.findOne({
                where: { key: hashedKey, status: ApiKey_1.ApiKeyStatus.ACTIVE },
                relations: ['merchant']
            });
            if (!apiKeyRecord || apiKeyRecord.expiresAt < new Date()) {
                return null;
            }
            // Get the merchant
            const merchant = await merchantRepository.findOne({
                where: { id: apiKeyRecord.merchantId }
            });
            return merchant;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error validating API key: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Generate a signature for webhook payloads
     * @param payload The payload to sign
     */
    generateWebhookSignature(payload) {
        try {
            const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
            return crypto_1.default
                .createHmac('sha256', config_1.config.security.webhookSignatureSecret)
                .update(stringPayload)
                .digest('hex');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error generating webhook signature: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Verify a webhook signature
     * @param payload The payload that was signed
     * @param signature The signature to verify
     */
    verifyWebhookSignature(payload, signature) {
        try {
            const expectedSignature = this.generateWebhookSignature(payload);
            return crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signature, 'hex'));
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error verifying webhook signature: ${errorMessage}`, { error });
            return false;
        }
    }
    /**
     * Encrypt sensitive data
     * @param data The data to encrypt
     */
    encryptData(data) {
        try {
            // Generate a random IV
            const iv = crypto_1.default.randomBytes(16);
            // Create cipher
            const cipher = crypto_1.default.createCipheriv('aes-256-cbc', Buffer.from(config_1.config.security.encryptionKey, 'hex').slice(0, 32), iv);
            // Encrypt the data
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            // Return IV + encrypted data
            return iv.toString('hex') + ':' + encrypted;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error encrypting data: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Decrypt encrypted data
     * @param encryptedData The data to decrypt
     */
    decryptData(encryptedData) {
        try {
            // Split IV and encrypted data
            const parts = encryptedData.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted data format');
            }
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            // Create decipher
            const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', Buffer.from(config_1.config.security.encryptionKey, 'hex').slice(0, 32), iv);
            // Decrypt the data
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error decrypting data: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Generate a secure random password
     * @param length The length of the password
     */
    generateSecurePassword(length = 16) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
        let password = '';
        // Ensure at least one character from each category
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
        password += '0123456789'[Math.floor(Math.random() * 10)];
        password += '!@#$%^&*()_+~`|}{[]\\:;?><,./-='[Math.floor(Math.random() * 30)];
        // Fill the rest of the password
        for (let i = 4; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }
        // Shuffle the password
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    }
    /**
     * Validate password strength
     * @param password The password to validate
     */
    validatePasswordStrength(password) {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters long' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one special character' };
        }
        return { valid: true };
    }
    /**
     * Sanitize input to prevent XSS attacks
     * @param input The input to sanitize
     */
    sanitizeInput(input) {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
}
exports.SecurityService = SecurityService;
//# sourceMappingURL=securityService.js.map