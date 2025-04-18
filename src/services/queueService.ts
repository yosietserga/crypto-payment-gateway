import amqp from 'amqplib';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getConnection } from '../db/connection';
import { Transaction, TransactionStatus } from '../db/entities/Transaction';
import { WebhookService } from './webhookService';
import { WebhookEvent } from '../db/entities/Webhook';

/**
 * Service for managing message queues using RabbitMQ
 * Includes robust fallback mechanism when RabbitMQ is unavailable
 */
export class QueueService {
  private static instance: QueueService | null = null;
  private connection: any = null;
  private channel: any = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = config.queue.retryAttempts || 10;
  private readonly reconnectInterval: number = config.queue.retryDelay || 5000; // 5 seconds
  private readonly reconnectBackoff: boolean = config.queue.useBackoff || true;
  private inFallbackMode: boolean = false;
  private fallbackCallbacks: Map<string, ((data: any) => Promise<void>)[]> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Get the singleton instance of QueueService
   * @returns Singleton instance of QueueService
   */
  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Initialize the queue connection
   */
  async initialize(): Promise<void> {
    try {
      // Initialize RabbitMQ connection and channels
      await this.connect();
      
      // Set up health check interval to periodically verify connection
      if (config.queue.healthCheckInterval) {
        this.setupHealthCheck();
      }
      
      // Set up Binance payout consumer
      try {
        await this.setupBinancePayoutConsumer();
      } catch (error) {
        logger.warn('Failed to set up Binance payout consumer, will use direct processing for payouts', { error });
        // Don't fail the whole initialization if just the payout consumer fails
      }

      // Set up Webhook consumer
      try {
        await this.setupWebhookConsumer();
      } catch (error) {
        logger.warn('Failed to set up Webhook consumer, will use direct processing for webhooks', { error });
        // Don't fail the whole initialization if just the webhook consumer fails
      }
      
      logger.info('Queue service initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize queue service: ${errorMessage}`, { error });
      
      // Enter fallback mode instead of throwing error
      this.enterFallbackMode();
      
      // Schedule reconnection attempts in the background
      this.scheduleReconnect();
    }
  }
  
  /**
   * Set up periodic health check to verify RabbitMQ connection
   */
  private setupHealthCheck(): void {
    // Clear any existing health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Set up new health check interval
    this.healthCheckInterval = setInterval(async () => {
      if (this.inFallbackMode && !this.connected) {
        // Try to reconnect if in fallback mode
        try {
          await this.connect();
          if (this.connected) {
            this.exitFallbackMode();
          }
        } catch (error) {
          // Silently fail - reconnection is handled elsewhere
        }
      } else if (this.connected) {
        // Verify connection is still healthy
        try {
          // Simple check - try to assert a queue
          if (this.channel) {
            await this.channel.checkQueue('health.check');
          } else {
            throw new Error('Channel not available');
          }
        } catch (error) {
          logger.warn('Health check failed, connection appears to be unhealthy');
          this.connected = false;
          this.enterFallbackMode();
          this.scheduleReconnect();
        }
      }
    }, config.queue.healthCheckInterval || 30000); // Default 30 seconds
  }

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
    try {
      // Connect to RabbitMQ
      this.connection = await amqp.connect(config.queue.url);
      
      // Create a channel
      this.channel = await this.connection.createChannel();
      
      // Set up error handlers
      this.connection.on('error', (err: Error) => {
        logger.error(`RabbitMQ connection error: ${err.message}`, { error: err });
        this.connected = false;
        this.enterFallbackMode();
        this.scheduleReconnect();
      });
      
      this.connection.on('close', () => {
        if (this.connected) {
          logger.warn('RabbitMQ connection closed unexpectedly');
          this.connected = false;
          this.enterFallbackMode();
          this.scheduleReconnect();
        }
      });
      
      // Declare queues
      await this.declareQueues();
      
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('Connected to RabbitMQ successfully');
    } catch (error: unknown) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to connect to RabbitMQ: ${errorMessage}`, { error });
      throw error;
    }
  }

  /**
   * Schedule reconnection to RabbitMQ with exponential backoff
   */
  private scheduleReconnect(): void {
    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Stop if max attempts reached
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect to RabbitMQ after ${this.maxReconnectAttempts} attempts`);
      logger.warn('Queue service will remain in fallback mode until application restart or manual intervention');
      return;
    }
    
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff if enabled
    let delay = this.reconnectInterval;
    if (this.reconnectBackoff) {
      delay = Math.min(
        this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
        300000 // Max 5 minutes
      );
    }
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      logger.info(`Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts})`);
      try {
        await this.connect();
        if (this.connected) {
          this.exitFallbackMode();
        }
      } catch (error) {
        // Schedule next reconnection attempt
        this.scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * Enter fallback mode for queue processing
   */
  private enterFallbackMode(): void {
    if (!this.inFallbackMode) {
      this.inFallbackMode = true;
      logger.warn('Queue service entering fallback mode - application will continue with direct message processing');
    }
  }
  
  /**
   * Exit fallback mode and resume normal queue operations
   */
  private exitFallbackMode(): void {
    if (this.inFallbackMode) {
      this.inFallbackMode = false;
      logger.info('Queue service exiting fallback mode - resuming normal queue operations');
    }
  }

  /**
   * Declare all required queues
   */
  /**
   * Get configuration for a queue
   * @param queue The queue name
   * @returns Queue configuration
   */
  private getQueueConfig(queue: string): any {
    // Define queue configurations to ensure consistency
    const queueConfigs: {[key: string]: any} = {
      'transaction.monitor': {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'transaction.monitor.retry'
        }
      },
      'webhook.send': {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'webhook.send.retry'
        }
      },
      'transaction.monitor.retry': {
        durable: true,
        arguments: { 'x-message-ttl': 60000 } // 1 minute delay
      },
      'webhook.send.retry': {
        durable: true,
        arguments: { 'x-message-ttl': 60000 } // 1 minute delay
      },
      'binance.payout': {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx',
          'x-dead-letter-routing-key': 'binance.payout.retry'
        }
      },
      'binance.payout.retry': {
        durable: true,
        arguments: { 'x-message-ttl': 60000 } // 1 minute delay
      }
    };
    
    // Return the config for the specified queue or a default config
    return queueConfigs[queue] || { durable: true };
  }
  
  private async declareQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    // Declare queues with dead letter exchange for retries
    try {
      await this.channel.assertExchange('dlx', 'direct', { durable: true });
    } catch (error) {
      logger.warn('Failed to declare dead letter exchange, some retry functionality may be limited', { error });
      // Continue anyway - this is not fatal
    }

    // Array of queues to declare
    const queues = [
      'transaction.monitor',
      'webhook.send',
      'binance.payout',
      'transaction.monitor.retry',
      'webhook.send.retry',
      'binance.payout.retry'
    ];
    
    // Declare each queue, handling errors individually
    for (const queue of queues) {
      try {
        // Check if queue exists first
        await this.channel.checkQueue(queue);
        logger.info(`Queue ${queue} already exists, skipping declaration`);
      } catch (error) {
        // Queue doesn't exist, try to declare it
        try {
          await this.channel.assertQueue(queue, this.getQueueConfig(queue));
          logger.info(`Queue ${queue} declared successfully`);
        } catch (declareError) {
          logger.error(`Failed to declare queue ${queue}`, { error: declareError });
          // Continue with other queues, don't let one failure stop the process
        }
      }
    }
    
    // Bind retry queues to dead letter exchange - continue if one fails
    const retryBindings = [
      { queue: 'transaction.monitor.retry', key: 'transaction.monitor.retry' },
      { queue: 'webhook.send.retry', key: 'webhook.send.retry' },
      { queue: 'binance.payout.retry', key: 'binance.payout.retry' }
    ];
    
    for (const binding of retryBindings) {
      try {
        await this.channel.bindQueue(binding.queue, 'dlx', binding.key);
      } catch (error) {
        logger.warn(`Failed to bind queue ${binding.queue} to dead letter exchange`, { error });
        // Continue with other bindings
      }
    }
    
    // Set up consumers for retry queues to requeue messages
    const retryConsumers = [
      {
        source: 'transaction.monitor.retry',
        target: 'transaction.monitor'
      },
      {
        source: 'webhook.send.retry',
        target: 'webhook.send'
      },
      {
        source: 'binance.payout.retry',
        target: 'binance.payout'
      }
    ];
    
    for (const consumer of retryConsumers) {
      try {
        await this.channel.consume(consumer.source, (msg: amqp.ConsumeMessage | null) => {
          if (msg) {
            try {
              this.channel!.sendToQueue(consumer.target, msg.content, {
                headers: msg.properties.headers
              });
              this.channel!.ack(msg);
            } catch (error) {
              logger.error(`Error processing retry message from ${consumer.source} to ${consumer.target}`, { error });
              this.channel!.nack(msg);
            }
          }
        });
      } catch (error) {
        logger.warn(`Failed to set up retry consumer for ${consumer.source}`, { error });
        // Continue with other consumers
      }
    }
  }

  /**
   * Add a message to a queue
   * @param queue The queue name
   * @param data The message data
   * @param options Optional configuration for message handling
   */
  async addToQueue(queue: string, data: any, options: { priority?: number, expiration?: number } = {}): Promise<boolean> {
    // If in fallback mode, process the message directly
    if (this.inFallbackMode) {
      logger.debug(`Queue in fallback mode, processing message directly for ${queue}`, { queue, data });
      
      // Process the message directly using registered callbacks
      await this.processDirectly(queue, data);
      return true; // Return true to prevent errors in calling code
    }
    
    try {
      if (!this.connected || !this.channel) {
        await this.connect();
      }
      
      // Ensure the queue exists without modifying its properties
      try {
        await this.channel.checkQueue(queue);
      } catch (error) {
        // Only create the queue if it doesn't exist
        // Use predefined config if available, otherwise use default config
        const queueConfig = this.getQueueConfig(queue);
        await this.channel.assertQueue(queue, queueConfig);
      }
      
      // Add message to queue with options
      const messageOptions = {
        persistent: true,
        ...options
      };
      
      const success = this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), messageOptions);
      
      logger.debug(`Added message to queue ${queue}`, { queue, data });
      return success;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error adding message to queue ${queue}: ${errorMessage}`, { error, queue, data });
      
      // Enter fallback mode if we encounter an error
      this.enterFallbackMode();
      
      // Schedule reconnection attempts
      this.scheduleReconnect();
      
      // Try to process the message directly since we're now in fallback mode
      await this.processDirectly(queue, data);
      
      return true; // Return true to prevent errors in calling code
    }
  }
  
  /**
   * Publish a message to a queue with retry capability
   * @param queue The queue name
   * @param data The message data
   * @param retryOptions Options for retry behavior
   */
  async publishToQueue(queue: string, data: any, retryOptions: { maxRetries?: number, retryDelay?: number } = {}): Promise<boolean> {
    const maxRetries = retryOptions.maxRetries ?? 3;
    const retryDelay = retryOptions.retryDelay ?? 1000;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        // If in fallback mode, process directly without retrying
        if (this.inFallbackMode) {
          await this.processDirectly(queue, data);
          return true;
        }
        
        // Try to add to queue
        return await this.addToQueue(queue, data);
      } catch (error) {
        retryCount++;
        
        if (retryCount <= maxRetries) {
          const delay = retryDelay * Math.pow(2, retryCount - 1);
          logger.debug(`Retrying queue publish (${retryCount}/${maxRetries}) after ${delay}ms`, { queue, data });
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Final failure, process directly
          logger.warn(`Failed to publish to queue ${queue} after ${maxRetries} retries, processing directly`, { queue, data });
          await this.processDirectly(queue, data);
          return true;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Consume messages from a queue
   * @param queue The queue name
   * @param callback The callback to process messages
   * @param options Optional configuration for consumption
   */
  async consumeQueue(queue: string, callback: (data: any) => Promise<void>, options: { prefetch?: number } = {}): Promise<void> {
    // Register the callback for fallback mode processing
    if (!this.fallbackCallbacks.has(queue)) {
      this.fallbackCallbacks.set(queue, []);
    }
    this.fallbackCallbacks.get(queue)!.push(callback);
    
    // If in fallback mode, log but don't try to consume
    if (this.inFallbackMode) {
      logger.debug(`Queue in fallback mode, skipping consumption from ${queue}`);
      return;
    }
    
    try {
      if (!this.connected || !this.channel) {
        await this.connect();
      }
      
      // Ensure the queue exists without modifying its properties
      try {
        await this.channel.checkQueue(queue);
      } catch (error) {
        // Only create the queue if it doesn't exist
        // Use predefined config if available, otherwise use default config
        const queueConfig = this.getQueueConfig(queue);
        await this.channel.assertQueue(queue, queueConfig);
      }
      
      // Set prefetch count if specified
      if (options.prefetch) {
        await this.channel.prefetch(options.prefetch);
      }
      
      // Consume messages
      await this.channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => { 
        if (!msg) return;
        
        try {
          const content = msg.content.toString();
          const data = JSON.parse(content);
          
          // Process the message
          await callback(data);
          
          // Acknowledge the message
          this.channel.ack(msg);
          
          logger.debug(`Processed message from queue ${queue}`, { queue, data });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error processing message from queue ${queue}: ${errorMessage}`, { error, queue });
          
          // Reject the message and requeue it
          this.channel.nack(msg, false, true);
        }
      });
      
      logger.info(`Started consuming queue ${queue}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error consuming queue ${queue}: ${errorMessage}`, { error, queue });
      
      // Enter fallback mode instead of throwing error
      this.enterFallbackMode();
      
      // Schedule reconnection attempts
      this.scheduleReconnect();
    }
  }
  
  /**
   * Close the connection to RabbitMQ
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      
      if (this.connection) {
        await this.connection.close();
      }
      
      this.connected = false;
      logger.info('Closed RabbitMQ connection');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error closing RabbitMQ connection: ${errorMessage}`, { error });
    }
  }
  
  /**
   * Check if the queue service is in fallback mode
   * @returns True if in fallback mode, false otherwise
   */
  isInFallbackMode(): boolean {
    return this.inFallbackMode;
  }
  
  /**
   * Process a message directly in fallback mode
   * @param queue The queue name
   * @param data The message data
   */
  async processDirectly(queue: string, data: any): Promise<void> {
    if (!this.inFallbackMode) {
      // If not in fallback mode, add to queue instead
      await this.addToQueue(queue, data);
      return;
    }
    
    const callbacks = this.fallbackCallbacks.get(queue);
    if (!callbacks || callbacks.length === 0) {
      logger.warn(`No fallback handlers registered for queue ${queue}`, { queue, data });
      return;
    }
    
    try {
      // Execute all registered callbacks for this queue
      for (const callback of callbacks) {
        await callback(data);
      }
      logger.debug(`Processed message directly for queue ${queue} in fallback mode`, { queue, data });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing message directly for queue ${queue}: ${errorMessage}`, { error, queue, data });
      
      // Store failed messages for potential retry if configured
      if (config.queue.storeFailedMessages) {
        this.storeFailedMessage(queue, data, error);
      }
    }
  }
  
  /**
   * Store a failed message for later retry
   * This is a simple in-memory implementation - in production, consider using
   * a persistent store like Redis or the database
   */
  private failedMessages: Map<string, Array<{data: any, timestamp: number, error: unknown}>> = new Map();
  
  private storeFailedMessage(queue: string, data: any, error: unknown): void {
    if (!this.failedMessages.has(queue)) {
      this.failedMessages.set(queue, []);
    }
    
    this.failedMessages.get(queue)!.push({
      data,
      timestamp: Date.now(),
      error
    });
    
    logger.debug(`Stored failed message for queue ${queue} for later retry`, { queue, data });
  }
  
  /**
   * Retry processing failed messages
   * @param queue Optional queue name to retry only messages for that queue
   */
  async retryFailedMessages(queue?: string): Promise<number> {
    let retryCount = 0;
    
    // If queue specified, retry only for that queue
    if (queue) {
      const messages = this.failedMessages.get(queue) || [];
      if (messages.length > 0) {
        logger.info(`Retrying ${messages.length} failed messages for queue ${queue}`);
        
        // Create a new array for messages that fail again
        const stillFailed: typeof messages = [];
        
        for (const message of messages) {
          try {
            // Try to process directly or add to queue based on current mode
            if (this.inFallbackMode) {
              await this.processDirectly(queue, message.data);
            } else {
              await this.addToQueue(queue, message.data);
            }
            retryCount++;
          } catch (error) {
            // If still failing, keep in the failed messages list
            stillFailed.push({
              ...message,
              timestamp: Date.now() // Update timestamp
            });
          }
        }
        
        // Replace with messages that still failed
        this.failedMessages.set(queue, stillFailed);
      }
    } else {
      // Retry for all queues
      for (const [queueName, messages] of this.failedMessages.entries()) {
        if (messages.length > 0) {
          const retriedForQueue = await this.retryFailedMessages(queueName);
          retryCount += retriedForQueue;
        }
      }
    }
    
    return retryCount;
  }
  
  /**
   * Get count of failed messages
   * @param queue Optional queue name to get count only for that queue
   */
  getFailedMessageCount(queue?: string): number {
    if (queue) {
      return this.failedMessages.get(queue)?.length || 0;
    } else {
      let total = 0;
      for (const messages of this.failedMessages.values()) {
        total += messages.length;
      }
      return total;
    }
  }

  /**
   * Helper method to process webhook messages by using the event string directly 
   * This uses the overloaded WebhookService.processWebhookDelivery method
   */
  private async processWebhookMessage(data: any): Promise<void> {
    try {
      logger.info(`Processing webhook delivery for webhookId ${data.webhookId}`);
      
      // Create webhook service
      const webhookService = new WebhookService(this);
      
      // Use the processWebhookDelivery method
      await webhookService.processWebhookDelivery(
        data.webhookId,
        data.event,
        data.payload
      );
      
      logger.debug(`Webhook delivery processed for webhookId ${data.webhookId}`);
    } catch (error) {
      logger.error(`Error processing webhook delivery:`, { error, webhookId: data.webhookId, event: data.event });
      // Error is already handled in processWebhookDelivery
    }
  }

  /**
   * Set up the webhook consumer
   */
  private async setupWebhookConsumer(): Promise<void> {
    try {
      // First, ensure the queue exists before trying to consume from it
      if (this.channel) {
        try {
          // First check if queue exists
          await this.channel.checkQueue('webhook.send');
          logger.info('Queue webhook.send already exists, using existing queue');
        } catch (error) {
          // Queue doesn't exist, need to create it
          logger.info('Queue webhook.send does not exist, creating it now');
          try {
            await this.channel.assertQueue('webhook.send', this.getQueueConfig('webhook.send'));
          } catch (queueError) {
            logger.error('Failed to create webhook.send queue:', { error: queueError });
            throw queueError;
          }
          
          // Also create retry queue if needed
          try {
            await this.channel.checkQueue('webhook.send.retry');
          } catch (retryError) {
            try {
              await this.channel.assertQueue('webhook.send.retry', this.getQueueConfig('webhook.send.retry'));
              await this.channel.bindQueue('webhook.send.retry', 'dlx', 'webhook.send.retry');
              
              // Set up consumer for retry queue to requeue messages
              await this.channel.consume('webhook.send.retry', (msg: amqp.ConsumeMessage | null) => {
                if (msg) {
                  this.channel!.sendToQueue('webhook.send', msg.content, {
                    headers: msg.properties.headers
                  });
                  this.channel!.ack(msg);
                }
              });
            } catch (retryQueueError) {
              logger.error('Failed to create webhook.send.retry queue:', { error: retryQueueError });
              // Continue without the retry queue
            }
          }
        }
      }
      
      // Now consume from the queue
      await this.consumeQueue('webhook.send', this.processWebhookMessage.bind(this));
      
      logger.info('Webhook consumer set up successfully');
    } catch (error) {
      logger.error(`Error consuming queue webhook.send:`, { error, queue: 'webhook.send' });
      
      // Register a direct processor for webhook.send
      if (!this.fallbackCallbacks.has('webhook.send')) {
        this.fallbackCallbacks.set('webhook.send', []);
      }
      
      // Add a processor for the webhook.send queue that will be used in fallback mode
      this.fallbackCallbacks.get('webhook.send')!.push(this.processWebhookMessage.bind(this));
      
      throw error;
    }
  }

  // Add this method to the QueueService class
  private async setupBinancePayoutConsumer(): Promise<void> {
    try {
      // First, ensure the queue exists before trying to consume from it
      if (this.channel) {
        try {
          // First check if queue exists
          await this.channel.checkQueue('binance.payout');
          logger.info('Queue binance.payout already exists, using existing queue');
        } catch (error) {
          // Queue doesn't exist, need to create it
          logger.info('Queue binance.payout does not exist, creating it now');
          try {
            await this.channel.assertQueue('binance.payout', this.getQueueConfig('binance.payout'));
          } catch (queueError) {
            logger.error('Failed to create binance.payout queue:', { error: queueError });
            throw queueError;
          }
          
          // Also create retry queue if needed
          try {
            await this.channel.checkQueue('binance.payout.retry');
          } catch (retryError) {
            try {
              await this.channel.assertQueue('binance.payout.retry', this.getQueueConfig('binance.payout.retry'));
              await this.channel.bindQueue('binance.payout.retry', 'dlx', 'binance.payout.retry');
              
              // Set up consumer for retry queue to requeue messages
              await this.channel.consume('binance.payout.retry', (msg: amqp.ConsumeMessage | null) => {
                if (msg) {
                  this.channel!.sendToQueue('binance.payout', msg.content, {
                    headers: msg.properties.headers
                  });
                  this.channel!.ack(msg);
                }
              });
            } catch (retryQueueError) {
              logger.error('Failed to create binance.payout.retry queue:', { error: retryQueueError });
              // Continue without the retry queue
            }
          }
        }
      }
      
      // Now consume from the queue
      await this.consumeQueue('binance.payout', async (data) => {
        try {
          logger.info(`Processing Binance payout for transaction ${data.transactionId}`);
          
          // Get transaction details
          const connection = await getConnection();
          const transactionRepository = connection.getRepository(Transaction);
          
          const transaction = await transactionRepository.findOne({
            where: { id: data.transactionId }
          });
          
          if (!transaction) {
            logger.error(`Transaction not found: ${data.transactionId}`);
            return;
          }
          
          // Check transaction status
          if (transaction.status !== TransactionStatus.PENDING) {
            logger.warn(`Transaction is not in PENDING status: ${data.transactionId}, current status: ${transaction.status}`);
            return;
          }
          
          // Update transaction status to PROCESSING
          transaction.status = TransactionStatus.CONFIRMING;
          await transactionRepository.save(transaction);
          
          // Send webhook for processing status
          const webhookService = new WebhookService(this);
          await webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.PAYOUT_PROCESSING.toString(),
            {
              id: transaction.id,
              status: transaction.status,
              amount: transaction.amount,
              currency: transaction.currency,
              recipientAddress: transaction.recipientAddress,
              createdAt: transaction.createdAt
            }
          );
          
          // Process withdrawal via Binance
          const { BinanceService } = await import('./binanceService');
          const binanceService = new BinanceService();
          
          const withdrawalResult = await binanceService.withdrawFunds(
            transaction.currency,
            transaction.network,
            transaction.recipientAddress!,
            transaction.amount,
            transaction.id
          );
          
          // Update transaction with withdrawal info
          transaction.txHash = withdrawalResult.id;
          transaction.status = TransactionStatus.COMPLETED;
          transaction.metadata = {
            ...transaction.metadata,
            binanceWithdrawalId: withdrawalResult.id,
            binanceTransactionFee: withdrawalResult.transactionFee
          };
          
          await transactionRepository.save(transaction);
          
          // Send webhook for completed status
          await webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.PAYOUT_COMPLETED.toString(),
            {
              id: transaction.id,
              status: transaction.status,
              amount: transaction.amount,
              currency: transaction.currency,
              recipientAddress: transaction.recipientAddress,
              txHash: withdrawalResult.id,
              completedAt: new Date().toISOString()
            }
          );
          
          logger.info(`Binance payout completed for transaction ${transaction.id}`);
        } catch (error: unknown) {
          logger.error(`Error processing Binance payout`, { error, transactionId: data.transactionId });
          
          try {
            // Update transaction status to FAILED
            const connection = await getConnection();
            const transactionRepository = connection.getRepository(Transaction);
            
            const transaction = await transactionRepository.findOne({
              where: { id: data.transactionId }
            });
            
            if (transaction) {
              transaction.status = TransactionStatus.FAILED;
              transaction.metadata = {
                ...transaction.metadata,
                error: error instanceof Error ? error.message : 'Unknown error'
              };
              await transactionRepository.save(transaction);
              
              // Send webhook for failed status
              const webhookService = new WebhookService(this);
              await webhookService.sendWebhookNotification(
                transaction.merchantId,
                WebhookEvent.PAYOUT_FAILED.toString(),
                {
                  id: transaction.id,
                  status: transaction.status,
                  amount: transaction.amount,
                  currency: transaction.currency,
                  recipientAddress: transaction.recipientAddress,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  failedAt: new Date().toISOString()
                }
              );
            }
          } catch (updateError) {
            logger.error(`Error updating failed transaction`, { error: updateError, transactionId: data.transactionId });
          }
        }
      });
    } catch (error) {
      logger.error(`Error consuming queue binance.payout:`, { error, queue: 'binance.payout' });
      
      // Register a direct processor for binance.payout
      if (!this.fallbackCallbacks.has('binance.payout')) {
        this.fallbackCallbacks.set('binance.payout', []);
      }
      
      // Add a processor for the binance.payout queue that will be used in fallback mode
      this.fallbackCallbacks.get('binance.payout')!.push(async (data) => {
        try {
          logger.info(`Direct processing of Binance payout for transaction ${data.transactionId}`);
          
          // Get transaction details
          const connection = await getConnection();
          const transactionRepository = connection.getRepository(Transaction);
          
          const transaction = await transactionRepository.findOne({
            where: { id: data.transactionId }
          });
          
          if (!transaction) {
            logger.error(`Transaction not found: ${data.transactionId}`);
            return;
          }
          
          // Check transaction status
          if (transaction.status !== TransactionStatus.PENDING) {
            logger.warn(`Transaction is not in PENDING status: ${data.transactionId}, current status: ${transaction.status}`);
            return;
          }
          
          // Update transaction status to PROCESSING
          transaction.status = TransactionStatus.CONFIRMING;
          await transactionRepository.save(transaction);
          
          // Send webhook for processing status
          const webhookService = new WebhookService(this);
          await webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.PAYOUT_PROCESSING.toString(),
            {
              id: transaction.id,
              status: transaction.status,
              amount: transaction.amount,
              currency: transaction.currency,
              recipientAddress: transaction.recipientAddress,
              createdAt: transaction.createdAt
            }
          );
          
          // Process withdrawal via Binance
          const { BinanceService } = await import('./binanceService');
          const binanceService = new BinanceService();
          
          const withdrawalResult = await binanceService.withdrawFunds(
            transaction.currency,
            transaction.network,
            transaction.recipientAddress!,
            transaction.amount,
            transaction.id
          );
          
          // Update transaction with withdrawal info
          transaction.txHash = withdrawalResult.id;
          transaction.status = TransactionStatus.COMPLETED;
          transaction.metadata = {
            ...transaction.metadata,
            binanceWithdrawalId: withdrawalResult.id,
            binanceTransactionFee: withdrawalResult.transactionFee
          };
          
          await transactionRepository.save(transaction);
          
          // Send webhook for completed status
          await webhookService.sendWebhookNotification(
            transaction.merchantId,
            WebhookEvent.PAYOUT_COMPLETED.toString(),
            {
              id: transaction.id,
              status: transaction.status,
              amount: transaction.amount,
              currency: transaction.currency,
              recipientAddress: transaction.recipientAddress,
              txHash: withdrawalResult.id,
              completedAt: new Date().toISOString()
            }
          );
          
          logger.info(`Binance payout completed for transaction ${transaction.id}`);
        } catch (error: unknown) {
          logger.error(`Error processing Binance payout directly`, { error, transactionId: data.transactionId });
          
          try {
            // Update transaction status to FAILED
            const connection = await getConnection();
            const transactionRepository = connection.getRepository(Transaction);
            
            const transaction = await transactionRepository.findOne({
              where: { id: data.transactionId }
            });
            
            if (transaction) {
              transaction.status = TransactionStatus.FAILED;
              transaction.metadata = {
                ...transaction.metadata,
                error: error instanceof Error ? error.message : 'Unknown error'
              };
              await transactionRepository.save(transaction);
              
              // Send webhook for failed status
              const webhookService = new WebhookService(this);
              await webhookService.sendWebhookNotification(
                transaction.merchantId,
                WebhookEvent.PAYOUT_FAILED.toString(),
                {
                  id: transaction.id,
                  status: transaction.status,
                  amount: transaction.amount,
                  currency: transaction.currency,
                  recipientAddress: transaction.recipientAddress,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  failedAt: new Date().toISOString()
                }
              );
            }
          } catch (updateError) {
            logger.error(`Error updating failed transaction`, { error: updateError, transactionId: data.transactionId });
          }
        }
      });
      
      throw error; // Rethrow the error to let initialize() know we need fallback mode
    }
  }
}