import Joi from 'joi';

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

const faqSchema = Joi.object({
    question: Joi.string().trim().allow('').optional(),
    answer: Joi.string().trim().allow('').optional(),
});

const variantSchema = Joi.object({
    sizes: Joi.array().items(Joi.string().trim()).optional(),
    colors: Joi.array().items(Joi.string().trim()).optional(),
    materials: Joi.array().items(Joi.string().trim()).optional(),
    attributes: Joi.array().items(
        Joi.object({
            name: Joi.string().trim().allow('').optional(),
            values: Joi.array().items(Joi.string().trim()).optional(),
        })
    ).optional(),
    prices: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    stockMap: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    imageMap: Joi.object().pattern(Joi.string(), Joi.string().allow('')).optional(),
    defaultVariant: Joi.object({
        size: Joi.string().trim().allow('').optional(),
        color: Joi.string().trim().allow('').optional(),
    }).optional(),
    defaultSelection: Joi.object().optional(),
}).optional();

const productBaseSchema = {
    name: Joi.string().trim().min(2).max(200),
    description: Joi.string().allow('').optional(),
    price: Joi.number().min(0),
    originalPrice: Joi.number().min(0).allow(null).optional(),
    unit: Joi.string().trim().allow('').optional(),
    images: Joi.array().items(Joi.string().trim()).optional(),
    image: Joi.string().trim().allow('').optional(),
    categoryId: objectId,
    brandId: objectId.allow(null, '').optional(),
    vendorId: objectId.allow(null, '').optional(),
    stock: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').optional(),
    stockQuantity: Joi.number().integer().min(0).optional(),
    totalAllowedQuantity: Joi.number().integer().min(0).allow(null).optional(),
    minimumOrderQuantity: Joi.number().integer().min(1).allow(null).optional(),
    lowStockThreshold: Joi.number().integer().min(0).optional(),
    flashSale: Joi.boolean().optional(),
    isNewArrival: Joi.boolean().optional(),
    isFeatured: Joi.boolean().optional(),
    isActive: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    codAllowed: Joi.boolean().optional(),
    returnable: Joi.boolean().optional(),
    cancelable: Joi.boolean().optional(),
    taxIncluded: Joi.boolean().optional(),
    taxRate: Joi.number().min(0).max(100).optional(),
    warrantyPeriod: Joi.string().allow('').optional(),
    guaranteePeriod: Joi.string().allow('').optional(),
    hsnCode: Joi.string().allow('').optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    seoTitle: Joi.string().allow('').optional(),
    seoDescription: Joi.string().allow('').optional(),
    relatedProducts: Joi.array().items(objectId).optional(),
    faqs: Joi.array().items(faqSchema).optional(),
    variants: variantSchema,
    weight: Joi.number().min(1).required(),
    dimensions: Joi.object({
        length: Joi.number().min(1).required(),
        breadth: Joi.number().min(1).required(),
        height: Joi.number().min(1).required(),
    }).required(),
};

export const createProductSchema = Joi.object({
    ...productBaseSchema,
    name: productBaseSchema.name.required(),
    price: productBaseSchema.price.required(),
    categoryId: productBaseSchema.categoryId.required(),
    vendorId: objectId.optional(),
});

export const updateProductSchema = Joi.object(productBaseSchema).min(1);



export const categoryIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const createCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    description: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().uri().allow('').optional(),
    icon: Joi.string().trim().allow('').optional(),
    parentId: objectId.allow(null, '').optional(),
    order: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
});

export const updateCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).optional(),
    description: Joi.string().trim().allow('').optional(),
    image: Joi.string().trim().uri().allow('').optional(),
    icon: Joi.string().trim().allow('').optional(),
    parentId: objectId.allow(null, '').optional(),
    order: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
}).min(1);

export const reorderCategoriesSchema = Joi.object({
    categoryIds: Joi.array().items(objectId).min(1).required(),
});

export const brandIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const createBrandSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    logo: Joi.string().trim().allow('').optional(), // Allow non-uri strings (like uploaded paths)
    description: Joi.string().trim().allow('').optional(),
    website: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
    visibility: Joi.string().valid('global', 'private').optional(),
    ownerVendorId: objectId.allow(null, '').optional(),
    createdBy: Joi.string().valid('admin', 'vendor').optional(),
    ownershipType: Joi.string().valid('manufacturer', 'reseller', 'distributor', 'private_label').allow(null, '').optional(),
    country: Joi.string().trim().allow('').optional(),
});

export const updateBrandSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).optional(),
    logo: Joi.string().trim().allow('').optional(),
    description: Joi.string().trim().allow('').optional(),
    website: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
    visibility: Joi.string().valid('global', 'private').optional(),
    ownerVendorId: objectId.allow(null, '').optional(),
    createdBy: Joi.string().valid('admin', 'vendor').optional(),
    ownershipType: Joi.string().valid('manufacturer', 'reseller', 'distributor', 'private_label').allow(null, '').optional(),
    country: Joi.string().trim().allow('').optional(),
}).min(1);
