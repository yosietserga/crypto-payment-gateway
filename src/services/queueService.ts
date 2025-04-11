import amqp from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Service for managing message queues using RabbitMQ
 */
export class QueueService {
  private connection: any = null;
  private channel: any = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = config.queue.retryAttempts || 10;
  private readonly reconnectInterval: number = config.queue.retryDelay || 5000; // 5 seconds
  private inFallbackMode: boolean = false;
  private fallbackCallbacks: Map<string, ((data: any) => Promise<void>)[]> = new Map();

  /**
   * Initialize the queue connection
   */
  async initialize(): Promise<void> {
    try {
      // Initialize RabbitMQ connection and channels
      await this.connect();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to initialize queue service: ${errorMessage}`, { error });
      
      // Enter fallback mode instead of throwing error
      this.inFallbackMode = true;
      logger.warn('Queue service entering fallback mode - application will continue without message queue functionality');
    }
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
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        if (this.connected) {
          logger.warn('RabbitMQ connection closed unexpectedly');
          this.connected = false;
          this.reconnect();
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
      this.reconnect();
      throw error;
    }
  }

  /**
   * Reconnect to RabbitMQ after connection failure
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect to RabbitMQ after ${this.maxReconnectAttempts} attempts`);
      return;
    }
    
    this.reconnectAttempts++;
    
    setTimeout(async () => {
      logger.info(`Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts})`);
      try {
        await this.connect();
      } catch (error) {
        // Error handling is done in connect()
      }
    }, this.reconnectInterval);
  }

  /**
   * Declare all required queues
   */
  private async declareQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    // Declare queues with dead letter exchange for retries
    await this.channel.assertExchange('dlx', 'direct', { durable: true });
    
    // Transaction monitoring queue
    await this.channel.assertQueue('transaction.monitor', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'transaction.monitor.retry'
      }
    });
    
    // Webhook sending queue
    await this.channel.assertQueue('webhook.send', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'webhook.send.retry'
      }
    });
    
    // Retry queues
    await this.channel.assertQueue('transaction.monitor.retry', {
      durable: true,
      arguments: { 'x-message-ttl': 60000 } // 1 minute delay
    });
    
    await this.channel.assertQueue('webhook.send.retry', {
      durable: true,
      arguments: { 'x-message-ttl': 60000 } // 1 minute delay
    });
    
    // Bind retry queues to dead letter exchange
    await this.channel.bindQueue('transaction.monitor.retry', 'dlx', 'transaction.monitor.retry');
    await this.channel.bindQueue('webhook.send.retry', 'dlx', 'webhook.send.retry');
    
    // Set up consumers for retry queues to requeue messages
    await this.channel.consume('transaction.monitor.retry', (msg: amqp.ConsumeMessage | null) => {
      if (msg) {
        this.channel!.sendToQueue('transaction.monitor', msg.content, {
          headers: msg.properties.headers
        });
        this.channel!.ack(msg);
      }
    });
    
    await this.channel.consume('webhook.send.retry', (msg: amqp.ConsumeMessage | null) => {
      if (msg) {
        this.channel!.sendToQueue('webhook.send', msg.content, {
          headers: msg.properties.headers
        });
        this.channel!.ack(msg);
      }
    });
  }

  /**
   * Add a message to a queue
   * @param queue The queue name
   * @param data The message data
   */
  async addToQueue(queue: string, data: any): Promise<boolean> {
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
      
      // Ensure the queue exists
      await this.channel.assertQueue(queue, { durable: true });
      
      // Add message to queue
      const success = this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
        persistent: true
      });
      
      logger.debug(`Added message to queue ${queue}`, { queue, data });
      return success;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error adding message to queue ${queue}: ${errorMessage}`, { error, queue, data });
      
      // Enter fallback mode if we encounter an error
      if (!this.inFallbackMode) {
        this.inFallbackMode = true;
        logger.warn('Queue service entering fallback mode after failed operation');
        
        // Try to process the message directly since we're now in fallback mode
        await this.processDirectly(queue, data);
      }
      
      return true; // Return true to prevent errors in calling code
    }
  }
  
  /**
   * Consume messages from a queue
   * @param queue The queue name
   * @param callback The callback to process messages
   */
  async consumeQueue(queue: string, callback: (data: any) => Promise<void>): Promise<void> {
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
      
      // Ensure the queue exists
      await this.channel.assertQueue(queue, { durable: true });
      
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
      this.inFallbackMode = true;
      logger.warn(`Queue service entering fallback mode - unable to consume from ${queue}`);
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
    }
  }
}