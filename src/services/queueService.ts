import amqp, { ConsumeMessage } from 'amqplib';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getConnection } from '../db/connection';
import { Transaction, TransactionStatus } from '../db/entities/Transaction';
import { WebhookService } from './webhookService';
import { WebhookEvent } from '../db/entities/Webhook';
import { BinanceService } from './binanceService';

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
      await this.connect();
      await this.declareQueues();
      
      // Add try-catch blocks for each consumer setup
      try {
        await this.setupWebhookConsumer();
        logger.info('Webhook consumer setup successfully');
      } catch (error) {
        logger.warn('Failed to setup webhook consumer, webhook processing may be affected', { error });
        // Register a fallback processor for webhooks
        this.registerFallbackProcessor('webhook.send', async (data) => {
          try {
            // Direct webhook processing
            const webhookService = new WebhookService(this, config.webhook.maxRetries, config.webhook.retryDelay);
            await webhookService.processWebhookDelivery(data);
            logger.info('Processed webhook directly (fallback mode)');
          } catch (webhookError) {
            logger.error('Failed to process webhook directly', { error: webhookError });
          }
        });
      }
      
      try {
        await this.setupBinancePayoutConsumer();
        logger.info('Binance payout consumer setup successfully');
      } catch (error) {
        logger.warn('Failed to setup Binance payout consumer, entering fallback mode', { error });
        
        // Register fallback processor for direct processing if not already registered
        this.registerFallbackProcessor('binance.payout', async (data) => {
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
            
            // Process the payout using the binance service directly
            const binanceService = new BinanceService();
            await binanceService.processWithdrawal(transaction);
            
            logger.info(`Successfully processed direct Binance payout for transaction ${data.transactionId}`);
          } catch (error) {
            logger.error(`Error processing Binance payout directly`, { error, transactionId: data.transactionId });
            this.storeFailedMessage('binance.payout', data, error);
          }
        });
      }

      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue service', { error });
      throw error;
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
      // First check if exchange exists using a passive check
      try {
        await this.channel.checkExchange('dlx');
        logger.info('Exchange dlx already exists, skipping declaration');
      } catch (checkError) {
        // Only create the exchange if it doesn't exist
        await this.channel.assertExchange('dlx', 'direct', { durable: true });
        logger.info('Exchange dlx declared successfully');
      }
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
        // Check if queue exists first using passive check
        await this.channel.checkQueue(queue);
        logger.info(`Queue ${queue} already exists, skipping declaration`);
      } catch (checkError) {
        // Queue doesn't exist, try to create it with configured arguments
        try {
          await this.channel.assertQueue(queue, this.getQueueConfig(queue));
          logger.info(`Queue ${queue} declared successfully`);
        } catch (declareError) {
          logger.error(`Failed to declare queue ${queue}`, { error: declareError });
          
          // If this is the binance.payout queue, enter fallback mode immediately
          if (queue === 'binance.payout') {
            logger.warn('Critical queue binance.payout could not be declared, entering fallback mode');
            this.enterFallbackMode();
          }
          // Continue with other queues, don't let one failure stop the process
        }
      }
    }
    
    // If we're in fallback mode due to queue declaration failures, return early
    if (this.inFallbackMode) {
      return;
    }
    
    // Bind retry queues to dead letter exchange - continue if one fails
    const retryBindings = [
      { queue: 'transaction.monitor.retry', key: 'transaction.monitor.retry' },
      { queue: 'webhook.send.retry', key: 'webhook.send.retry' },
      { queue: 'binance.payout.retry', key: 'binance.payout.retry' }
    ];
    
    for (const binding of retryBindings) {
      try {
        // First check if the queue exists
        try {
          await this.channel.checkQueue(binding.queue);
          
          // Try the binding - it's idempotent so it's safe to call multiple times
          await this.channel.bindQueue(binding.queue, 'dlx', binding.key);
          logger.debug(`Queue ${binding.queue} bound to dlx exchange with key ${binding.key}`);
        } catch (checkError) {
          logger.warn(`Queue ${binding.queue} does not exist, skipping binding`, { error: checkError });
        }
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
        // First check if the source queue exists
        try {
          await this.channel.checkQueue(consumer.source);
          
          // Then check if the target queue exists
          try {
            await this.channel.checkQueue(consumer.target);
            
            // Both queues exist, set up the consumer
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
            
            logger.debug(`Retry consumer set up for ${consumer.source} -> ${consumer.target}`);
          } catch (targetError) {
            logger.warn(`Target queue ${consumer.target} does not exist, skipping consumer setup for ${consumer.source}`, { error: targetError });
          }
        } catch (sourceError) {
          logger.warn(`Source queue ${consumer.source} does not exist, skipping consumer setup`, { error: sourceError });
        }
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
      
      // Check if queue exists using passive declaration
      let queueExists = false;
      try {
        await this.channel.checkQueue(queue);
        queueExists = true;
        logger.debug(`Queue ${queue} exists, proceeding with message publish`);
      } catch (checkError) {
        logger.debug(`Queue ${queue} does not exist or check failed, will try to create it`);
        queueExists = false;
      }
      
      // Only attempt to create the queue if it doesn't exist
      if (!queueExists) {
        try {
          const queueConfig = this.getQueueConfig(queue);
          await this.channel.assertQueue(queue, queueConfig);
          logger.info(`Queue ${queue} created successfully for message publish`);
        } catch (createError) {
          // If create fails and it's not because the queue already exists with different params,
          // throw the error to be caught by the outer try/catch
          logger.error(`Failed to create queue ${queue} for message publish`, { error: createError });
          throw createError;
        }
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
      
      // Check if queue exists using passive declaration
      let queueExists = false;
      try {
        await this.channel.checkQueue(queue);
        queueExists = true;
        logger.debug(`Queue ${queue} exists, proceeding with consumer setup`);
      } catch (checkError) {
        logger.debug(`Queue ${queue} does not exist or check failed, will try to create it`);
        queueExists = false;
      }
      
      // Only attempt to create the queue if it doesn't exist
      if (!queueExists) {
        try {
          const queueConfig = this.getQueueConfig(queue);
          await this.channel.assertQueue(queue, queueConfig);
          logger.info(`Queue ${queue} created successfully for consumer setup`);
        } catch (createError) {
          // If create fails and it's not because the queue already exists with different params,
          // log the error but continue to try consuming in case the queue exists now
          logger.error(`Failed to create queue ${queue} for consumer setup`, { error: createError });
        }
      }
      
      // Set prefetch count if specified
      if (options.prefetch) {
        await this.channel.prefetch(options.prefetch);
      }
      
      // Set up consumer
      await this.channel.consume(queue, async (msg: amqp.ConsumeMessage | null) => {
        if (msg) {
          try {
            const data = JSON.parse(msg.content.toString());
            await callback(data);
            this.channel!.ack(msg);
          } catch (error) {
            logger.error(`Error processing message from queue ${queue}`, { error, message: msg.content.toString() });
            
            // Don't requeue the message if it's already been retried too many times
            // to avoid infinite retry loops
            const headers = msg.properties.headers || {};
            const retryCount = (headers['x-retry-count'] || 0) + 1;
            const maxRetries = config.queue.maxRetries ?? 3; // Default to 3 if not set
            
            if (this.isRetriableError(error) && retryCount <= maxRetries) {
              // Nack with requeue=true to retry
              this.channel!.nack(msg, false, true);
              logger.info(`Message requeued for retry (${retryCount}/${maxRetries})`, { queue });
            } else {
              // Nack without requeue to send to dead letter queue if configured,
              // or discard if not
              this.channel!.nack(msg, false, false);
              logger.info(`Message rejected after ${retryCount} retries or non-retriable error`, { queue });
            }
          }
        }
      });
      
      logger.info(`Consumer registered for queue ${queue}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error setting up consumer for queue ${queue}: ${errorMessage}`, { error, queue });
      
      // Enter fallback mode if we encounter an error
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
      const webhookService = new WebhookService(this, config.webhook.maxRetries, config.webhook.retryDelay);
      
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
        // Check if channel is available
        if (!this.channel) {
            logger.warn('Cannot setup binance payout consumer - channel not available');
            this.registerFallbackProcessor('binance.payout', async (data: any) => {
                try {
                    // Process the message using BinanceService
                    const binanceService = new BinanceService();
                    await binanceService.processWithdrawal(data);
                    logger.info('Processed binance payout directly (fallback mode)');
                } catch (error) {
                    logger.error('Failed to process binance payout directly', { error });
                    this.storeFailedMessage('binance.payout', data, error);
                }
            });
            return;
        }

        // Check if queue exists or try to create it
        const queueName = 'binance.payout';
        const retryQueueName = 'binance.payout.retry';
        
        try {
            // Use the existing channel directly to check queue
            await this.channel.checkQueue(queueName);
            logger.info(`Queue ${queueName} exists, setting up consumer`);
        } catch (error) {
            try {
                // Declare the queue if it doesn't exist
                await this.channel.assertQueue(queueName, { 
                    durable: true,
                    arguments: {
                        'x-dead-letter-exchange': 'dlx',
                        'x-dead-letter-routing-key': retryQueueName
                    }
                });
                logger.info(`Queue ${queueName} created, setting up consumer`);
                
                // Set up retry queue
                await this.channel.assertQueue(retryQueueName, {
                    durable: true,
                    arguments: {
                        'x-message-ttl': 60000, // 1 minute delay
                        'x-dead-letter-exchange': '',
                        'x-dead-letter-routing-key': queueName
                    }
                });
                logger.info(`Retry queue ${retryQueueName} created`);
            } catch (err) {
                logger.error(`Failed to verify/create ${queueName} queue: ${err instanceof Error ? err.message : 'Unknown error'}`);
                this.registerFallbackProcessor('binance.payout', async (data: any) => {
                    try {
                        // Process the message using BinanceService
                        const binanceService = new BinanceService();
                        await binanceService.processWithdrawal(data);
                        logger.info('Processed binance payout directly (fallback mode)');
                    } catch (error) {
                        logger.error('Failed to process binance payout directly', { error });
                        this.storeFailedMessage('binance.payout', data, error);
                    }
                });
                return;
            }
        }

        // Set up the consumer
        try {
            await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
                if (!msg) return;
                
                try {
                    const content = JSON.parse(msg.content.toString());
                    logger.info(`Processing binance payout message: ${JSON.stringify(content)}`);
                    
                    // Process the message using BinanceService
                    const binanceService = new BinanceService();
                    await binanceService.processWithdrawal(content);
                    
                    // Acknowledge the message on successful processing
                    this.channel.ack(msg);
                } catch (error) {
                    logger.error(`Error processing binance payout message: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
                    
                    // Check if the error is retriable
                    const configMaxRetries = config.queue.maxRetries !== undefined ? config.queue.maxRetries : 3;
                    const headers = msg.properties.headers || {};
                    const retryCount = (headers['x-retry-count'] || 0) + 1;
                    
                    if (this.isRetriableError(error) && retryCount < configMaxRetries) {
                        // Handle retry with dead letter exchange
                        try {
                            // Publish to DLX for retry
                            this.channel.ack(msg);
                            const delay = (config.queue.retryDelay || 5000) * Math.pow(2, retryCount - 1);
                            await this.channel.publish('dlx', retryQueueName, msg.content, { 
                                headers: { ...headers, 'x-retry-count': retryCount },
                                expiration: delay  // Exponential backoff
                            });
                            logger.info(`Message sent to retry queue, attempt ${retryCount}`);
                        } catch (dlxError) {
                            logger.error(`Failed to send to retry queue: ${dlxError instanceof Error ? dlxError.message : 'Unknown error'}`);
                            // Store failed message for manual processing
                            this.storeFailedMessage(queueName, msg.content.toString(), error);
                            this.channel.ack(msg);
                        }
                    } else {
                        // Non-retriable error or max retries reached
                        logger.warn(`Max retries reached or non-retriable error, message will be discarded`);
                        this.storeFailedMessage(queueName, msg.content.toString(), error);
                        this.channel.ack(msg);
                    }
                }
            }, { noAck: false });
            
            logger.info('Binance payout consumer setup successfully');
        } catch (error) {
            logger.error(`Failed to setup binance payout consumer: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
            this.registerFallbackProcessor('binance.payout', async (data: any) => {
                try {
                    // Process the message using BinanceService
                    const binanceService = new BinanceService();
                    await binanceService.processWithdrawal(data);
                    logger.info('Processed binance payout directly (fallback mode)');
                } catch (error) {
                    logger.error('Failed to process binance payout directly', { error });
                    this.storeFailedMessage('binance.payout', data, error);
                }
            });
        }
    } catch (error) {
        logger.error(`Error in setupBinancePayoutConsumer: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        this.registerFallbackProcessor('binance.payout', async (data: any) => {
            try {
                // Process the message using BinanceService
                const binanceService = new BinanceService();
                await binanceService.processWithdrawal(data);
                logger.info('Processed binance payout directly (fallback mode)');
            } catch (error) {
                logger.error('Failed to process binance payout directly', { error });
                this.storeFailedMessage('binance.payout', data, error);
            }
        });
    }
}

// Helper method to register a fallback processor for binance payouts
private registerFallbackProcessor(queueName: string, callback: (data: any) => Promise<void>): void {
  if (!this.fallbackCallbacks.has(queueName)) {
    this.fallbackCallbacks.set(queueName, []);
  }
  
  if (!this.fallbackCallbacks.get(queueName)?.length) {
    this.fallbackCallbacks.get(queueName)!.push(callback);
    logger.info(`Registered fallback processor for queue: ${queueName}`);
  }
}

// Add this method if it doesn't exist
private isRetriableError(error: any): boolean {
  if (!error) return false;
  
  // Consider connection errors, channel errors, and some specific RabbitMQ errors as retriable
  const retriableErrors = [
    'CONNECTION_CLOSED',
    'CHANNEL_CLOSED',
    'PRECONDITION_FAILED',
    'RESOURCE_LOCKED'
  ];
  
  return (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    (error.message && retriableErrors.some(e => error.message.includes(e)))
  );
}
}