"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const connection_1 = require("../../db/connection");
const Webhook_1 = require("../../db/entities/Webhook");
const errorHandler_1 = require("../../middleware/errorHandler");
const merchantAuthMiddleware_1 = require("../../middleware/merchantAuthMiddleware");
const webhookService_1 = require("../../services/webhookService");
const queueService_1 = require("../../services/queueService");
const AuditLog_1 = require("../../db/entities/AuditLog");
const logger_1 = require("../../utils/logger");
const router = (0, express_1.Router)();
// Initialize services
let webhookService;
let queueService;
// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getWebhookService = () => {
    if (!webhookService) {
        // Initialize QueueService if not already initialized
        if (!queueService) {
            queueService = new queueService_1.QueueService();
        }
        // Initialize WebhookService with QueueService
        webhookService = new webhookService_1.WebhookService(queueService);
    }
    return webhookService;
};
/**
 * @route POST /api/v1/webhooks
 * @desc Create a new webhook endpoint
 * @access Private (Merchant)
 */
router.post('/', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.body)('url').isURL().withMessage('Valid webhook URL is required'),
    (0, express_validator_1.body)('events')
        .isArray({ min: 1 })
        .withMessage('At least one event must be specified')
        .custom((events) => {
        return events.every((event) => Object.values(Webhook_1.WebhookEvent).includes(event));
    })
        .withMessage('Invalid webhook event'),
    (0, express_validator_1.body)('secret').optional().isString().isLength({ min: 16 }).withMessage('Secret must be at least 16 characters'),
    (0, express_validator_1.body)('maxRetries').optional().isInt({ min: 1, max: 10 }).toInt(),
    (0, express_validator_1.body)('sendPayload').optional().isBoolean().toBoolean()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    const { url, events, secret, maxRetries, sendPayload } = req.body;
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Check if webhook with same URL already exists for this merchant
        const existingWebhook = await webhookRepository.findOne({
            where: { url, merchantId }
        });
        if (existingWebhook) {
            return next(new errorHandler_1.ApiError(409, 'Webhook with this URL already exists', true));
        }
        // Create new webhook
        const webhook = new Webhook_1.Webhook();
        webhook.url = url;
        webhook.events = events;
        webhook.merchantId = merchantId;
        if (secret)
            webhook.secret = secret;
        if (maxRetries !== undefined)
            webhook.maxRetries = maxRetries;
        if (sendPayload !== undefined)
            webhook.sendPayload = sendPayload;
        // Save webhook
        const savedWebhook = await webhookRepository.save(webhook);
        // Create audit log
        const auditLog = AuditLog_1.AuditLog.create({
            action: AuditLog_1.AuditLogAction.WEBHOOK_CREATED,
            entityType: AuditLog_1.AuditLogEntityType.WEBHOOK,
            entityId: savedWebhook.id,
            description: `Webhook created for URL ${url}`,
            merchantId: merchantId
        });
        await auditLogRepository.save(auditLog);
        // Remove sensitive data from response
        const { secret: _, ...sanitizedWebhook } = savedWebhook;
        res.status(201).json({
            success: true,
            data: sanitizedWebhook
        });
    }
    catch (error) {
        logger_1.logger.error('Error creating webhook', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to create webhook', true));
    }
}));
/**
 * @route GET /api/v1/webhooks
 * @desc Get all webhooks for a merchant
 * @access Private (Merchant)
 */
router.get('/', merchantAuthMiddleware_1.merchantAuthMiddleware, (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        const webhooks = await webhookRepository.find({
            where: { merchantId },
            order: { createdAt: 'DESC' }
        });
        // Remove sensitive data
        const sanitizedWebhooks = webhooks.map(webhook => {
            const { secret, ...sanitized } = webhook;
            return sanitized;
        });
        res.status(200).json({
            success: true,
            data: sanitizedWebhooks
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching webhooks', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch webhooks', true));
    }
}));
/**
 * @route GET /api/v1/webhooks/:id
 * @desc Get a webhook by ID
 * @access Private (Merchant)
 */
router.get('/:id', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        const webhook = await webhookRepository.findOne({
            where: { id: webhookId, merchantId }
        });
        if (!webhook) {
            return next(new errorHandler_1.ApiError(404, 'Webhook not found', true));
        }
        // Remove sensitive data
        const { secret, ...sanitizedWebhook } = webhook;
        res.status(200).json({
            success: true,
            data: sanitizedWebhook
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching webhook', { error, webhookId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch webhook', true));
    }
}));
/**
 * @route PUT /api/v1/webhooks/:id
 * @desc Update a webhook
 * @access Private (Merchant)
 */
