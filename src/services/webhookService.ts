import { Repository } from 'typeorm';
import { Webhook, WebhookEvent, WebhookStatus } from '../db/entities/Webhook';
import { getRepository } from 'typeorm';
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { QueueService } from './queueService';
import { createHmac } from 'crypto';

// Basic circuit breaker implementation for HTTP requests
class HttpCircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();
  private readonly failureThreshold: number = 5;
  private readonly resetTimeout: number = 60 * 1000; // 1 minute

  public isOpen(url: string): boolean {
    const failures = this.failures.get(url) || 0;
    const lastFailure = this.lastFailureTime.get(url) || 0;
    
    // Circuit is open if:
    // 1. We've reached the failure threshold
    // 2. The last failure was recent enough
    if (failures >= this.failureThreshold) {
      const timeSinceLastFailure = Date.now() - lastFailure;
      if (timeSinceLastFailure < this.resetTimeout) {
        return true;
      }
      // Reset after timeout
      this.recordSuccess(url);
    }
    return false;
  }

  public recordFailure(url: string): void {
    const failures = this.failures.get(url) || 0;
    this.failures.set(url, failures + 1);
    this.lastFailureTime.set(url, Date.now());
  }

  public recordSuccess(url: string): void {
    this.failures.delete(url);
    this.lastFailureTime.delete(url);
  }
}

/**
 * Service for managing and sending webhook notifications to merchants
 */
export class WebhookService {
  private webhookRepository: Repository<Webhook>;
  private queueService: QueueService;
  private circuitBreaker: HttpCircuitBreaker;

  constructor(queueService: QueueService) {
    this.webhookRepository = getRepository(Webhook);
    this.queueService = queueService;
    this.circuitBreaker = new HttpCircuitBreaker();
  }

  /**
   * Send a webhook notification for a specific event (string version for type compatibility)
   * @param merchantId The merchant ID
   * @param event The webhook event as a string
   * @param payload The webhook payload
   * @param options Options for webhook processing
   * @returns The number of webhooks that were queued
   */
  async sendWebhookNotification(
    merchantId: string,
    event: string,
    payload: any,
    options?: { priority?: boolean, sync?: boolean }
  ): Promise<number>;

  /**
   * Send a webhook notification for a specific event (enum version)
   * @param event The webhook event
   * @param payload The webhook payload
   * @param options Options for webhook processing
   * @returns The number of webhooks that were queued
   */
  async sendWebhookNotification(
    event: WebhookEvent,
    payload: any,
    options?: { priority?: boolean, sync?: boolean }
  ): Promise<number>;

