"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const connection_1 = require("../../db/connection");
const PaymentAddress_1 = require("../../db/entities/PaymentAddress");
const errorHandler_1 = require("../../middleware/errorHandler");
const merchantAuthMiddleware_1 = require("../../middleware/merchantAuthMiddleware");
const idempotencyMiddleware_1 = require("../../middleware/idempotencyMiddleware");
const blockchainService_1 = require("../../services/blockchainService");
const logger_1 = require("../../utils/logger");
const router = (0, express_1.Router)();
// Import required services
const webhookService_1 = require("../../services/webhookService");
const queueService_1 = require("../../services/queueService");
// Initialize services
let blockchainService;
let webhookService;
let queueService;
// This would be properly initialized in a real application
// For now, we'll initialize it when it's needed
const getBlockchainService = () => {
    if (!blockchainService) {
        // Initialize dependent services first
        if (!webhookService) {
            webhookService = new webhookService_1.WebhookService(queueService || new queueService_1.QueueService());
        }
        if (!queueService) {
            queueService = new queueService_1.QueueService();
        }
        // Initialize blockchain service with proper dependencies
        blockchainService = new blockchainService_1.BlockchainService(webhookService, queueService);
    }
    return blockchainService;
};
/**
 * @route POST /api/v1/addresses
 * @desc Generate a new payment address
 * @access Private (Merchant)
 */
router.post('/', merchantAuthMiddleware_1.merchantAuthMiddleware, idempotencyMiddleware_1.idempotencyMiddleware, [
    (0, express_validator_1.body)('expectedAmount').optional().isFloat({ min: 0.01 }).toFloat(),
    (0, express_validator_1.body)('metadata').optional().isObject(),
    (0, express_validator_1.body)('callbackUrl').optional().isURL(),
    (0, express_validator_1.body)('expiresIn').optional().isInt({ min: 300, max: 86400 }).toInt() // 5 minutes to 24 hours
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant ID is required', true));
    }
    const { expectedAmount, metadata, callbackUrl } = req.body;
    try {
        // Generate a new payment address
        const blockchainService = getBlockchainService();
        const paymentAddress = await blockchainService.generatePaymentAddress(merchantId, expectedAmount, metadata);
        // Set callback URL if provided
        if (callbackUrl) {
            paymentAddress.callbackUrl = callbackUrl;
            // Save the updated address
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            await paymentAddressRepository.save(paymentAddress);
        }
        // Set custom expiration if provided
        if (req.body.expiresIn) {
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + req.body.expiresIn);
            paymentAddress.expiresAt = expiresAt;
            // Save the updated address
            const connection = await (0, connection_1.getConnection)();
            const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
            await paymentAddressRepository.save(paymentAddress);
        }
        res.status(201).json({
            success: true,
            data: {
                id: paymentAddress.id,
                address: paymentAddress.address,
                expectedAmount: paymentAddress.expectedAmount,
                currency: paymentAddress.currency,
                expiresAt: paymentAddress.expiresAt,
                metadata: paymentAddress.metadata
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error generating payment address', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to generate payment address', true));
    }
}));
/**
 * @route GET /api/v1/addresses
 * @desc Get all payment addresses for a merchant
 * @access Private (Merchant)
 */
router.get('/', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('status').optional().isIn(Object.values(PaymentAddress_1.AddressStatus)),
    (0, express_validator_1.query)('type').optional().isIn(Object.values(PaymentAddress_1.AddressType))
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
        const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
        // Build query
        const queryBuilder = paymentAddressRepository.createQueryBuilder('address')
            .where('address.merchantId = :merchantId', { merchantId })
            .orderBy('address.createdAt', 'DESC')
            .skip(offset)
            .take(limit);
        // Apply filters
        if (req.query.status) {
            queryBuilder.andWhere('address.status = :status', { status: req.query.status });
        }
        if (req.query.type) {
            queryBuilder.andWhere('address.type = :type', { type: req.query.type });
        }
        // Execute query
        const [addresses, total] = await queryBuilder.getManyAndCount();
        // Remove sensitive data
        const sanitizedAddresses = addresses.map(address => {
            const { privateKey, ...sanitized } = address;
            return sanitized;
        });
        res.status(200).json({
            success: true,
            data: {
                addresses: sanitizedAddresses,
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
        logger_1.logger.error('Error fetching payment addresses', { error, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch payment addresses', true));
    }
}));
/**
 * @route GET /api/v1/addresses/:id
 * @desc Get a payment address by ID
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
    const addressId = req.params.id;
    try {
        const connection = await (0, connection_1.getConnection)();
        const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
        const address = await paymentAddressRepository.findOne({
            where: {
                id: addressId,
                merchantId
            }
        });
        if (!address) {
            return next(new errorHandler_1.ApiError(404, 'Payment address not found', true));
        }
        // Remove sensitive data
        const { privateKey, ...sanitizedAddress } = address;
        res.status(200).json({
            success: true,
            data: sanitizedAddress
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching payment address', { error, addressId, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch payment address', true));
    }
}));
/**
 * @route GET /api/v1/addresses/:address/balance
 * @desc Get the balance of a payment address
 * @access Private (Merchant)
 */
router.get('/:address/balance', merchantAuthMiddleware_1.merchantAuthMiddleware, [
    (0, express_validator_1.param)('address').matches(/^0x[a-fA-F0-9]{40}$/).withMessage('Invalid Ethereum address format')
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const merchantId = req.merchant?.id;
    if (!merchantId) {
        return next(new errorHandler_1.ApiError(401, 'Merchant ID is required', true));
    }
    const address = req.params.address;
    try {
        const connection = await (0, connection_1.getConnection)();
        const paymentAddressRepository = connection.getRepository(PaymentAddress_1.PaymentAddress);
        // Verify the address belongs to the merchant
        const paymentAddress = await paymentAddressRepository.findOne({
            where: {
                address,
                merchantId
            }
        });
        if (!paymentAddress) {
            return next(new errorHandler_1.ApiError(404, 'Payment address not found', true));
        }
        // Get the balance from the blockchain
        const blockchainService = getBlockchainService();
        const balance = await blockchainService.getUsdtBalance(address);
        // Convert to decimal
        const decimals = 18; // USDT on BSC has 18 decimals
        const balanceDecimal = parseFloat(balance.toString()) / Math.pow(10, decimals);
        res.status(200).json({
            success: true,
            data: {
                address,
                balance: balanceDecimal,
                currency: 'USDT'
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching address balance', { error, address, merchantId });
        next(new errorHandler_1.ApiError(500, 'Failed to fetch address balance', true));
    }
}));
exports.default = router;
//# sourceMappingURL=address.routes.js.map