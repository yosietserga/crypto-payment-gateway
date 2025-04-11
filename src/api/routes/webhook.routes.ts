import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Webhook, WebhookEvent, WebhookStatus } from '../../db/entities/Webhook';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { merchantAuthMiddleware } from '../../middleware/merchantAuthMiddleware';
import { adminMiddleware } from '../../middleware/adminMiddleware';
import { authMiddleware } from '../../middleware/authMiddleware';
import { WebhookService } from '../../services/webhookService';
import { QueueService } from '../../services/queueService';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';

const router = Router();

// Initialize services
let webhookService: WebhookService;
let queueService: QueueService;

// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getWebhookService = () => {
  if (!webhookService) {
    // Initialize QueueService if not already initialized
    if (!queueService) {
      queueService = new QueueService();
    }
    // Initialize WebhookService with QueueService
    webhookService = new WebhookService(queueService);
  }
  return webhookService;
};

/**
 * @route POST /api/v1/webhooks
 * @desc Create a new webhook endpoint
 * @access Private (Merchant)
 */
router.post(
  '/',
  merchantAuthMiddleware,
  [
    body('url').isURL().withMessage('Valid webhook URL is required'),
    body('events')
      .isArray({ min: 1 })
      .withMessage('At least one event must be specified')
      .custom((events) => {
        return events.every((event: string) => Object.values(WebhookEvent).includes(event as WebhookEvent));
      })
      .withMessage('Invalid webhook event'),
    body('secret').optional().isString().isLength({ min: 16 }).withMessage('Secret must be at least 16 characters'),
    body('maxRetries').optional().isInt({ min: 1, max: 10 }).toInt(),
    body('sendPayload').optional().isBoolean().toBoolean()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }
    const { url, events, secret, maxRetries, sendPayload } = req.body;

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);
      const auditLogRepository = connection.getRepository(AuditLog);

      // Check if webhook with same URL already exists for this merchant
      const existingWebhook = await webhookRepository.findOne({
        where: { url, merchantId }
      });

      if (existingWebhook) {
        return next(new ApiError(409, 'Webhook with this URL already exists', true));
      }

      // Create new webhook
      const webhook = new Webhook();
      webhook.url = url;
      webhook.events = events;
      webhook.merchantId = merchantId;
      
      if (secret) webhook.secret = secret;
      if (maxRetries !== undefined) webhook.maxRetries = maxRetries;
      if (sendPayload !== undefined) webhook.sendPayload = sendPayload;

      // Save webhook
      const savedWebhook = await webhookRepository.save(webhook);

      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.WEBHOOK_CREATED,
        entityType: AuditLogEntityType.WEBHOOK,
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
    } catch (error) {
      logger.error('Error creating webhook', { error, merchantId });
      next(new ApiError(500, 'Failed to create webhook', true));
    }
  })
);

/**
 * @route GET /api/v1/webhooks
 * @desc Get all webhooks for a merchant
 * @access Private (Merchant)
 */
router.get(
  '/',
  merchantAuthMiddleware,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);

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
    } catch (error) {
      logger.error('Error fetching webhooks', { error, merchantId });
      next(new ApiError(500, 'Failed to fetch webhooks', true));
    }
  })
);

/**
 * @route GET /api/v1/webhooks/:id
 * @desc Get a webhook by ID
 * @access Private (Merchant)
 */
router.get(
  '/:id',
  merchantAuthMiddleware,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);

      const webhook = await webhookRepository.findOne({
        where: { id: webhookId, merchantId }
      });

      if (!webhook) {
        return next(new ApiError(404, 'Webhook not found', true));
      }

      // Remove sensitive data
      const { secret, ...sanitizedWebhook } = webhook;

      res.status(200).json({
        success: true,
        data: sanitizedWebhook
      });
    } catch (error) {
      logger.error('Error fetching webhook', { error, webhookId, merchantId });
      next(new ApiError(500, 'Failed to fetch webhook', true));
    }
  })
);

