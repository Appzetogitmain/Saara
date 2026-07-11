import AuditLog from '../models/AuditLog.model.js';

// SEC-06: Fields to redact from audit log bodies to prevent PII/sensitive data leakage
const REDACTED_FIELDS = new Set([
    'password', 'confirmPassword', 'currentPassword', 'newPassword',
    'razorpaySignature', 'webhookSignature', 'otp', 'pin',
    'cardNumber', 'cvv', 'expiryDate',
    'aadhaarNumber', 'panNumber',
    'bankDetails', 'upiId', 'accountNumber', 'ifsc',
]);

/**
 * Recursively redacts sensitive fields from an object before logging.
 * @param {any} obj
 * @returns {any} sanitized copy
 */
const redactSensitive = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactSensitive);

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (REDACTED_FIELDS.has(key)) {
            result[key] = '[REDACTED]';
        } else if (value && typeof value === 'object') {
            result[key] = redactSensitive(value);
        } else {
            result[key] = value;
        }
    }
    return result;
};

export const audit = (action, resource) => {
    return async (req, res, next) => {
        // We capture the original res.json to log after the request completes successfully
        const originalJson = res.json;

        res.json = function (data) {
            // Only log successful administrative actions
            if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.id) {
                // SEC-06: Sanitize request body before logging — strip PII and secrets
                const sanitizedBody = req.method === 'GET'
                    ? undefined
                    : redactSensitive(req.body);

                const logData = {
                    adminId:    req.user.id,
                    action,
                    resource,
                    resourceId: req.params.id || data?.data?._id || data?.data?.id,
                    changes:    sanitizedBody,
                    ipAddress:  req.ip || req.headers['x-forwarded-for'],
                    userAgent:  req.headers['user-agent'],
                };
                // Log full context on audit failure so incidents can be forensically recovered
                AuditLog.create(logData).catch(err => {
                    console.error(
                        '[CRITICAL] Audit log write failed:',
                        err.message,
                        '| action:', action,
                        '| resource:', resource,
                        '| adminId:', req.user?.id,
                        '| data:', JSON.stringify(logData)
                    );
                });
            }
            return originalJson.call(this, data);
        };

        next();
    };
};
