"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.notFoundHandler = exports.errorHandler = exports.ApiError = void 0;
const logger_1 = require("../utils/logger");
// Custom error class for API errors
class ApiError extends Error {
    constructor(statusCode, message, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ApiError = ApiError;
// Error handler middleware
const errorHandler = (err, req, res, next) => {
    // Log the error
    logger_1.logger.error(`${err.name}: ${err.message}`, {
        error: err,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        requestId: req.headers['x-request-id'] || 'unknown'
    });
    // Default error values
    let statusCode = 500;
    let message = 'Internal Server Error';
    let errorCode = 'INTERNAL_ERROR';
    let isOperational = false;
    // If it's our ApiError, use its values
    if (err instanceof ApiError) {
        statusCode = err.statusCode;
        message = err.message;
        isOperational = err.isOperational;
        // Map status code to error code
        switch (statusCode) {
            case 400:
                errorCode = 'BAD_REQUEST';
                break;
            case 401:
                errorCode = 'UNAUTHORIZED';
                break;
            case 403:
                errorCode = 'FORBIDDEN';
                break;
            case 404:
                errorCode = 'NOT_FOUND';
                break;
            case 409:
                errorCode = 'CONFLICT';
                break;
            case 422:
                errorCode = 'VALIDATION_ERROR';
                break;
            case 429:
                errorCode = 'TOO_MANY_REQUESTS';
                break;
            default: errorCode = 'INTERNAL_ERROR';
        }
    }
    else if (err.name === 'ValidationError') {
        // Handle validation errors (e.g., from Joi or express-validator)
        statusCode = 422;
        message = err.message;
        errorCode = 'VALIDATION_ERROR';
        isOperational = true;
    }
    else if (err.name === 'JsonWebTokenError') {
        // Handle JWT errors
        statusCode = 401;
        message = 'Invalid token';
        errorCode = 'INVALID_TOKEN';
        isOperational = true;
    }
    else if (err.name === 'TokenExpiredError') {
        // Handle JWT expiration
        statusCode = 401;
        message = 'Token expired';
        errorCode = 'TOKEN_EXPIRED';
        isOperational = true;
    }
    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            code: errorCode,
            message: message,
            // Only include stack trace in development
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        },
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    });
    // If error is not operational (i.e., a programming error), we might want to crash the process
    // in production and let the process manager restart it
    if (!isOperational && process.env.NODE_ENV === 'production') {
        // Give time for the response to be sent before potentially exiting
        process.nextTick(() => {
            logger_1.logger.error('Non-operational error occurred. Exiting process.', { error: err });
            // In a real production environment, you might want to exit and let a process manager restart
            // process.exit(1);
            // For now, we'll just log it as error but not exit
        });
    }
};
exports.errorHandler = errorHandler;
// 404 handler middleware
const notFoundHandler = (req, res, next) => {
    const error = new ApiError(404, `Resource not found - ${req.originalUrl}`);
    next(error);
};
exports.notFoundHandler = notFoundHandler;
// Async handler to catch errors in async route handlers
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map