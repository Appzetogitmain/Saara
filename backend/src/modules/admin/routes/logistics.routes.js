import { Router } from 'express';
import * as logisticsController from '../controllers/logistics.controller.js';
import { audit } from '../../../middlewares/audit.js';

const router = Router();

// Routes are mounted under /api/v1/admin/logistics (defined in admin.routes.js)

// Get all logistics providers
router.get('/providers', logisticsController.getAllProviders);

// Update a logistics provider
router.put('/providers/:providerId', audit('UPDATE_LOGISTICS_PROVIDER', 'LogisticsProvider'), logisticsController.updateProvider);

// Get and Update engine config
router.get('/engine-config', logisticsController.getEngineConfig);
router.put('/engine-config', audit('UPDATE_ENGINE_CONFIG', 'AppConfig'), logisticsController.updateEngineConfig);

// Delivery Rate Configs & Rain Mode
router.get('/rate-configs', logisticsController.getRateConfigs);
router.put('/rate-configs/:vehicleType', audit('UPDATE_DELIVERY_RATE_CONFIG', 'DeliveryRateConfig'), logisticsController.updateRateConfig);
router.patch('/rate-configs/rain-mode', audit('TOGGLE_RAIN_MODE', 'DeliveryRateConfig'), logisticsController.toggleRainMode);

export default router;
