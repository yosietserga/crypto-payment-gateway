"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.merchantAuthMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const User_1 = require("../db/entities/User");
const Merchant_1 = require("../db/entities/Merchant");
const errorHandler_1 = require("./errorHandler");
const logger_1 = require("../utils/logger");
const connection_1 = require("../db/connection");
/**
 * Middleware to authenticate merchants using JWT token
 * Verifies the token and attaches the merchant object to the request
 */
const merchantAuthMiddleware = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new errorHandler_1.ApiError(401, 'No token provided', true));
        }
        const token = authHeader.split(' ')[1];
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.security.jwtSecret);
        // Check if user exists and has merchant role
        const connection = await (0, connection_1.getConnection)();
        const userRepository = connection.getRepository(User_1.User);
        const merchantRepository = connection.getRepository(Merchant_1.Merchant);
        const user = await userRepository.findOne({
            where: { id: decoded.id },
            relations: ['merchant']
        });
        if (!user) {
            return next(new errorHandler_1.ApiError(401, 'User not found', true));
        }
        // Check if user has merchant access
        // Since we don't have a specific merchant role in the enum, we'll check if they're not an admin
        // In a real application, you might want to add a MERCHANT role to the UserRole enum
        if (user.role === User_1.UserRole.ADMIN) {
            // Admins can access merchant routes
        }
        else if (user.role !== User_1.UserRole.OPERATOR && user.role !== User_1.UserRole.VIEWER) {
            return next(new errorHandler_1.ApiError(403, 'Not authorized as merchant', true));
        }
        if (!user.merchant) {
            return next(new errorHandler_1.ApiError(403, 'Merchant profile not found', true));
        }
        // Attach user and merchant to request
        req.user = user;
        req.merchant = user.merchant;
        next();
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.name === 'JsonWebTokenError') {
                return next(new errorHandler_1.ApiError(401, 'Invalid token', true));
            }
            if (error.name === 'TokenExpiredError') {
                return next(new errorHandler_1.ApiError(401, 'Token expired', true));
            }
        }
        logger_1.logger.error('Authentication error:', error);
        return next(new errorHandler_1.ApiError(500, 'Authentication failed', true));
    }
};
exports.merchantAuthMiddleware = merchantAuthMiddleware;
//# sourceMappingURL=merchantAuthMiddleware.js.map