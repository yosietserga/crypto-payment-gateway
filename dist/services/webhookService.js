"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const connection_1 = require("../db/connection");
const Webhook_1 = require("../db/entities/Webhook");
const logger_1 = require("../utils/logger");
/**
 * Service for managing and sending webhook notifications to merchants
 */
class WebhookService {
    constructor(queueService) {
        this.queueService = queueService;
    }
    /**
     * Send a webhook notification to all configured webhooks for a merchant
     * @param merchantId The merchant ID
     * @param event The webhook event type
     * @param payload The payload to send
     */
    async sendWebhookNotification(merchantId, event, payload) {
        try {
            // Get all active webhooks for this merchant and event
            const webhooks = await this.getActiveWebhooks(merchantId, event);
            if (webhooks.length === 0) {
                logger_1.logger.info(`No active webhooks found for merchant ${merchantId} and event ${event}`);
                return;
            }
            logger_1.logger.info(`Sending ${event} webhook to ${webhooks.length} endpoints for merchant ${merchantId}`);
            // Add standard fields to payload
            const enhancedPayload = {
                ...payload,
                event,
                merchantId,
                timestamp: new Date().toISOString()
            };
            // Queue webhook deliveries
            for (const webhook of webhooks) {
                await this.queueService.addToQueue('webhook.send', {
                    webhookId: webhook.id,
                    url: webhook.url,
                    payload: webhook.sendPayload ? enhancedPayload : { id: payload.id, event, merchantId },
                    secret: webhook.secret,
                    retryCount: 0,
                    maxRetries: webhook.maxRetries
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error';
            logger_1.logger.error(`Error sending webhook notification: ${errorMessage}`, { error, merchantId, event });
        }
    }
    /**
     * Get all active webhooks for a merchant and event
     * @param merchantId The merchant ID
     * @param event The webhook event type
     */
    async getActiveWebhooks(merchantId, event) {
        return await connection_1.DatabaseCircuitBreaker.executeQuery(async () => {
            const connection = await (0, connection_1.getConnection)();
            const webhookRepository = connection.getRepository(Webhook_1.Webhook);
            return webhookRepository.find({
                where: {
                    merchantId,
                    status: Webhook_1.WebhookStatus.ACTIVE,
                    events: event // PostgreSQL can query array contains
                }
            });
        });
    }
    /**
     * Process a webhook delivery from the queue
     * @param data The webhook delivery data
     */
    async processWebhookDelivery(data) {
        const { webhookId, url, payload, secret, retryCount, maxRetries } = data;
        try {
            logger_1.logger.info(`Processing webhook delivery to ${url}`, { webhookId, retryCount });
            // Sign the payload if a secret is provided
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Crypto-Payment-Gateway/1.0'
            };
            if (secret) {
                const signature = this.generateSignature(payload, secret);
                headers['X-Webhook-Signature'] = signature;
            }
            // Add idempotency key to prevent duplicate processing
            const idempotencyKey = crypto_1.default.randomBytes(16).toString('hex');
            headers['X-Idempotency-Key'] = idempotencyKey;
            // Send the webhook with a timeout
            const response = await (0, axios_1.default)({
                method: 'POST',
                url,
                headers,
                data: payload,
                timeout: 10000 // 10 second timeout
            });
            // Update webhook status on success
            await this.updateWebhookStatus(webhookId, true, null);
            logger_1.logger.info(`Webhook delivered successfully to ${url}`, {
                webhookId,
                statusCode: response.status
            });
            return true;
        }
        catch (error) {
            // Check if error is an Axios error with response property
            const axiosError = error;
            const errorMessage = axiosError.response
                ? `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
                : error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Webhook delivery failed: ${errorMessage}`, {
                webhookId,
                url,
                retryCount,
                error
            });
            // Update webhook status
            await this.updateWebhookStatus(webhookId, false, errorMessage);
            // Retry if we haven't exceeded max retries
            if (retryCount < maxRetries) {
                // Calculate backoff time with exponential backoff
                const baseRetryDelay = 15; // seconds
                const backoffTime = baseRetryDelay * Math.pow(2, retryCount);
                logger_1.logger.info(`Scheduling webhook retry in ${backoffTime} seconds`, {
                    webhookId,
                    retryCount: retryCount + 1
                });
                // Schedule retry with backoff
                setTimeout(async () => {
                    await this.queueService.addToQueue('webhook.send', {
                        ...data,
                        retryCount: retryCount + 1
                    });
                }, backoffTime * 1000);
            }
            else {
                logger_1.logger.warn(`Webhook delivery failed after ${maxRetries} attempts`, { webhookId, url });
            }
            return false;
        }
    }
    /**
     * Update webhook status after delivery attempt
     * @param webhookId The webhook ID
     * @param success Whether the delivery was successful
     * @param failureReason The reason for failure if unsuccessful
     */
    async updateWebhookStatus(webhookId, success, failureReason) {
        try {
            await connection_1.DatabaseCircuitBreaker.executeQuery(async () => {
                const connection = await (0, connection_1.getConnection)();
                const webhookRepository = connection.getRepository(Webhook_1.Webhook);
                const webhook = await webhookRepository.findOne({
                    where: { id: webhookId }
                });
                if (!webhook) {
                    logger_1.logger.warn(`Webhook not found: ${webhookId}`);
                    return;
                }
                if (success) {
                    webhook.resetFailedAttempts();
                }
                else {
                    webhook.incrementFailedAttempts(failureReason || '');
                }
                await webhookRepository.save(webhook);
            });
        }
        catch (error) {
            // Check if error is an Axios error with response property
            const axiosError = error;
            const errorMessage = error instanceof Error
                ? (axiosError.response
                    ? `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`
                    : error.message)
                : 'Unknown error';
            logger_1.logger.error(`Error updating webhook status: ${errorMessage}`, { error, webhookId });
        }
    }
    /**
     * Generate a signature for the webhook payload
     * @param payload The payload to sign
     * @param secret The secret to use for signing
     */
    generateSignature(payload, secret) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const payloadString = JSON.stringify(payload);
        const signatureContent = `${timestamp}.${payloadString}`;
        const signature = crypto_1.default
            .createHmac('sha256', secret)
            .update(signatureContent)
            .digest('hex');
        return `t=${timestamp},v1=${signature}`;
    }
    /**
     * Verify a webhook signature
     * @param payload The payload that was signed
     * @param signature The signature to verify
     * @param secret The secret used for signing
     */
    verifySignature(payload, signature, secret) {
        try {
            // Parse the signature components
            const [timestampPart, signaturePart] = signature.split(',');
            const timestamp = timestampPart.replace('t=', '');
            const providedSignature = signaturePart.replace('v1=', '');
            // Recreate the signature content
            const payloadString = JSON.stringify(payload);
            const signatureContent = `${timestamp}.${payloadString}`;
            // Generate the expected signature
            const expectedSignature = crypto_1.default
                .createHmac('sha256', secret)
                .update(signatureContent)
                .digest('hex');
            // Check if signatures match
            return crypto_1.default.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error verifying webhook signature: ${errorMessage}`, { error });
            return false;
        }
    }
}
exports.WebhookService = WebhookService;
//# sourceMappingURL=webhookService.js.map