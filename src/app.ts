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

// Initialize express app
const app: Application = express();

// Apply security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));

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

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/admin', adminRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port || 3000;
app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Initialize services
  try {
    // Import services
    const { QueueService } = await import('./services/queueService');
    const { WebhookService } = await import('./services/webhookService');
    const { BlockchainService } = await import('./services/blockchainService');
    const { TransactionMonitorService } = await import('./services/transactionMonitorService');
    
    // Initialize queue service with fallback capability
    const queueService = new QueueService();
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
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
});

export default app;