"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
/**
 * Service for managing message queues using RabbitMQ
 */
class QueueService {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 5000; // 5 seconds
    }
    /**
     * Initialize the queue connection
     */
    async initialize() {
        try {
            // Initialize RabbitMQ connection and channels
            await this.connect();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to initialize queue service: ${errorMessage}`, { error });
            throw error;
        }
    }
    /**
     * Connect to RabbitMQ
     */
    async connect() {
        try {
            // Connect to RabbitMQ
            this.connection = await amqplib_1.default.connect(config_1.config.queue.url);
            // Create a channel
            this.channel = await this.connection.createChannel();
            // Set up error handlers
            this.connection.on('error', (err) => {
                logger_1.logger.error(`RabbitMQ connection error: ${err.message}`, { error: err });
                this.connected = false;
                this.reconnect();
            });
            this.connection.on('close', () => {
                if (this.connected) {
                    logger_1.logger.warn('RabbitMQ connection closed unexpectedly');
                    this.connected = false;
                    this.reconnect();
                }
            });
            // Declare queues
            await this.declareQueues();
            this.connected = true;
            this.reconnectAttempts = 0;
            logger_1.logger.info('Connected to RabbitMQ successfully');
        }
        catch (error) {
            this.connected = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Failed to connect to RabbitMQ: ${errorMessage}`, { error });
            this.reconnect();
            throw error;
        }
    }
    /**
     * Reconnect to RabbitMQ after connection failure
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger_1.logger.error(`Failed to reconnect to RabbitMQ after ${this.maxReconnectAttempts} attempts`);
            return;
        }
        this.reconnectAttempts++;
        setTimeout(async () => {
            logger_1.logger.info(`Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts})`);
            try {
                await this.connect();
            }
            catch (error) {
                // Error handling is done in connect()
            }
        }, this.reconnectInterval);
    }
    /**
     * Declare all required queues
     */
    async declareQueues() {
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
        await this.channel.consume('transaction.monitor.retry', (msg) => {
            if (msg) {
                this.channel.sendToQueue('transaction.monitor', msg.content, {
                    headers: msg.properties.headers
                });
                this.channel.ack(msg);
            }
        });
        await this.channel.consume('webhook.send.retry', (msg) => {
            if (msg) {
                this.channel.sendToQueue('webhook.send', msg.content, {
                    headers: msg.properties.headers
                });
                this.channel.ack(msg);
            }
        });
    }
    /**
     * Add a message to a queue
     * @param queue The queue name
     * @param data The message data
     */
    async addToQueue(queue, data) {
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
            logger_1.logger.debug(`Added message to queue ${queue}`, { queue, data });
            return success;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error adding message to queue ${queue}: ${errorMessage}`, { error, queue, data });
            return false;
        }
    }
    /**
     * Consume messages from a queue
     * @param queue The queue name
     * @param callback The callback to process messages
     */
    async consumeQueue(queue, callback) {
        try {
            if (!this.connected || !this.channel) {
                await this.connect();
            }
            // Ensure the queue exists
            await this.channel.assertQueue(queue, { durable: true });
            // Consume messages
            await this.channel.consume(queue, async (msg) => {
                if (!msg)
                    return;
                try {
                    const content = msg.content.toString();
                    const data = JSON.parse(content);
                    // Process the message
                    await callback(data);
                    // Acknowledge the message
                    this.channel.ack(msg);
                    logger_1.logger.debug(`Processed message from queue ${queue}`, { queue, data });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    logger_1.logger.error(`Error processing message from queue ${queue}: ${errorMessage}`, { error, queue });
                    // Reject the message and requeue it
                    this.channel.nack(msg, false, true);
                }
            });
            logger_1.logger.info(`Started consuming queue ${queue}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error consuming queue ${queue}: ${errorMessage}`, { error, queue });
            throw error;
        }
    }
    /**
     * Close the connection to RabbitMQ
     */
    async close() {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
            this.connected = false;
            logger_1.logger.info('Closed RabbitMQ connection');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error(`Error closing RabbitMQ connection: ${errorMessage}`, { error });
        }
    }
}
exports.QueueService = QueueService;
//# sourceMappingURL=queueService.js.map