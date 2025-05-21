import './reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Import routes
import authRoutes from './api/routes/auth.routes';
import addressRoutes from './api/routes/address.routes';
import transactionRoutes from './api/routes/transaction.routes';
import webhookRoutes from './api/routes/webhook.routes';
import adminRoutes from './api/routes/admin.routes';
import merchantRoutes from './api/routes/merchant.routes';
import paymentWebappRoutes from './api/routes/payment.routes';
import payoutRoutes from './api/routes/payout.routes';
import binanceRoutes from './api/routes/binance.routes';
import binanceWebhookRoutes from './api/routes/binance-webhook.routes';
import apiKeyRoutes from './api/routes/api-key.routes';
//import compatibilityRoutes from './api/routes/compatibility.routes';

// Initialize express app
const app: Application = express();

// Apply security middleware with less restrictive settings for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // Disable CSP for development
}));

// Basic CORS configuration - simpler approach
app.use(cors());

// Standard middleware
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));

// Enable simple CORS headers for all responses
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Import and apply sandbox middleware
import { sandboxMiddleware } from './middleware/sandboxMiddleware';
app.use(sandboxMiddleware);

// Apply rate limiting - 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after a minute'
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Homepage route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'Crypto Payment Gateway API',
    version: '1.0.0',
    documentation: '/api/docs',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Determine if we're in sandbox mode
const isSandbox = process.env.NODE_ENV === 'sandbox';
const apiPrefix = isSandbox ? '/sandbox/api/v1' : '/api/v1';

// Log the environment mode
logger.info(`Starting server in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);

// API routes with versioning
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/addresses`, addressRoutes);
app.use(`${apiPrefix}/transactions`, transactionRoutes);
app.use(`${apiPrefix}/webhooks`, webhookRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/merchant`, merchantRoutes);
app.use(`${apiPrefix}/payments`, paymentWebappRoutes);
app.use(`${apiPrefix}/payouts`, payoutRoutes);
app.use(`${apiPrefix}/binance`, binanceRoutes);
app.use(`${apiPrefix}/binance-webhooks`, binanceWebhookRoutes);
app.use(`${apiPrefix}/api-keys`, apiKeyRoutes);

// Compatibility routes for documented API endpoints
//app.use('/api/v1', compatibilityRoutes);
// Also support sandbox compatibility routes
//app.use('/sandbox/api/v1', compatibilityRoutes);

// Serve static files for payment webapp
app.use('/payment-webapp', express.static('payment-webapp'));

// Serve Binance dashboard from payment-webapp directory
app.use('/binance-dashboard', express.static('payment-webapp'));

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Initialize services
  try {
    // Import database connection
    const { initializeDatabase } = await import('./db/connection');
    
    // Initialize database connection
    try {
      await initializeDatabase();
      logger.info('Database connection established successfully');
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';
      logger.error(`Failed to initialize database connection: ${errorMessage}`);
      logger.warn('Application will continue with limited functionality');
    }
    
    // Import services
    const { QueueService } = await import('./services/queueService');
    const { WebhookService } = await import('./services/webhookService');
    const { BlockchainService } = await import('./services/blockchainService');
    const { BinanceService } = await import('./services/binanceService');
    const { TransactionMonitorService } = await import('./services/transactionMonitorService');
    
    // Initialize queue service with fallback capability
    const queueService = QueueService.getInstance();
    try {
      await queueService.initialize();
    } catch (error) {
      // QueueService now handles errors internally and enters fallback mode
      // We don't need to throw or handle the error here
      logger.warn('Continuing application startup with queue service in fallback mode');
    }
    
    // Initialize webhook service
    const webhookService = new WebhookService(queueService);
    
    // Initialize blockchain service
    const blockchainService = new BlockchainService(webhookService, queueService);
    
    // Initialize Binance service
    const binanceService = new BinanceService();
    
    // Check if Binance integration is enabled
    if (process.env.USE_BINANCE_WALLET === 'true') {
      try {
        // Validate Binance API credentials
        const apiStatus = await binanceService.validateApiCredentials();
        if (apiStatus) {
          logger.info('Binance API integration enabled and credentials validated successfully');
        } else {
          logger.warn('Binance API integration enabled but credentials validation failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Binance API validation failed: ${errorMessage}`);
      }
    } else {
      logger.info('Binance API integration is disabled. Using local HD wallet.');
    }
    
    // Initialize transaction monitor service
    try {
      const transactionMonitorService = new TransactionMonitorService(
        blockchainService,
        webhookService,
        queueService
      );
      await transactionMonitorService.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Transaction monitor service initialization failed: ${errorMessage}. Some functionality may be limited.`);
      // Continue application execution even if transaction monitoring fails
    }
    
    logger.info('Services initialized - application is ready');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to initialize services: ${errorMessage}`, { error });
    logger.info('Application will continue with limited functionality');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  // Check if this is a WebSocket 503 error that we want to handle gracefully
  if (error.message && (error.message.includes('503') || error.message.includes('Service Unavailable') || error.message.includes('Unexpected server response'))) {
    logger.error(`Caught unhandled WebSocket error: ${error.message}`);
    // Don't crash the application for WebSocket errors
    return;
  }
  
  // For other uncaught exceptions, log and exit
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
});

export default app;