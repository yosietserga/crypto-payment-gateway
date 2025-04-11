"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./reflect-metadata");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = require("express-rate-limit");
const config_1 = require("./config");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
// Import routes
const auth_routes_1 = __importDefault(require("./api/routes/auth.routes"));
const address_routes_1 = __importDefault(require("./api/routes/address.routes"));
const transaction_routes_1 = __importDefault(require("./api/routes/transaction.routes"));
const webhook_routes_1 = __importDefault(require("./api/routes/webhook.routes"));
const admin_routes_1 = __importDefault(require("./api/routes/admin.routes"));
// Initialize express app
const app = (0, express_1.default)();
// Apply security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)('combined', { stream: { write: (message) => logger_1.logger.info(message.trim()) } }));
// Apply rate limiting - 100 requests per minute per IP
const limiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after a minute'
});
app.use(limiter);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API routes
app.use('/api/v1/auth', auth_routes_1.default);
app.use('/api/v1/addresses', address_routes_1.default);
app.use('/api/v1/transactions', transaction_routes_1.default);
app.use('/api/v1/webhooks', webhook_routes_1.default);
app.use('/api/v1/admin', admin_routes_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Global error handler
app.use(errorHandler_1.errorHandler);
// Start server
const PORT = config_1.config.port || 3000;
app.listen(PORT, async () => {
    logger_1.logger.info(`Server running on port ${PORT}`);
    // Initialize services
    try {
        // Import services
        const { QueueService } = await Promise.resolve().then(() => __importStar(require('./services/queueService')));
        const { WebhookService } = await Promise.resolve().then(() => __importStar(require('./services/webhookService')));
        const { BlockchainService } = await Promise.resolve().then(() => __importStar(require('./services/blockchainService')));
        const { TransactionMonitorService } = await Promise.resolve().then(() => __importStar(require('./services/transactionMonitorService')));
        // Initialize queue service
        const queueService = new QueueService();
        await queueService.initialize();
        // Initialize webhook service
        const webhookService = new WebhookService(queueService);
        // Initialize blockchain service
        const blockchainService = new BlockchainService(webhookService, queueService);
        // Initialize transaction monitor service
        const transactionMonitorService = new TransactionMonitorService(blockchainService, webhookService, queueService);
        await transactionMonitorService.initialize();
        logger_1.logger.info('All services initialized successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error(`Failed to initialize services: ${errorMessage}`, { error });
    }
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error('Unhandled Rejection:', reason);
});
exports.default = app;
//# sourceMappingURL=app.js.map