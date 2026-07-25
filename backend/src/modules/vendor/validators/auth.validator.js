import Joi from 'joi';

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().trim().required(),
    storeName: Joi.string().trim().min(2).max(100).required(),
    storeDescription: Joi.string().trim().max(500).allow('').optional(),
    address: Joi.object({
        street: Joi.string().trim().min(2).required().messages({
            'any.required': 'Street Address is required.',
            'string.empty': 'Street Address is required.',
        }),
        city: Joi.string().trim().min(2).required().messages({
            'any.required': 'City is required.',
            'string.empty': 'City is required.',
        }),
        state: Joi.string().trim().min(2).required().messages({
            'any.required': 'State is required.',
            'string.empty': 'State is required.',
        }),
        zipCode: Joi.string().trim().min(2).required().messages({
            'any.required': 'Zip Code is required.',
            'string.empty': 'Zip Code is required.',
        }),
        country: Joi.string().trim().min(2).required().messages({
            'any.required': 'Country is required.',
            'string.empty': 'Country is required.',
        }),
    }).required().messages({
        'any.required': 'Business Address is required.',
    }),
    documents: Joi.object({
        license: Joi.string().allow('').optional(),
        identity: Joi.string().allow('').optional(),
    }).optional(),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const verifyOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const resendOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const verifyResetOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Confirm password must match password.',
    }),
});
