import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

// Global error handler — must be last middleware in Express
const errorHandler = (err, req, res, next) => {
    let error = err;

    // Wrap non-ApiError instances
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal Server Error';
        error = new ApiError(statusCode, message, error.errors || [], err.stack);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        error = new ApiError(409, `${field} already exists.`);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map((e) => ({
            field: e.path,
            message: e.message,
        }));
        error = new ApiError(400, 'Validation failed', errors);
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        error = new ApiError(400, `Invalid ${err.path}: ${err.value}`);
    }

    const response = {
        success: false,
        message: error.message,
        ...(error.errors?.length > 0 && { errors: error.errors }),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    };

    // Log the error using centralized logger
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
        logger.error(`${statusCode} - ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, {
            stack: error.stack,
            body: req.body,
            query: req.query,
            user: req.user ? req.user.id : null
        });
    } else {
        logger.warn(`${statusCode} - ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    }

    res.status(statusCode).json(response);
};

export default errorHandler;