  // Implementation of both overloads
  async sendWebhookNotification(
    eventOrMerchantId: WebhookEvent | string,
    payloadOrEvent: any | string,
    optionsOrPayload?: { priority?: boolean, sync?: boolean } | any,
    maybeOptions?: { priority?: boolean, sync?: boolean }
  ): Promise<number> {
    // Determine which overload was called
    if (typeof eventOrMerchantId === 'string' && typeof payloadOrEvent === 'string') {
      // This is the merchantId + string event version
      const merchantId = eventOrMerchantId;
      const eventStr = payloadOrEvent;
      const payload = optionsOrPayload;
      const options = maybeOptions || {};

      // Convert string to enum
      const eventEnum = eventStr as unknown as WebhookEvent;
      
      try {
        // Find active webhooks subscribed to this event and merchant
        const webhooks = await this.webhookRepository.find({
          where: { 
            status: WebhookStatus.ACTIVE,
            merchantId: merchantId
          },
        });

        // Filter webhooks that are subscribed to this event
        const subscribedWebhooks = webhooks.filter((webhook) => 
          webhook.events.includes(eventEnum)
        );

        if (subscribedWebhooks.length === 0) {
          logger.debug(`No active webhooks found for event: ${eventEnum} and merchant: ${merchantId}`);
          return 0;
        }

        logger.info(`Sending ${subscribedWebhooks.length} webhook notifications for event: ${eventEnum}`);

        // Queue webhook deliveries
        for (const webhook of subscribedWebhooks) {
          if (options.sync) {
            // Process synchronously if requested
            await this.processWebhookDelivery(webhook.id, eventEnum, payload);
          } else {
            // Otherwise queue for async processing
            try {
              await this.queueService.addToQueue('webhook.send', {
                webhookId: webhook.id,
                event: eventEnum,
                payload,
                priority: options.priority || this.isHighPriorityEvent(eventEnum),
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              logger.error(`Failed to queue webhook ${webhook.id} for event ${eventEnum}:`, error);
              // If queueing fails, try to process directly
              this.processWebhookDelivery(webhook.id, eventEnum, payload)
                .catch(err => logger.error(`Failed to process webhook directly: ${err.message}`));
            }
          }
        }

        return subscribedWebhooks.length;
      } catch (error) {
        logger.error(`Error in sendWebhookNotification for event ${eventEnum}:`, error);
        throw error;
      }
    } else {
      // Original implementation for WebhookEvent
      const event = eventOrMerchantId as WebhookEvent;
      const payload = payloadOrEvent;
      const options = optionsOrPayload as { priority?: boolean, sync?: boolean } || {};

      try {
        // Find active webhooks subscribed to this event
        const webhooks = await this.webhookRepository.find({
          where: { status: WebhookStatus.ACTIVE },
        });

        // Filter webhooks that are subscribed to this event
        const subscribedWebhooks = webhooks.filter((webhook) => 
          webhook.events.includes(event)
        );

        if (subscribedWebhooks.length === 0) {
          logger.debug(`No active webhooks found for event: ${event}`);
          return 0;
        }

        logger.info(`Sending ${subscribedWebhooks.length} webhook notifications for event: ${event}`);

        // Queue webhook deliveries
        for (const webhook of subscribedWebhooks) {
          if (options.sync) {
            // Process synchronously if requested
            await this.processWebhookDelivery(webhook.id, event, payload);
          } else {
            // Otherwise queue for async processing
            try {
              await this.queueService.addToQueue('webhook.send', {
                webhookId: webhook.id,
                event,
                payload,
                priority: options.priority || this.isHighPriorityEvent(event),
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              logger.error(`Failed to queue webhook ${webhook.id} for event ${event}:`, error);
              // If queueing fails, try to process directly
              this.processWebhookDelivery(webhook.id, event, payload)
                .catch(err => logger.error(`Failed to process webhook directly: ${err.message}`));
            }
          }
        }

        return subscribedWebhooks.length;
      } catch (error) {
        logger.error(`Error in sendWebhookNotification for event ${event}:`, error);
        throw error;
      }
    }
  }

  /**
   * Determine if a webhook event should be considered high priority (string version)
   */
  private isHighPriorityEvent(event: string): boolean;

  /**
   * Determine if a webhook event should be considered high priority (enum version)
   */
  private isHighPriorityEvent(event: WebhookEvent): boolean;

  /**
   * Determine if a webhook event should be considered high priority
   * Implementation supporting both string and enum events
   */
  private isHighPriorityEvent(event: string | WebhookEvent): boolean {
    // Convert string to enum if needed
    const eventEnum = typeof event === 'string' ? event as unknown as WebhookEvent : event;
    
    // Critical events that should be retried more aggressively
    const criticalEvents = [
      WebhookEvent.PAYMENT_RECEIVED,
      WebhookEvent.PAYMENT_CONFIRMED,
      WebhookEvent.PAYMENT_COMPLETED,
      WebhookEvent.PAYOUT_COMPLETED,
      WebhookEvent.PAYOUT_FAILED,
      WebhookEvent.REFUND_COMPLETED,
      WebhookEvent.REFUND_FAILED,
      WebhookEvent.SETTLEMENT_COMPLETED
    ];
    
    return criticalEvents.includes(eventEnum);
  }

  /**
   * Process a webhook delivery with string event type
   * @param webhookId The webhook ID
   * @param event The webhook event as a string
   * @param payload The webhook payload
   */
  async processWebhookDelivery(webhookId: string, event: string, payload: any): Promise<void>;

  /**
   * Process a webhook delivery with enum event type
   * @param webhookId The webhook ID
   * @param event The webhook event
   * @param payload The webhook payload
   */
  async processWebhookDelivery(webhookId: string, event: WebhookEvent, payload: any): Promise<void>;

  // Implementation of both overloads
  async processWebhookDelivery(webhookId: string, event: string | WebhookEvent, payload: any): Promise<void> {
    // Convert string to enum if needed
    const eventEnum = typeof event === 'string' ? event as unknown as WebhookEvent : event;
    
    try {
      const webhook = await this.webhookRepository.findOne({ where: { id: webhookId } });
      
      if (!webhook) {
        logger.warn(`Webhook ${webhookId} not found for delivery`);
        return;
      }

      if (webhook.status !== WebhookStatus.ACTIVE) {
        logger.info(`Skipping delivery for inactive webhook ${webhookId}`);
        return;
      }

      // Check if circuit breaker is open for this URL
      if (this.circuitBreaker.isOpen(webhook.url)) {
        logger.warn(`Circuit breaker open for webhook URL ${webhook.url}, skipping delivery`);
        await this.updateWebhookStatus(
          webhook, 
          'failure', 
          'Circuit breaker open due to multiple failures',
          { circuitBreakerOpen: true }
        );
        
        // If this is a critical event, queue for retry later
        if (this.isHighPriorityEvent(eventEnum)) {
          await this.scheduleRetry(webhook, eventEnum, payload);
        }
        return;
      }

      // Process the payload
      const data = webhook.sendPayload ? payload : { id: payload.id, event: eventEnum };
      
      // Sign the payload if a secret is defined
      const signature = this.signPayload(JSON.stringify(data), webhook.secret);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventEnum.toString(),
      };

      const startTime = Date.now();
      let response;
      
      try {
        response = await axios.post(webhook.url, data, { 
          headers,
          timeout: 10000 // 10 second timeout
        });
        
        const responseTime = Date.now() - startTime;
        logger.info(`Webhook ${webhookId} delivered successfully in ${responseTime}ms with status ${response.status}`);
        
        // Record the success in the circuit breaker
        this.circuitBreaker.recordSuccess(webhook.url);
        
        // Update webhook status
        await this.updateWebhookStatus(webhook, 'success', null, {
          responseTime,
          statusCode: response.status
        });
      } catch (error: any) {
        // Handle error and determine if we should retry
        let retryNeeded = false;
        const statusCode = error.response?.status;
        const responseTime = Date.now() - startTime;
        
        let errorMessage = `Failed to deliver webhook ${webhookId}: ${error.message}`;
        if (statusCode) {
          errorMessage += ` (HTTP ${statusCode})`;
        }
        
        logger.error(errorMessage);
        
        // Record the failure in the circuit breaker
        this.circuitBreaker.recordFailure(webhook.url);
        
        // Determine if we should retry based on the error
        if (!statusCode || statusCode >= 500) {
          // Server errors should be retried
          retryNeeded = true;
        } else if (statusCode === 429) {
          // Rate limiting should be retried with backoff
          retryNeeded = true;
        } else if (statusCode >= 400 && statusCode < 500) {
          // Client errors generally should not be retried unless they're networking related
          retryNeeded = error.code === 'ECONNABORTED' || 
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNRESET';
        }
        
        // Update webhook status with error details
        await this.updateWebhookStatus(webhook, 'failure', errorMessage, {
          responseTime,
          statusCode,
          retryScheduled: retryNeeded,
          errorCode: error.code
        });
        
        // Schedule retry if needed
        if (retryNeeded && webhook.shouldRetry()) {
          await this.scheduleRetry(webhook, eventEnum, payload);
        }
      }
    } catch (error) {
      logger.error(`Unexpected error processing webhook ${webhookId}:`, error);
      // Don't throw to prevent queue processing failures
    }
  }

  /**
   * Schedule a webhook retry with string event
   */
  private async scheduleRetry(webhook: Webhook, event: string, payload: any): Promise<void>;

  /**
   * Schedule a webhook retry with enum event
   */
  private async scheduleRetry(webhook: Webhook, event: WebhookEvent, payload: any): Promise<void>;

  /**
   * Schedule a webhook retry
   * Implementation supporting both string and enum events
   */
  private async scheduleRetry(webhook: Webhook, event: string | WebhookEvent, payload: any): Promise<void> {
    // Convert string to enum if needed
    const eventEnum = typeof event === 'string' ? event as unknown as WebhookEvent : event;
    
    try {
      const nextRetry = webhook.getNextRetryTime();
      const delayMs = Math.max(0, nextRetry.getTime() - Date.now());
      
      logger.info(`Scheduling retry for webhook ${webhook.id} in ${Math.round(delayMs / 1000)}s`);
      
      // Calculate retry priority
      const isPriorityEvent = this.isHighPriorityEvent(eventEnum);
      
      // Try to schedule via queue with the calculated delay
      try {
        await this.queueService.addToQueue('webhook.send.retry', {
          webhookId: webhook.id,
          event: eventEnum,
          payload,
          priority: isPriorityEvent,
          attempt: webhook.failedAttempts,
          timestamp: new Date().toISOString(),
          delayMs: delayMs // Include delay as part of the message payload
        });
      } catch (queueError) {
        logger.error(`Failed to schedule webhook retry through queue:`, queueError);
        
        // If queue fails, schedule retry via setTimeout as fallback
        setTimeout(() => {
          this.processWebhookDelivery(webhook.id, eventEnum, payload)
            .catch(err => logger.error(`Error in direct webhook retry: ${err.message}`));
        }, delayMs);
      }
    } catch (error) {
      logger.error(`Error scheduling webhook retry:`, error);
    }
  }

  /**
   * Update webhook status after delivery attempt
   */
  private async updateWebhookStatus(
    webhook: Webhook, 
    status: 'success' | 'failure', 
    reason: string | null,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      if (status === 'success') {
        webhook.resetFailedAttempts();
      } else {
        webhook.incrementFailedAttempts(reason || 'Unknown error');
        
        // If the webhook has failed too many times, deactivate it
        if (webhook.failedAttempts >= webhook.maxRetries) {
          logger.warn(`Webhook ${webhook.id} deactivated after ${webhook.failedAttempts} failed attempts`);
          webhook.status = WebhookStatus.FAILED;
        }
      }
      
      // Store metadata about the last attempt
      if (webhook.lastFailureReason && metadata) {
        try {
          // Store additional metadata as JSON in the failure reason
          const existingData = JSON.parse(webhook.lastFailureReason);
          webhook.lastFailureReason = JSON.stringify({
            ...existingData,
            ...metadata,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          // If the existing reason isn't valid JSON, create new JSON
          webhook.lastFailureReason = JSON.stringify({
            message: webhook.lastFailureReason,
            ...metadata,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      await this.webhookRepository.save(webhook);
    } catch (error) {
      logger.error(`Error updating webhook status:`, error);
    }
  }

  /**
   * Sign the webhook payload with the webhook secret
   */
  private signPayload(payload: string, secret?: string): string {
    // Use webhook-specific secret if available, otherwise use global secret
    const signingSecret = secret || config.security.webhookSignatureSecret;
    return createHmac('sha256', signingSecret).update(payload).digest('hex');
  }
}