/**
 * @route PUT /api/v1/webhooks/:id
 * @desc Update a webhook
 * @access Private (Merchant)
 */
router.put(
  '/:id',
  merchantAuthMiddleware,
  [
    param('id').isUUID(),
    body('url').optional().isURL().withMessage('Valid webhook URL is required'),
    body('events')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one event must be specified')
      .custom((events) => {
        return events.every((event: string) => Object.values(WebhookEvent).includes(event as WebhookEvent));
      })
      .withMessage('Invalid webhook event'),
    body('secret').optional().isString().isLength({ min: 16 }).withMessage('Secret must be at least 16 characters'),
    body('maxRetries').optional().isInt({ min: 1, max: 10 }).toInt(),
    body('sendPayload').optional().isBoolean().toBoolean(),
    body('status').optional().isIn(Object.values(WebhookStatus))
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;
    const { url, events, secret, maxRetries, sendPayload, status } = req.body;

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);
      const auditLogRepository = connection.getRepository(AuditLog);

      // Find webhook
      const webhook = await webhookRepository.findOne({
        where: { id: webhookId, merchantId }
      });

      if (!webhook) {
        return next(new ApiError(404, 'Webhook not found', true));
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
      if (url) webhook.url = url;
      if (events) webhook.events = events;
      if (secret) webhook.secret = secret;
      if (maxRetries !== undefined) webhook.maxRetries = maxRetries;
      if (sendPayload !== undefined) webhook.sendPayload = sendPayload;
      if (status) webhook.status = status as WebhookStatus;

      // If status is being set to active, reset failed attempts
      if (status === WebhookStatus.ACTIVE && webhook.failedAttempts > 0) {
        webhook.resetFailedAttempts();
      }

      // Save webhook
      const updatedWebhook = await webhookRepository.save(webhook);

      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.WEBHOOK_UPDATED,
        entityType: AuditLogEntityType.WEBHOOK,
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
    } catch (error) {
      logger.error('Error updating webhook', { error, webhookId, merchantId });
      next(new ApiError(500, 'Failed to update webhook', true));
    }
  })
);

/**
 * @route DELETE /api/v1/webhooks/:id
 * @desc Delete a webhook
 * @access Private (Merchant)
 */
router.delete(
  '/:id',
  merchantAuthMiddleware,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);
      const auditLogRepository = connection.getRepository(AuditLog);

      // Find webhook
      const webhook = await webhookRepository.findOne({
        where: { id: webhookId, merchantId }
      });

      if (!webhook) {
        return next(new ApiError(404, 'Webhook not found', true));
      }

      // Delete webhook
      await webhookRepository.remove(webhook);

      // Create audit log
      const auditLog = AuditLog.create({
        action: AuditLogAction.WEBHOOK_DELETED,
        entityType: AuditLogEntityType.WEBHOOK,
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
    } catch (error) {
      logger.error('Error deleting webhook', { error, webhookId, merchantId });
      next(new ApiError(500, 'Failed to delete webhook', true));
    }
  })
);

/**
 * @route POST /api/v1/webhooks/:id/test
 * @desc Test a webhook by sending a test event
 * @access Private (Merchant)
 */
router.post(
  '/:id/test',
  merchantAuthMiddleware,
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return next(new ApiError(401, 'Merchant not authenticated', true));
    }
    const webhookId = req.params.id;

    try {
      const connection = await getConnection();
      const webhookRepository = connection.getRepository(Webhook);

      // Find webhook
      const webhook = await webhookRepository.findOne({
        where: { id: webhookId, merchantId }
      });

      if (!webhook) {
        return next(new ApiError(404, 'Webhook not found', true));
      }

      // Check if webhook is active
      if (webhook.status !== WebhookStatus.ACTIVE) {
        return next(new ApiError(400, 'Cannot test inactive webhook', true));
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
          event: WebhookEvent.PAYMENT_RECEIVED,
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
    } catch (error) {
      logger.error('Error testing webhook', { error, webhookId, merchantId });
      next(new ApiError(500, 'Failed to test webhook', true));
    }
  })
);

export default router;