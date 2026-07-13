import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';
import { clearSettingsCache } from '../../../services/settingsService.js';

// GET /api/admin/settings/:key
export const getSettings = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const settings = await Settings.findOne({ key });
    
    if (!settings) {
        return res.status(200).json(new ApiResponse(200, { key, value: {} }, 'Settings not found, returning empty.'));
    }
    
    res.status(200).json(new ApiResponse(200, settings, 'Settings fetched.'));
});

// PUT /api/admin/settings/:key
export const updateSettings = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) throw new ApiError(400, 'Value is required.');

    // Validate settings parameters
    if (key === 'shipping') {
        const rate = Number(value.defaultShippingRate);
        const threshold = Number(value.freeShippingThreshold);
        if (Number.isNaN(rate) || rate < 0) {
            throw new ApiError(400, 'Default shipping rate must be a non-negative number.');
        }
        if (Number.isNaN(threshold) || threshold < 0) {
            throw new ApiError(400, 'Free shipping threshold must be a non-negative number.');
        }
    }

    if (key === 'payment') {
        if (value.paymentFees) {
            for (const [method, fee] of Object.entries(value.paymentFees)) {
                const num = Number(fee);
                if (Number.isNaN(num) || num < 0 || num > 100) {
                    throw new ApiError(400, `Payment fee for ${method} must be between 0% and 100%.`);
                }
            }
        }
    }

    const settings = await Settings.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
    );

    // Invalidate settings cache immediately
    clearSettingsCache();

    res.status(200).json(new ApiResponse(200, settings, 'Settings updated.'));
});

// GET /api/admin/settings
export const getAllSettings = asyncHandler(async (req, res) => {
    const settings = await Settings.find();
    const config = settings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
    }, {});
    
    res.status(200).json(new ApiResponse(200, config, 'All settings fetched.'));
});
