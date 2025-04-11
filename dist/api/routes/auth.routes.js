"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("../../middleware/errorHandler");
const config_1 = require("../../config");
const User_1 = require("../../db/entities/User");
const Merchant_1 = require("../../db/entities/Merchant");
const AuditLog_1 = require("../../db/entities/AuditLog");
const logger_1 = require("../../utils/logger");
const connection_1 = require("../../db/connection");
const router = (0, express_1.Router)();
/**
 * @route POST /api/v1/auth/register
 * @desc Register a new merchant account
 * @access Public
 */
router.post('/register', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }),
    (0, express_validator_1.body)('companyName').isString().trim().isLength({ min: 2 }),
    (0, express_validator_1.body)('contactName').isString().trim().isLength({ min: 2 }),
    (0, express_validator_1.body)('contactPhone').optional().isMobilePhone('any')
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const { email, password, companyName, contactName, contactPhone } = req.body;
    try {
        // Get database connection
        const connection = await (0, connection_1.getConnection)();
        const userRepository = connection.getRepository(User_1.User);
        const merchantRepository = connection.getRepository(Merchant_1.Merchant);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Check if user already exists
        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser) {
            return next(new errorHandler_1.ApiError(409, 'User already exists', true));
        }
        // Hash password
        const salt = await bcrypt_1.default.genSalt(10);
        const hashedPassword = await bcrypt_1.default.hash(password, salt);
        // Create user
        const user = new User_1.User();
        user.email = email;
        user.password = hashedPassword;
        user.firstName = contactName.split(' ')[0] || ''; // Extract first name from contact name
        user.lastName = contactName.split(' ').slice(1).join(' ') || ''; // Extract last name from contact name
        user.role = User_1.UserRole.VIEWER; // Use enum value instead of string
        const savedUser = await userRepository.save(user);
        // Create merchant profile
        const merchant = new Merchant_1.Merchant();
        merchant.businessName = companyName; // Using businessName instead of companyName
        merchant.email = email;
        merchant.phone = contactPhone || '';
        merchant.status = Merchant_1.MerchantStatus.PENDING; // Use enum value instead of string
        merchant.createdBy = savedUser;
        const savedMerchant = await merchantRepository.save(merchant);
        // Log the registration
        const auditLog = new AuditLog_1.AuditLog();
        auditLog.action = AuditLog_1.AuditLogAction.CREATE;
        auditLog.entityType = AuditLog_1.AuditLogEntityType.USER;
        auditLog.entityId = savedUser.id;
        auditLog.description = `New merchant registration: ${email}`;
        auditLog.previousState = null;
        auditLog.newState = { email, businessName: companyName };
        auditLog.userId = savedUser.id;
        await auditLogRepository.save(auditLog);
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, config_1.config.security.jwtSecret, { expiresIn: config_1.config.security.jwtExpiresIn });
        res.status(201).json({
            message: 'Registration successful',
            token,
            user: {
                id: savedUser.id,
                email: savedUser.email,
                role: savedUser.role,
                merchant: {
                    id: savedMerchant.id,
                    companyName: savedMerchant.businessName,
                    status: savedMerchant.status
                }
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Registration error:', error);
        return next(new errorHandler_1.ApiError(500, 'Registration failed', true));
    }
}));
/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user & get token
 * @access Public
 */
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 })
], (0, errorHandler_1.asyncHandler)(async (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return next(new errorHandler_1.ApiError(400, 'Validation error', true));
    }
    const { email, password } = req.body;
    try {
        // Get database connection
        const connection = await (0, connection_1.getConnection)();
        const userRepository = connection.getRepository(User_1.User);
        const auditLogRepository = connection.getRepository(AuditLog_1.AuditLog);
        // Check if user exists
        const user = await userRepository.findOne({
            where: { email },
            relations: ['merchant']
        });
        if (!user) {
            return next(new errorHandler_1.ApiError(401, 'Invalid credentials', true));
        }
        // Check password
        const isMatch = await bcrypt_1.default.compare(password, user.password);
        if (!isMatch) {
            return next(new errorHandler_1.ApiError(401, 'Invalid credentials', true));
        }
        // Log the login
        const auditLog = new AuditLog_1.AuditLog();
        auditLog.action = AuditLog_1.AuditLogAction.LOGIN;
        auditLog.entityType = AuditLog_1.AuditLogEntityType.USER;
        auditLog.entityId = user.id;
        auditLog.description = `User login: ${email}`;
        auditLog.previousState = null;
        auditLog.newState = { email };
        auditLog.userId = user.id;
        await auditLogRepository.save(auditLog);
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, config_1.config.security.jwtSecret, { expiresIn: config_1.config.security.jwtExpiresIn });
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                merchant: user.merchant ? {
                    id: user.merchant.id,
                    companyName: user.merchant.businessName,
                    status: user.merchant.status
                } : null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Login error:', error);
        return next(new errorHandler_1.ApiError(500, 'Login failed', true));
    }
}));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map