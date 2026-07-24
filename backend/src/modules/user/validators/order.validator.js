import Joi from 'joi';

export const placeOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required(),
            price: Joi.number().optional(),
            variant: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())).optional(),
        })
    ).min(1).required(),
    shippingAddress: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().required(),
        address: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        zipCode: Joi.string().required(),
        country: Joi.string().required(),
    }).required(),
    paymentMethod: Joi.string().valid('card', 'cash', 'cod', 'bank', 'wallet', 'upi').required(),
    couponCode: Joi.string().optional().allow(''),
    shippingOption: Joi.string().valid('standard', 'express').default('standard'),
});

export const createReturnRequestSchema = Joi.object({
    requestType: Joi.string().valid('return', 'exchange').default('return').optional(),
    exchangeDetails: Joi.object({
        requestedVariant: Joi.object({
            size: Joi.string().allow('').optional(),
            color: Joi.string().allow('').optional(),
        }).optional()
    }).optional(),
    returnReason: Joi.string().valid(
        "Wrong Size",
        "Wrong Color",
        "Received Wrong Variant",
        "Defective Product",
        "Wrong Product Received",
        "Product Damaged",
        "Quality Not As Expected",
        "Missing Parts or Accessories",
        "Product Not Matching Description",
        "Changed My Mind",
        "Other"
    ).required(),
    customReason: Joi.string().trim().allow("").optional(),
    vendorId: Joi.string().optional(),
    items: Joi.array()
        .items(
            Joi.object({
                productId: Joi.string().required(),
                quantity: Joi.number().integer().min(1).required(),
                reason: Joi.string().trim().max(300).allow('').optional(),
            })
        )
        .min(1)
        .optional(),
    itemsJson: Joi.string().optional(),
    images: Joi.any().optional(),
    refundMethod: Joi.string().valid('bank', 'upi').optional(),
    bankDetails: Joi.object({
        accountHolder: Joi.string().allow('').optional(),
        accountNumber: Joi.string().allow('').optional(),
        ifsc: Joi.string().allow('').optional(),
        bankName: Joi.string().allow('').optional()
    }).optional(),
    upiId: Joi.string().allow('').optional(),
});

export const cancelVendorItemSchema = Joi.object({
    reason: Joi.string().required(),
    comment: Joi.string().trim().allow('').optional(),
});

