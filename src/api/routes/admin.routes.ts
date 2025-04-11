import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getConnection } from '../../db/connection';
import { Transaction, TransactionStatus, TransactionType } from '../../db/entities/Transaction';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/authMiddleware';
import { adminMiddleware } from '../../middleware/adminMiddleware';
import { AdminDashboardService } from '../../services/adminDashboardService';
import { BlockchainService } from '../../services/blockchainService';
import { WalletService } from '../../services/walletService';
import { SettlementService } from '../../services/settlementService';
import { WebhookService } from '../../services/webhookService';
import { QueueService } from '../../services/queueService';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';

const router = Router();

// Initialize services
let adminDashboardService: AdminDashboardService;
let blockchainService: BlockchainService;
let walletService: WalletService;
let settlementService: SettlementService;
let webhookService: WebhookService;
let queueService: QueueService;

// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getAdminDashboardService = () => {
  if (!adminDashboardService) {
    // Initialize dependencies
    if (!blockchainService) {
      if (!webhookService) {
        if (!queueService) {
          queueService = new QueueService();
        }
        webhookService = new WebhookService(queueService);
      }
      blockchainService = new BlockchainService(webhookService, queueService);
    }
    
    if (!walletService) {
      walletService = new WalletService();
    }
    
    if (!settlementService) {
      settlementService = new SettlementService(
        walletService,
        blockchainService,
        queueService,
        webhookService
      );
    }
    
    // Initialize admin dashboard service
    adminDashboardService = new AdminDashboardService(
      blockchainService,
      walletService,
      settlementService
    );
  }
  return adminDashboardService;
};

/**
 * Apply authentication and admin middleware to all routes
 */
router.use(authMiddleware, adminMiddleware);

/**
 * @route GET /api/v1/admin/dashboard
 * @desc Get system overview for admin dashboard
 * @access Private (Admin)
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminService = getAdminDashboardService();
      const overview = await adminService.getSystemOverview();
      
      res.status(200).json({
        success: true,
        data: overview
      });
    } catch (error) {
      logger.error('Error getting system overview', { error });
      next(new ApiError(500, 'Failed to get system overview', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/merchants
 * @desc Get merchant list with statistics
 * @access Private (Admin)
 */
router.get(
  '/merchants',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const page = req.query.page as any || 1;
    const limit = req.query.limit as any || 20;

    try {
      const adminService = getAdminDashboardService();
      const merchantList = await adminService.getMerchantList(page, limit);
      
      res.status(200).json({
        success: true,
        data: merchantList
      });
    } catch (error) {
      logger.error('Error getting merchant list', { error });
      next(new ApiError(500, 'Failed to get merchant list', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/merchants/:id
 * @desc Get detailed merchant information
 * @access Private (Admin)
 */
router.get(
  '/merchants/:id',
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.params.id;

    try {
      const adminService = getAdminDashboardService();
      const merchantDetails = await adminService.getMerchantDetails(merchantId);
      
      res.status(200).json({
        success: true,
        data: merchantDetails
      });
    } catch (error) {
      logger.error('Error getting merchant details', { error, merchantId });
      next(new ApiError(500, 'Failed to get merchant details', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/transactions
 * @desc Get transaction list with filtering
 * @access Private (Admin)
 */
router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(Object.values(TransactionStatus)),
    query('type').optional().isIn(Object.values(TransactionType)),
    query('merchantId').optional().isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const page = req.query.page as any || 1;
    const limit = req.query.limit as any || 20;
    
    // Extract filters from query params
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.merchantId) filters.merchantId = req.query.merchantId;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.fromAddress) filters.fromAddress = req.query.fromAddress;
    if (req.query.toAddress) filters.toAddress = req.query.toAddress;

    try {
      const adminService = getAdminDashboardService();
      const transactionList = await adminService.getTransactionList(filters, page, limit);
      
      res.status(200).json({
        success: true,
        data: transactionList
      });
    } catch (error) {
      logger.error('Error getting transaction list', { error });
      next(new ApiError(500, 'Failed to get transaction list', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/transactions/:id
 * @desc Get detailed transaction information
 * @access Private (Admin)
 */
router.get(
  '/transactions/:id',
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const transactionId = req.params.id;

    try {
      const adminService = getAdminDashboardService();
      const transactionDetails = await adminService.getTransactionDetails(transactionId);
      
      res.status(200).json({
        success: true,
        data: transactionDetails
      });
    } catch (error) {
      logger.error('Error getting transaction details', { error, transactionId });
      next(new ApiError(500, 'Failed to get transaction details', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/wallets
 * @desc Get wallet overview information
 * @access Private (Admin)
 */
router.get(
  '/wallets',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminService = getAdminDashboardService();
      const walletOverview = await adminService.getWalletOverview();
      
      res.status(200).json({
        success: true,
        data: walletOverview
      });
    } catch (error) {
      logger.error('Error getting wallet overview', { error });
      next(new ApiError(500, 'Failed to get wallet overview', true));
    }
  })
);

/**
 * @route POST /api/v1/admin/settlements/merchant/:id
 * @desc Trigger manual settlement for a merchant
 * @access Private (Admin)
 */
router.post(
  '/settlements/merchant/:id',
  [
    param('id').isUUID()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const merchantId = req.params.id;

    try {
      const adminService = getAdminDashboardService();
      const result = await adminService.triggerMerchantSettlement(merchantId);
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error triggering merchant settlement', { error, merchantId });
      next(new ApiError(500, 'Failed to trigger settlement', true));
    }
  })
);

/**
 * @route POST /api/v1/admin/settlements/cold-storage
 * @desc Trigger manual transfer to cold storage
 * @access Private (Admin)
 */
router.post(
  '/settlements/cold-storage',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminService = getAdminDashboardService();
      const result = await adminService.triggerColdStorageTransfer();
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error triggering cold storage transfer', { error });
      next(new ApiError(500, 'Failed to trigger cold storage transfer', true));
    }
  })
);

/**
 * @route GET /api/v1/admin/audit-logs
 * @desc Get system audit logs with filtering
 * @access Private (Admin)
 */
router.get(
  '/audit-logs',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('action').optional().isIn(Object.values(AuditLogAction)),
    query('entityType').optional().isIn(Object.values(AuditLogEntityType)),
    query('merchantId').optional().isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const page = req.query.page as any || 1;
    const limit = req.query.limit as any || 20;
    
    // Extract filters from query params
    const filters: any = {};
    if (req.query.action) filters.action = req.query.action;
    if (req.query.entityType) filters.entityType = req.query.entityType;
    if (req.query.entityId) filters.entityId = req.query.entityId;
    if (req.query.merchantId) filters.merchantId = req.query.merchantId;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;

    try {
      const adminService = getAdminDashboardService();
      const auditLogs = await adminService.getAuditLogs(filters, page, limit);
      
      res.status(200).json({
        success: true,
        data: auditLogs
      });
    } catch (error) {
      logger.error('Error getting audit logs', { error });
      next(new ApiError(500, 'Failed to get audit logs', true));
    }
  })
);

export default router;