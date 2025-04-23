import { createConnection, Connection, ConnectionOptions } from 'typeorm';
import { config } from '../config';
import { logger } from '../utils/logger';

// Import entity models
import { User } from './entities/User';
import { Merchant } from './entities/Merchant';
import { PaymentAddress } from './entities/PaymentAddress';
import { Transaction } from './entities/Transaction';
import { Webhook } from './entities/Webhook';
import { ApiKey } from './entities/ApiKey';
import { AuditLog } from './entities/AuditLog';
import { IdempotencyKey } from './entities/IdempotencyKey';

// Database connection options
const connectionOptions: ConnectionOptions = {
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  synchronize: process.env.NODE_ENV === 'development', // Only in development
  logging: process.env.NODE_ENV === 'development',
  entities: [
    User,
    Merchant,
    PaymentAddress,
    Transaction,
    Webhook,
    ApiKey,
    AuditLog,
    IdempotencyKey
  ],
  migrations: ['src/db/migrations/**/*.ts'],
  subscribers: ['src/db/subscribers/**/*.ts'],
  // TypeORM 0.3.x removed cli from connection options
  // Use DataSource for migrations instead,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  extra: {
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMillis
  }
};

// Create and export database connection
export const initializeDatabase = async (): Promise<Connection> => {
  try {
    const connection = await createConnection(connectionOptions);
    logger.info('Database connection established successfully');
    return connection;
  } catch (error) {
    logger.error('Error connecting to database:', error);
    throw error;
  }
};

// Database connection singleton
let connection: Connection | null = null;

export const getConnection = async (): Promise<Connection> => {
  try {
    // Check if there's a connection in TypeORM's connection manager
    const connectionManager = require('typeorm').getConnectionManager();
    
    // If connection exists and is active, return it
    if (connectionManager.has('default') && connectionManager.get('default').isConnected) {
      return connectionManager.get('default');
    }
    
    // Otherwise try our singleton
    if (connection && connection.isConnected) {
      return connection;
    }
    
    // Initialize a new connection if none exists
    connection = await initializeDatabase();
    return connection;
  } catch (error) {
    logger.error('Error getting database connection:', error);
    throw error;
  }
};

// Circuit breaker pattern for database operations
export class DatabaseCircuitBreaker {
  private static failures = 0;
  private static lastFailureTime = 0;
  private static isOpen = false;
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly RESET_TIMEOUT = 30000; // 30 seconds

  static async executeQuery<T>(queryFn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.isOpen) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.RESET_TIMEOUT) {
        // Try to reset the circuit
        this.isOpen = false;
        this.failures = 0;
      } else {
        throw new Error('Database circuit is open. Try again later.');
      }
    }

    try {
      const result = await queryFn();
      // Reset failures on success
      this.failures = 0;
      return result;
    } catch (error) {
      // Increment failure counter
      this.failures++;
      this.lastFailureTime = Date.now();
      
      // Open circuit if threshold reached
      if (this.failures >= this.FAILURE_THRESHOLD) {
        this.isOpen = true;
        logger.error('Database circuit breaker opened due to multiple failures');
      }
      
      throw error;
    }
  }
}