router.put('/:id', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('id').isUUID(),
    (0, express_validator_1.body)('url').optional().isURL().withMessage('Valid webhook URL is required'),
    (0, express_validator_1.body)('events')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one event must be specified')
        .custom((events) => {
        return events.every((event) => Object.values(Webhook_1.WebhookEvent).includes(event));
    })
        .withMessage('Invalid webhook event'),
    (0, express_validator_1.body)('secret').optional().isString().isLength({ min: 16 }).withMessage('Secret must be at least 16 characters'),
    (0, express_validator_1.body)('maxRetries').optional().isInt({ min: 1, max: 10 }).toInt(),
    (0, express_validator_1.body)('sendPayload').optional().isBoolean().toBoolean(),
    (0, express_validator_1.body)('status').optional().isIn(Object.values(Webhook_1.WebhookStatus))
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;
    const { url, events, secret, maxRetries, sendPayload, status } = req.body;
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Find webhook
        const webhook = await webhookRepository.findOne({
            where: { id: webhookId, merchantId }
        });
        if (!webhook) {
            return next(new errorHandler_1.ApiError(404, 'Webhook not found', true));
        }
        // Store previous state for audit log
        const previousState = {
            url: webhook.url,
            events: webhook.events,
            status: webhook.status,
            maxRetries: webhook.maxRetries,
            sendPayload: webhook.sendPayload
        };
        // Update webhook
        if (url)
            webhook.url = url;
        if (events)
            webhook.events = events;
        if (secret)
            webhook.secret = secret;
        if (maxRetries !== undefined)
            webhook.maxRetries = maxRetries;
        if (sendPayload !== undefined)
            webhook.sendPayload = sendPayload;
        if (status)
            webhook.status = status;
        // If status is being set to active, reset failed attempts
        if (status === Webhook_1.WebhookStatus.ACTIVE && webhook.failedAttempts > 0) {
            webhook.resetFailedAttempts();
        }
        // Save webhook
        const updatedWebhook = await webhookRepository.save(webhook);
        // Create audit log
        const auditLog = AuditLog_1.AuditLog.create({
            action: AuditLog_1.AuditLogAction.WEBHOOK_UPDATED,
            entityType: AuditLog_1.AuditLogEntityType.WEBHOOK,
            entityId: updatedWebhook.id,
            description: `Webhook updated for URL ${webhook.url}`,
            merchantId: merchantId,
            previousState,
            newState: {
                url: updatedWebhook.url,
                events: updatedWebhook.events,
                status: updatedWebhook.status,
                maxRetries: updatedWebhook.maxRetries,
                sendPayload: updatedWebhook.sendPayload
            }
        });
        await auditLogRepository.save(auditLog);
        // Remove sensitive data
        const { secret: _, ...sanitizedWebhook } = updatedWebhook;
        res.status(200).json({
            success: true,
            data: sanitizedWebhook
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating webhook', { error, webhookId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to update webhook', true));
    }
}));
/**
 * @route DELETE /api/v1/webhooks/:id
 * @desc Delete a webhook
 * @access Private (Merchant)
 */
router.delete('/:id', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Find webhook
        const webhook = await webhookRepository.findOne({
            where: { id: webhookId, merchantId }
        });
        if (!webhook) {
            return next(new errorHandler_1.ApiError(404, 'Webhook not found', true));
        }
        // Delete webhook
        await webhookRepository.remove(webhook);
        // Create audit log
        const auditLog = AuditLog_1.AuditLog.create({
            action: AuditLog_1.AuditLogAction.WEBHOOK_DELETED,
            entityType: AuditLog_1.AuditLogEntityType.WEBHOOK,
            entityId: webhookId,
            description: `Webhook deleted for URL ${webhook.url}`,
            merchantId: merchantId,
            previousState: {
                url: webhook.url,
                events: webhook.events,
                status: webhook.status
            }
        });
        await auditLogRepository.save(auditLog);
        res.status(200).json({
            success: true,
            message: 'Webhook deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error deleting webhook', { error, webhookId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to delete webhook', true));
    }
}));
/**
 * @route POST /api/v1/webhooks/:id/test
 * @desc Test a webhook by sending a test event
 * @access Private (Merchant)
 */
router.post('/:id/test', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;
    try {
        const connection = await (0, connection_1.getConnection)();
        const webhookRepository = connection.getRepository(Webhook_1.Webhook);
        // Find webhook
        const webhook = await webhookRepository.findOne({
            where: { id: webhookId, merchantId }
        });
        if (!webhook) {
            return next(new errorHandler_1.ApiError(404, 'Webhook not found', true));
        }
        // Check if webhook is active
        if (webhook.status !== Webhook_1.WebhookStatus.ACTIVE) {
            return next(new errorHandler_1.ApiError(400, 'Cannot test inactive webhook', true));
        }
        // Send test webhook
        const webhookService = getWebhookService();
        const testPayload = {
            id: 'test-' + Date.now(),
            test: true,
            timestamp: new Date().toISOString()
        };
        await webhookService.processWebhookDelivery({
            webhookId: webhook.id,
            url: webhook.url,
            payload: {
                ...testPayload,
                event: Webhook_1.WebhookEvent.PAYMENT_RECEIVED,
                merchantId
            },
            secret: webhook.secret || '',
            retryCount: 0,
            maxRetries: 0 // No retries for test webhooks
        });
        res.status(200).json({
            success: true,
            message: 'Test webhook sent successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error testing webhook', { error, webhookId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to test webhook', true));
    }
}));
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map