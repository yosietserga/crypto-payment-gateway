"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseCircuitBreaker = exports.getConnection = exports.initializeDatabase = void 0;
const typeorm_1 = require("typeorm");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
// Import entity models
const User_1 = require("./entities/User");
const Merchant_1 = require("./entities/Merchant");
const PaymentAddress_1 = require("./entities/PaymentAddress");
const Transaction_1 = require("./entities/Transaction");
const Webhook_1 = require("./entities/Webhook");
const ApiKey_1 = require("./entities/ApiKey");
const AuditLog_1 = require("./entities/AuditLog");
const IdempotencyKey_1 = require("./entities/IdempotencyKey");
// Database connection options
const connectionOptions = {
    type: 'postgres',
    host: config_1.config.database.host,
    port: config_1.config.database.port,
    username: config_1.config.database.username,
    password: config_1.config.database.password,
    database: config_1.config.database.database,
    synchronize: process.env.NODE_ENV === 'development', // Only in development
    logging: process.env.NODE_ENV === 'development',
    entities: [
        User_1.User,
        Merchant_1.Merchant,
        PaymentAddress_1.PaymentAddress,
        Transaction_1.Transaction,
        Webhook_1.Webhook,
        ApiKey_1.ApiKey,
        AuditLog_1.AuditLog,
        IdempotencyKey_1.IdempotencyKey
    ],
    migrations: ['src/db/migrations/**/*.ts'],
    subscribers: ['src/db/subscribers/**/*.ts'],
    // TypeORM 0.3.x removed cli from connection options
    // Use DataSource for migrations instead,
    ssl: config_1.config.database.ssl ? { rejectUnauthorized: false } : false,
    extra: {
        max: config_1.config.database.maxConnections,
        idleTimeoutMillis: config_1.config.database.idleTimeoutMillis
    }
};
// Create and export database connection
const initializeDatabase = async () => {
    try {
        const connection = await (0, typeorm_1.createConnection)(connectionOptions);
        logger_1.logger.info('Database connection established successfully');
        return connection;
    }
    catch (error) {
        logger_1.logger.error('Error connecting to database:', error);
        throw error;
    }
};
exports.initializeDatabase = initializeDatabase;
// Database connection singleton
let connection = null;
const getConnection = async () => {
    if (!connection) {
        connection = await (0, exports.initializeDatabase)();
    }
    return connection;
};
exports.getConnection = getConnection;
// Circuit breaker pattern for database operations
class DatabaseCircuitBreaker {
    static async executeQuery(queryFn) {
        // Check if circuit is open
        if (this.isOpen) {
            const now = Date.now();
            if (now - this.lastFailureTime > this.RESET_TIMEOUT) {
                // Try to reset the circuit
                this.isOpen = false;
                this.failures = 0;
            }
            else {
                throw new Error('Database circuit is open. Try again later.');
            }
        }
        try {
            const result = await queryFn();
            // Reset failures on success
            this.failures = 0;
            return result;
        }
        catch (error) {
            // Increment failure counter
            this.failures++;
            this.lastFailureTime = Date.now();
            // Open circuit if threshold reached
            if (this.failures >= this.FAILURE_THRESHOLD) {
                this.isOpen = true;
                logger_1.logger.error('Database circuit breaker opened due to multiple failures');
            }
            throw error;
        }
    }
}
exports.DatabaseCircuitBreaker = DatabaseCircuitBreaker;
DatabaseCircuitBreaker.failures = 0;
DatabaseCircuitBreaker.lastFailureTime = 0;
DatabaseCircuitBreaker.isOpen = false;
DatabaseCircuitBreaker.FAILURE_THRESHOLD = 5;
DatabaseCircuitBreaker.RESET_TIMEOUT = 30000; // 30 seconds
//# sourceMappingURL=connection.js.map