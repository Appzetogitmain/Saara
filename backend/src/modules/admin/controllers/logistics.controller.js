import LogisticsProvider from '../../../models/LogisticsProvider.model.js';
import AppConfig from '../../../models/AppConfig.model.js';
import DeliveryRateConfig from '../../../models/DeliveryRateConfig.model.js';
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

/**
 * @desc    Get all delivery rate configs
 * @route   GET /api/v1/admin/logistics/rate-configs
 * @access  Private/Admin
 */
export const getRateConfigs = asyncHandler(async (req, res) => {
    let configs = await DeliveryRateConfig.find({ isActive: true }).sort({ vehicleType: 1 });
    
    // Ensure default config exists for 'all' if none present
    if (!configs || configs.length === 0) {
        const defaultConfig = await DeliveryRateConfig.create({
            vehicleType: 'all',
            basePayAmount: 50,
            baseDistanceKm: 5,
            perKmRate: 5,
            maximumPayAmount: 500,
            nightCharge: { enabled: false, startHour: 22, endHour: 6, additionalAmount: 20 },
            peakHourCharge: { enabled: false, windows: [{ startHour: 12, endHour: 15, additionalAmount: 15 }] },
            rainCharge: { enabled: false, additionalAmount: 25 },
            isRainModeActive: false,
        });
        configs = [defaultConfig];
    }

    res.status(200).json(new ApiResponse(200, configs, 'Delivery rate configs fetched successfully.'));
});

/**
 * @desc    Update or create a delivery rate config for a vehicle type
 * @route   PUT /api/v1/admin/logistics/rate-configs/:vehicleType
 * @access  Private/Admin
 */
export const updateRateConfig = asyncHandler(async (req, res) => {
    const { vehicleType } = req.params;
    const {
        basePayAmount,
        baseDistanceKm,
        perKmRate,
        maximumPayAmount,
        nightCharge,
        peakHourCharge,
        rainCharge,
        isRainModeActive,
        notes
    } = req.body;

    const allowedVehicles = ['bike', 'scooter', 'van', 'truck', 'all'];
    if (!allowedVehicles.includes(vehicleType)) {
        return res.status(400).json(new ApiResponse(400, null, `Invalid vehicleType. Must be one of: ${allowedVehicles.join(', ')}`));
    }

    let config = await DeliveryRateConfig.findOne({ vehicleType, isActive: true });

    if (!config) {
        config = new DeliveryRateConfig({
            vehicleType,
            createdBy: req.user?._id,
        });
    }

    if (basePayAmount !== undefined) config.basePayAmount = Math.max(0, Number(basePayAmount));
    if (baseDistanceKm !== undefined) config.baseDistanceKm = Math.max(0, Number(baseDistanceKm));
    if (perKmRate !== undefined) config.perKmRate = Math.max(0, Number(perKmRate));
    if (maximumPayAmount !== undefined) config.maximumPayAmount = Math.max(0, Number(maximumPayAmount));
    
    if (nightCharge) {
        config.nightCharge = {
            enabled: Boolean(nightCharge.enabled),
            startHour: Number(nightCharge.startHour ?? 22),
            endHour: Number(nightCharge.endHour ?? 6),
            additionalAmount: Math.max(0, Number(nightCharge.additionalAmount ?? 0))
        };
    }

    if (peakHourCharge) {
        config.peakHourCharge = {
            enabled: Boolean(peakHourCharge.enabled),
            windows: Array.isArray(peakHourCharge.windows) ? peakHourCharge.windows : []
        };
    }

    if (rainCharge) {
        config.rainCharge = {
            enabled: Boolean(rainCharge.enabled),
            additionalAmount: Math.max(0, Number(rainCharge.additionalAmount ?? 0))
        };
    }

    if (isRainModeActive !== undefined) {
        config.isRainModeActive = Boolean(isRainModeActive);
        // Also sync isRainModeActive across all active rate configs
        await DeliveryRateConfig.updateMany({ isActive: true }, { $set: { isRainModeActive: Boolean(isRainModeActive) } });
    }

    if (notes !== undefined) config.notes = String(notes);

    await config.save();

    res.status(200).json(new ApiResponse(200, config, `Rate config for '${vehicleType}' updated successfully.`));
});

/**
 * @desc    Toggle live rain mode platform-wide
 * @route   PATCH /api/v1/admin/logistics/rate-configs/rain-mode
 * @access  Private/Admin
 */
export const toggleRainMode = asyncHandler(async (req, res) => {
    const { isRainModeActive } = req.body;
    const active = Boolean(isRainModeActive);

    await DeliveryRateConfig.updateMany({ isActive: true }, { $set: { isRainModeActive: active } });

    res.status(200).json(new ApiResponse(200, { isRainModeActive: active }, `Live Rain Mode is now ${active ? 'ACTIVE' : 'DISABLED'}.`));
});
