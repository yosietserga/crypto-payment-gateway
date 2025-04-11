"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const Transaction_1 = require("../../db/entities/Transaction");
const errorHandler_1 = require("../../middleware/errorHandler");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const adminMiddleware_1 = require("../../middleware/adminMiddleware");
const adminDashboardService_1 = require("../../services/adminDashboardService");
const blockchainService_1 = require("../../services/blockchainService");
const walletService_1 = require("../../services/walletService");
const settlementService_1 = require("../../services/settlementService");
const webhookService_1 = require("../../services/webhookService");
const queueService_1 = require("../../services/queueService");
const AuditLog_1 = require("../../db/entities/AuditLog");
const logger_1 = require("../../utils/logger");
const router = (0, express_1.Router)();
// Initialize services
let adminDashboardService;
let blockchainService;
let walletService;
let settlementService;
let webhookService;
let queueService;
// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getAdminDashboardService = () => {
    if (!adminDashboardService) {
        // Initialize dependencies
        if (!blockchainService) {
            if (!webhookService) {
                if (!queueService) {
                    queueService = new queueService_1.QueueService();
                }
                webhookService = new webhookService_1.WebhookService(queueService);
            }
            blockchainService = new blockchainService_1.BlockchainService(webhookService, queueService);
        }
        if (!walletService) {
            walletService = new walletService_1.WalletService();
        }
        if (!settlementService) {
            settlementService = new settlementService_1.SettlementService(walletService, blockchainService, queueService, webhookService);
        }
        // Initialize admin dashboard service
        adminDashboardService = new adminDashboardService_1.AdminDashboardService(blockchainService, walletService, settlementService);
    }
    return adminDashboardService;
};
/**
 * Apply authentication and admin middleware to all routes
 */
router.use(authMiddleware_1.authMiddleware, adminMiddleware_1.adminMiddleware);
/**
 * @route GET /api/v1/admin/dashboard
 * @desc Get system overview for admin dashboard
 * @access Private (Admin)
 */
router.get('/dashboard', (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const adminService = getAdminDashboardService();
        const overview = await adminService.getSystemOverview();
        res.status(200).json({
            success: true,
            data: overview
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting system overview', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to get system overview', true));
    }
}));
/**
 * @route GET /api/v1/admin/merchants
 * @desc Get merchant list with statistics
 * @access Private (Admin)
 */
router.get('/merchants', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    try {
        const adminService = getAdminDashboardService();
        const merchantList = await adminService.getMerchantList(page, limit);
        res.status(200).json({
            success: true,
            data: merchantList
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting merchant list', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to get merchant list', true));
    }
}));
/**
 * @route GET /api/v1/admin/merchants/:id
 * @desc Get detailed merchant information
 * @access Private (Admin)
 */
router.get('/merchants/:id', [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.params.id;
    try {
        const adminService = getAdminDashboardService();
        const merchantDetails = await adminService.getMerchantDetails(merchantId);
        res.status(200).json({
            success: true,
            data: merchantDetails
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting merchant details', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to get merchant details', true));
    }
}));
/**
 * @route GET /api/v1/admin/transactions
 * @desc Get transaction list with filtering
 * @access Private (Admin)
 */
router.get('/transactions', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('status').optional().isIn(Object.values(Transaction_1.TransactionStatus)),
    (0, express_validator_1.query)('type').optional().isIn(Object.values(Transaction_1.TransactionType)),
    (0, express_validator_1.query)('merchantId').optional().isUUID(),
    (0, express_validator_1.query)('startDate').optional().isISO8601(),
    (0, express_validator_1.query)('endDate').optional().isISO8601()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    // Extract filters from query params
    const filters = {};
    if (req.query.status)
        filters.status = req.query.status;
    if (req.query.type)
        filters.type = req.query.type;
    if (req.query.merchantId)
        filters.merchantId = req.query.merchantId;
    if (req.query.startDate)
        filters.startDate = req.query.startDate;
    if (req.query.endDate)
        filters.endDate = req.query.endDate;
    if (req.query.fromAddress)
        filters.fromAddress = req.query.fromAddress;
    if (req.query.toAddress)
        filters.toAddress = req.query.toAddress;
    try {
        const adminService = getAdminDashboardService();
        const transactionList = await adminService.getTransactionList(filters, page, limit);
        res.status(200).json({
            success: true,
            data: transactionList
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting transaction list', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to get transaction list', true));
    }
}));
/**
 * @route GET /api/v1/admin/transactions/:id
 * @desc Get detailed transaction information
 * @access Private (Admin)
 */
router.get('/transactions/:id', [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const transactionId = req.params.id;
    try {
        const adminService = getAdminDashboardService();
        const transactionDetails = await adminService.getTransactionDetails(transactionId);
        res.status(200).json({
            success: true,
            data: transactionDetails
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting transaction details', { error, transactionId });
        next(new errorHandler_1.ApiError(500, 'Failed to get transaction details', true));
    }
}));
/**
 * @route GET /api/v1/admin/wallets
 * @desc Get wallet overview information
 * @access Private (Admin)
 */
router.get('/wallets', (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const adminService = getAdminDashboardService();
        const walletOverview = await adminService.getWalletOverview();
        res.status(200).json({
            success: true,
            data: walletOverview
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting wallet overview', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to get wallet overview', true));
    }
}));
/**
 * @route POST /api/v1/admin/settlements/merchant/:id
 * @desc Trigger manual settlement for a merchant
 * @access Private (Admin)
 */
router.post('/settlements/merchant/:id', [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.params.id;
    try {
        const adminService = getAdminDashboardService();
        const result = await adminService.triggerMerchantSettlement(merchantId);
        res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        logger_1.logger.error('Error triggering merchant settlement', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to trigger settlement', true));
    }
}));
/**
 * @route POST /api/v1/admin/settlements/cold-storage
 * @desc Trigger manual transfer to cold storage
 * @access Private (Admin)
 */
router.post('/settlements/cold-storage', (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    try {
        const adminService = getAdminDashboardService();
        const result = await adminService.triggerColdStorageTransfer();
        res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        logger_1.logger.error('Error triggering cold storage transfer', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to trigger cold storage transfer', true));
    }
}));
/**
 * @route GET /api/v1/admin/audit-logs
 * @desc Get system audit logs with filtering
 * @access Private (Admin)
 */
router.get('/audit-logs', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('action').optional().isIn(Object.values(AuditLog_1.AuditLogAction)),
    (0, express_validator_1.query)('entityType').optional().isIn(Object.values(AuditLog_1.AuditLogEntityType)),
    (0, express_validator_1.query)('merchantId').optional().isUUID(),
    (0, express_validator_1.query)('startDate').optional().isISO8601(),
    (0, express_validator_1.query)('endDate').optional().isISO8601()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    // Extract filters from query params
    const filters = {};
    if (req.query.action)
        filters.action = req.query.action;
    if (req.query.entityType)
        filters.entityType = req.query.entityType;
    if (req.query.entityId)
        filters.entityId = req.query.entityId;
    if (req.query.merchantId)
        filters.merchantId = req.query.merchantId;
    if (req.query.startDate)
        filters.startDate = req.query.startDate;
    if (req.query.endDate)
        filters.endDate = req.query.endDate;
    try {
        const adminService = getAdminDashboardService();
        const auditLogs = await adminService.getAuditLogs(filters, page, limit);
        res.status(200).json({
            success: true,
            data: auditLogs
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting audit logs', { error });
        next(new errorHandler_1.ApiError(500, 'Failed to get audit logs', true));
    }
}));
exports.default = router;
//# sourceMappingURL=admin.routes.js.map