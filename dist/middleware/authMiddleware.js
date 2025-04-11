"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const User_1 = require("../db/entities/User");
const errorHandler_1 = require("./errorHandler");
const logger_1 = require("../utils/logger");
/**
 * Middleware to authenticate users using JWT token
 * Verifies the token and attaches the user object to the request
 */
const authMiddleware = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new errorHandler_1.ApiError(401, 'No token provided', true));
        }
        const token = authHeader.split(' ')[1];
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.security.jwtSecret);
        // Check if user exists
        const connection = await (0, connection_1.getConnection)();
        const userRepository = connection.getRepository(User_1.User);
        const user = await userRepository.findOne({
            where: { id: decoded.id }
        });
        if (!user) {
            return next(new errorHandler_1.ApiError(401, 'User not found', true));
        }
        // Attach user to request
        req.user = user;
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
exports.authMiddleware = authMiddleware;
// Import getConnection at the end to avoid circular dependency
const connection_1 = require("../db/connection");
//# sourceMappingURL=authMiddleware.js.map