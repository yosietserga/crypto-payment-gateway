"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const connection_1 = require("../../db/connection");
const Transaction_1 = require("../../db/entities/Transaction");
const errorHandler_1 = require("../../middleware/errorHandler");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const adminMiddleware_1 = require("../../middleware/adminMiddleware");
const merchantAuthMiddleware_1 = require("../../middleware/merchantAuthMiddleware");
const AuditLog_1 = require("../../db/entities/AuditLog");
const logger_1 = require("../../utils/logger");
const router = (0, express_1.Router)();
/**
 * @route GET /api/v1/transactions
 * @desc Get all transactions for a merchant
 * @access Private (Merchant)
 */
router.get('/', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('status').optional().isIn(Object.values(Transaction_1.TransactionStatus)),
    (0, express_validator_1.query)('startDate').optional().isISO8601(),
    (0, express_validator_1.query)('endDate').optional().isISO8601()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant ID is required', true));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;
    try {
        const connection = await (0, connection_1.getConnection)();
        const transactionRepository = connection.getRepository(Transaction_1.Transaction);
        // Build query
        const queryBuilder = transactionRepository.createQueryBuilder('transaction')
            .where('transaction.merchantId = :merchantId', { merchantId })
            .orderBy('transaction.createdAt', 'DESC')
            .skip(offset)
            .take(limit);
        // Apply filters
        if (req.query.status) {
            queryBuilder.andWhere('transaction.status = :status', { status: req.query.status });
        }
        if (req.query.startDate) {
            queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: req.query.startDate });
        }
        if (req.query.endDate) {
            queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: req.query.endDate });
        }
        // Execute query
        const [transactions, total] = await queryBuilder.getManyAndCount();
        res.status(200).json({
            success: true,
            data: {
                transactions,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching transactions', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch transactions', true));
    }
}));
/**
 * @route GET /api/v1/transactions/:id
 * @desc Get a transaction by ID
 * @access Private (Merchant)
 */
router.get('/:id', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('id').isUUID()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant ID is required', true));
    }
    const transactionId = req.params.id;
    try {
        const connection = await (0, connection_1.getConnection)();
        const transactionRepository = connection.getRepository(Transaction_1.Transaction);
        const transaction = await transactionRepository.findOne({
            where: {
                id: transactionId,
                merchantId
            },
            relations: ['paymentAddress']
        });
        if (!transaction) {
            return next(new errorHandler_1.ApiError(404, 'Transaction not found', true));
        }
        res.status(200).json({
            success: true,
            data: transaction
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching transaction', { error, transactionId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch transaction', true));
    }
}));
/**
 * @route GET /api/v1/transactions/stats
 * @desc Get transaction statistics for a merchant
 * @access Private (Merchant)
 */
router.get('/stats', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.query)('startDate').optional().isISO8601(),
    (0, express_validator_1.query)('endDate').optional().isISO8601()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant ID is required', true));
    }
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Default to last 30 days
    const endDate = req.query.endDate || new Date().toISOString();
    try {
        const connection = await (0, connection_1.getConnection)();
        const transactionRepository = connection.getRepository(Transaction_1.Transaction);
        // Get total transaction count and volume
        const totalStats = await transactionRepository
            .createQueryBuilder('transaction')
            .select('COUNT(transaction.id)', 'count')
            .addSelect('SUM(transaction.amount)', 'volume')
            .where('transaction.merchantId = :merchantId', { merchantId })
            .andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .getRawOne();
        // Get stats by status
        const statsByStatus = await transactionRepository
            .createQueryBuilder('transaction')
            .select('transaction.status', 'status')
            .addSelect('COUNT(transaction.id)', 'count')
            .addSelect('SUM(transaction.amount)', 'volume')
            .where('transaction.merchantId = :merchantId', { merchantId })
            .andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .groupBy('transaction.status')
            .getRawMany();
        res.status(200).json({
            success: true,
            data: {
                total: {
                    count: parseInt(totalStats.count) || 0,
                    volume: parseFloat(totalStats.volume) || 0
                },
                byStatus: statsByStatus.map(stat => ({
                    status: stat.status,
                    count: parseInt(stat.count) || 0,
                    volume: parseFloat(stat.volume) || 0
                }))
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching transaction stats', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch transaction statistics', true));
    }
}));
/**
 * @route PATCH /api/v1/transactions/:id
 * @desc Update a transaction (admin only)
 * @access Private (Admin)
 */
router.patch('/:id', authMiddleware_1.authMiddleware, adminMiddleware_1.adminMiddleware, [
    (0, express_validator_1.param)('id').isUUID(),
    (0, express_validator_1.body)('status').optional().isIn(Object.values(Transaction_1.TransactionStatus)),
    (0, express_validator_1.body)('confirmations').optional().isInt({ min: 0 }).toInt(),
    (0, express_validator_1.body)('metadata').optional().isObject()
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const transactionId = req.params.id;
    const { status, confirmations, metadata } = req.body;
    try {
        const connection = await (0, connection_1.getConnection)();
        const transactionRepository = connection.getRepository(Transaction_1.Transaction);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Get the transaction
        const transaction = await transactionRepository.findOne({
            where: { id: transactionId }
        });
        if (!transaction) {
            return next(new errorHandler_1.ApiError(404, 'Transaction not found', true));
        }
        // Store previous state for audit log
        const previousState = {
            status: transaction.status,
            confirmations: transaction.confirmations,
            metadata: transaction.metadata
        };
        // Update fields
        if (status)
            transaction.status = status;
        if (confirmations !== undefined)
            transaction.confirmations = confirmations;
        if (metadata)
            transaction.metadata = { ...transaction.metadata, ...metadata };
        // Save the updated transaction
        await transactionRepository.save(transaction);
        // Create audit log
        const auditLog = AuditLog_1.AuditLog.create({
            action: AuditLog_1.AuditLogAction.MANUAL_TRANSACTION_OVERRIDE,
            entityType: AuditLog_1.AuditLogEntityType.TRANSACTION,
            entityId: transaction.id,
            description: `Manual update of transaction by admin ${req.user?.id || 'unknown'}`,
            userId: req.user?.id,
            merchantId: transaction.merchantId,
            previousState,
            newState: {
                status: transaction.status,
                confirmations: transaction.confirmations,
                metadata: transaction.metadata
            }
        });
        await auditLogRepository.save(auditLog);
        res.status(200).json({
            success: true,
            data: transaction
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating transaction', { error, transactionId });
        next(new errorHandler_1.ApiError(500, 'Failed to update transaction', true));
    }
}));
exports.default = router;
//# sourceMappingURL=transaction.routes.js.map