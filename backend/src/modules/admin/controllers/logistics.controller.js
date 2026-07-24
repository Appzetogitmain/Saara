import LogisticsProvider from '../../../models/LogisticsProvider.model.js';
import AppConfig from '../../../models/AppConfig.model.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import asyncHandler from '../../../utils/asyncHandler.js';

/**
 * @desc    Get all logistics providers
 * @route   GET /api/v1/admin/logistics/providers
 * @access  Private/Admin
 */
export const getAllProviders = asyncHandler(async (req, res) => {
    // We select config because admin needs to see/edit it. (It is select: false by default in schema)
    const providers = await LogisticsProvider.find({}).select('+config').sort({ priority: 1 });
    res.status(200).json(new ApiResponse(200, providers, 'Logistics providers fetched successfully.'));
});

/**
 * @desc    Update a logistics provider
 * @route   PUT /api/v1/admin/logistics/providers/:providerId
 * @access  Private/Admin
 */
export const updateProvider = asyncHandler(async (req, res) => {
    const { providerId } = req.params;
    const { isEnabled, priority, reliabilityScore, scoringWeights, capabilities, config } = req.body;

    const provider = await LogisticsProvider.findOne({ providerId });
    if (!provider) {
        return res.status(404).json(new ApiResponse(404, null, 'Logistics provider not found.'));
    }

    // Update fields if provided
    if (isEnabled !== undefined) provider.isEnabled = isEnabled;
    if (priority !== undefined) provider.priority = priority;
    if (reliabilityScore !== undefined) provider.reliabilityScore = reliabilityScore;
    
    if (scoringWeights) {
        provider.scoringWeights = {
            ...provider.scoringWeights,
            ...scoringWeights
        };
    }
    
    if (capabilities) {
        provider.capabilities = {
            ...provider.capabilities,
            ...capabilities
        };
    }

    if (config) {
        provider.config = {
            ...(provider.config || {}),
            ...config
        };
    }

    await provider.save();

    // Re-fetch to apply defaults and hide what shouldn't be seen by default, but we'll return the full updated doc here
    const updatedProvider = await LogisticsProvider.findOne({ providerId }).select('+config');

    res.status(200).json(new ApiResponse(200, updatedProvider, 'Logistics provider updated successfully.'));
});

const DEFAULT_ENGINE_WEIGHTS = {
    serviceability: 50,
    eta: 20,
    margin: 20,
    reliability: 10
};

/**
 * @desc    Get global logistics engine config
 * @route   GET /api/v1/admin/logistics/engine-config
 * @access  Private/Admin
 */
export const getEngineConfig = asyncHandler(async (req, res) => {
    let config = await AppConfig.findOne({ key: 'logistics_engine' });
    if (!config) {
        config = await AppConfig.create({
            key: 'logistics_engine',
            value: DEFAULT_ENGINE_WEIGHTS
        });
    }
    res.status(200).json(new ApiResponse(200, config.value, 'Engine config fetched successfully.'));
});

/**
 * @desc    Update global logistics engine config
 * @route   PUT /api/v1/admin/logistics/engine-config
 * @access  Private/Admin
 */
export const updateEngineConfig = asyncHandler(async (req, res) => {
    const { serviceability, eta, margin, reliability } = req.body;
    
    // Validate they sum to exactly 100
    const total = Number(serviceability || 0) + Number(eta || 0) + Number(margin || 0) + Number(reliability || 0);
    if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json(new ApiResponse(400, null, 'Weights must sum up to 100.'));
    }

    let config = await AppConfig.findOne({ key: 'logistics_engine' });
    if (!config) {
        config = new AppConfig({ key: 'logistics_engine', value: DEFAULT_ENGINE_WEIGHTS });
    }

    config.value = {
        serviceability: Number(serviceability),
        eta: Number(eta),
        margin: Number(margin),
        reliability: Number(reliability)
    };

    await config.save();
    res.status(200).json(new ApiResponse(200, config.value, 'Engine config updated successfully.'));
});
