import rateLimit from 'express-rate-limit';

const isDevelopment = process.env.NODE_ENV === 'development';

// General API rate limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
    skip: (req) => {
        if (isDevelopment) return true;
        // Skip limiting for admin routes to ensure internal operations are not impacted
        return req.originalUrl.startsWith('/api/admin');
    }
});

// Strict limiter for auth endpoints (login, register, forgot-password)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts, please try again in 15 minutes.' },
    skip: () => isDevelopment
});

// OTP resend limiter
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3,
    message: { success: false, message: 'Too many OTP requests, please wait a minute.' },
    skip: () => isDevelopment
});

// OTP verification limiter (prevents brute-force)
export const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Matching the 10/15m auth spec
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification attempts, please try again in 15 minutes.' },
    skip: () => isDevelopment
});
