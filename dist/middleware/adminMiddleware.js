"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = void 0;
const errorHandler_1 = require("./errorHandler");
const User_1 = require("../db/entities/User");
/**
 * Middleware to check if the authenticated user has admin role
 * Must be used after authMiddleware
 */
const adminMiddleware = async (req, res, next) => {
    try {
        // Check if user exists in request (should be attached by authMiddleware)
        if (!req.user) {
            return next(new errorHandler_1.ApiError(401, 'Authentication required', true));
        }
        // Check if user has admin role
        if (req.user.role !== User_1.UserRole.ADMIN) {
            return next(new errorHandler_1.ApiError(403, 'Admin access required', true));
        }
        // User is admin, proceed
        next();
    }
    catch (error) {
        return next(new errorHandler_1.ApiError(500, 'Admin authorization failed', true));
    }
};
exports.adminMiddleware = adminMiddleware;
//# sourceMappingURL=adminMiddleware.js.map