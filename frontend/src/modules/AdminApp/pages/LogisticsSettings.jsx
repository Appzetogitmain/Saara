import React, { useState, useEffect } from 'react';
import api from '../../../shared/utils/api';
import { FiSettings, FiCheckCircle, FiXCircle, FiSave, FiAlertCircle, FiDollarSign, FiCloudRain, FiMoon, FiTruck, FiActivity } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

const VEHICLE_TYPES = [
    { id: 'all', label: 'All Vehicles (Default)' },
    { id: 'bike', label: 'Bike' },
    { id: 'scooter', label: 'Scooter' },
    { id: 'van', label: 'Van' },
    { id: 'truck', label: 'Truck' },
];

const DEFAULT_RATE_CONFIG = {
    vehicleType: 'all',
    basePayAmount: 50,
    baseDistanceKm: 5,
    perKmRate: 5,
    maximumPayAmount: 500,
    nightCharge: { enabled: false, startHour: 22, endHour: 6, additionalAmount: 20 },
    peakHourCharge: { enabled: false, windows: [{ startHour: 12, endHour: 15, additionalAmount: 15 }] },
    rainCharge: { enabled: false, additionalAmount: 25 },
    isRainModeActive: false,
    notes: '',
};

const LogisticsSettings = () => {
    const [providers, setProviders] = useState([]);
    const [engineWeights, setEngineWeights] = useState({ serviceability: 50, eta: 20, margin: 20, reliability: 10 });
    const [rateConfigs, setRateConfigs] = useState({});
    const [activeVehicleTab, setActiveVehicleTab] = useState('all');
    const [isRainModeActive, setIsRainModeActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingRate, setSavingRate] = useState(false);
    const [togglingRain, setTogglingRain] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchProviders(), fetchEngineConfig(), fetchRateConfigs()]);
            setLoading(false);
        };
        loadData();
    }, []);

    const fetchProviders = async () => {
        try {
            const res = await api.get('/admin/logistics/providers');
            const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : (res?.providers || []));
            setProviders(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error('Error fetching providers:', error);
            setProviders([]);
            toast.error('Failed to load logistics providers');
        }
    };

    const fetchEngineConfig = async () => {
        try {
            const res = await api.get('/admin/logistics/engine-config');
            const data = res?.value || res?.data || res || {};
            if (data && typeof data === 'object') setEngineWeights(data);
        } catch (error) {
            console.error('Error fetching engine config:', error);
            toast.error('Failed to load global engine weights');
        }
    };

    const fetchRateConfigs = async () => {
        try {
            const res = await api.get('/admin/logistics/rate-configs');
            const configsList = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            const map = {};
            VEHICLE_TYPES.forEach(v => {
                map[v.id] = { ...DEFAULT_RATE_CONFIG, vehicleType: v.id };
            });
            let rainActive = false;
            configsList.forEach(c => {
                map[c.vehicleType] = {
                    ...DEFAULT_RATE_CONFIG,
                    ...c,
                    nightCharge: { ...DEFAULT_RATE_CONFIG.nightCharge, ...(c.nightCharge || {}) },
                    rainCharge: { ...DEFAULT_RATE_CONFIG.rainCharge, ...(c.rainCharge || {}) },
                };
                if (c.isRainModeActive) rainActive = true;
            });
            setRateConfigs(map);
            setIsRainModeActive(rainActive);
        } catch (error) {
            console.error('Error fetching rate configs:', error);
            toast.error('Failed to load delivery rate configs');
        }
    };

    const handleToggleRainMode = async (active) => {
        try {
            setTogglingRain(true);
            await api.patch('/admin/logistics/rate-configs/rain-mode', { isRainModeActive: active });
            setIsRainModeActive(active);
            setRateConfigs(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(k => {
                    next[k] = { ...next[k], isRainModeActive: active };
                });
                return next;
            });
            toast.success(`Live Rain Mode is now ${active ? 'ACTIVE' : 'DISABLED'}`);
        } catch (error) {
            console.error('Error toggling rain mode:', error);
            toast.error('Failed to update Rain Mode');
        } finally {
            setTogglingRain(false);
        }
    };

    const handleRateChange = (vehicleType, field, value, subField = null) => {
        setRateConfigs(prev => {
            const current = prev[vehicleType] || { ...DEFAULT_RATE_CONFIG, vehicleType };
            if (subField) {
                return {
                    ...prev,
                    [vehicleType]: {
                        ...current,
                        [field]: {
                            ...(current[field] || {}),
                            [subField]: value
                        }
                    }
                };
            }
            return {
                ...prev,
                [vehicleType]: {
                    ...current,
                    [field]: value
                }
            };
        });
    };

    const handleSaveRateConfig = async (vehicleType) => {
        try {
            setSavingRate(true);
            const configToSave = rateConfigs[vehicleType] || { ...DEFAULT_RATE_CONFIG, vehicleType };
            await api.put(`/admin/logistics/rate-configs/${vehicleType}`, configToSave);
            toast.success(`Rate configuration for '${vehicleType}' saved successfully!`);
        } catch (error) {
            console.error('Error saving rate config:', error);
            toast.error(error.response?.data?.message || `Failed to save rate config for '${vehicleType}'`);
        } finally {
            setSavingRate(false);
        }
    };

    const handleSaveEngineWeights = async () => {
        try {
            setSaving(true);
            await api.put('/admin/logistics/engine-config', engineWeights);
            toast.success('Global engine weights updated successfully!');
        } catch (error) {
            console.error('Error updating engine weights:', error);
            toast.error(error.response?.data?.message || 'Failed to update global engine weights');
        } finally {
            setSaving(false);
        }
    };

    const handleProviderChange = (providerId, field, value) => {
        setProviders(prev => prev.map(p => {
            if (p.providerId === providerId) {
                return { ...p, [field]: value };
            }
            return p;
        }));
    };

    const handleSave = async (provider) => {
        try {
            setSaving(true);
            const payload = {
                isEnabled: provider.isEnabled,
                priority: provider.priority,
                reliabilityScore: provider.reliabilityScore,
            };
            await api.put(`/admin/logistics/providers/${provider.providerId}`, payload);
            toast.success(`${provider.displayName} settings updated successfully!`);
        } catch (error) {
            console.error('Error updating provider:', error);
            toast.error(`Failed to update ${provider.displayName}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
        );
    }

    const currentConfig = rateConfigs[activeVehicleTab] || { ...DEFAULT_RATE_CONFIG, vehicleType: activeVehicleTab };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Logistics & Delivery Settings</h1>
                    <p className="text-gray-500 mt-1">Manage delivery rate cards, rain surcharges, courier providers, and engine weights.</p>
                </div>
            </div>

            <div className="space-y-8">
                {/* Rain Mode Live Banner */}
                <div className={`rounded-xl p-6 border transition-all ${isRainModeActive ? 'bg-blue-900 text-white border-blue-700 shadow-md' : 'bg-white border-gray-200 text-gray-800 shadow-sm'}`}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center space-x-4">
                            <div className={`p-3 rounded-full ${isRainModeActive ? 'bg-blue-800 text-blue-200 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                                <FiCloudRain className="text-3xl" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    Live Rain Mode Surcharge
                                    {isRainModeActive && <span className="bg-green-500 text-white text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold">ACTIVE NOW</span>}
                                </h3>
                                <p className={`text-sm mt-1 ${isRainModeActive ? 'text-blue-200' : 'text-gray-500'}`}>
                                    Instantly apply bad-weather rain bonus surcharges to all active delivery boys platform-wide when it starts raining.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => handleToggleRainMode(!isRainModeActive)}
                            disabled={togglingRain}
                            className={`px-5 py-2.5 rounded-lg font-semibold flex items-center space-x-2 transition-all ${
                                isRainModeActive
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow'
                            }`}
                        >
                            <FiActivity />
                            <span>{isRainModeActive ? 'Disable Rain Mode' : 'Enable Rain Mode (Live)'}</span>
                        </button>
                    </div>
                </div>

                {/* Delivery Boy Rate Cards Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center">
                            <FiDollarSign className="text-emerald-600 text-xl mr-3" />
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Delivery Boy Rate Cards & Surcharges</h3>
                                <p className="text-sm text-gray-500">Configure base pay, distance rates, night bonuses, and rain surcharges per vehicle type.</p>
                            </div>
                        </div>
                    </div>

                    {/* Vehicle Type Tabs */}
                    <div className="flex border-b border-gray-200 px-6 pt-4 space-x-2 overflow-x-auto bg-gray-50/50">
                        {VEHICLE_TYPES.map(v => (
                            <button
                                key={v.id}
                                onClick={() => setActiveVehicleTab(v.id)}
                                className={`px-4 py-2.5 font-medium text-sm rounded-t-lg transition-colors border-b-2 flex items-center space-x-2 ${
                                    activeVehicleTab === v.id
                                        ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                <FiTruck className="text-base" />
                                <span>{v.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="p-6 space-y-8">
                        {/* Section 1: Base Payout Formula */}
                        <div>
                            <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
                                <FiDollarSign className="text-indigo-600" />
                                <span>Base Payout & Distance Formula</span>
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Base Pay Amount */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Base Pay Amount (₹)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                                        value={currentConfig.basePayAmount}
                                        onChange={(e) => handleRateChange(activeVehicleTab, 'basePayAmount', e.target.value)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                                        💡 <strong>Help:</strong> Guaranteed minimum earning given to the delivery boy for completing a delivery shipment.
                                    </p>
                                </div>

                                {/* Base Distance Km */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Base Distance Included (km)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                                        value={currentConfig.baseDistanceKm}
                                        onChange={(e) => handleRateChange(activeVehicleTab, 'baseDistanceKm', e.target.value)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                                        💡 <strong>Help:</strong> Maximum distance (in km) covered under the Base Pay amount. Extra distance fees start after this threshold.
                                    </p>
                                </div>

                                {/* Extra Per Km Rate */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Extra Distance Rate (₹ / km)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                                        value={currentConfig.perKmRate}
                                        onChange={(e) => handleRateChange(activeVehicleTab, 'perKmRate', e.target.value)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                                        💡 <strong>Help:</strong> Additional pay per kilometer added to the driver payout for distance travelled beyond the Base Distance.
                                    </p>
                                </div>

                                {/* Maximum Pay Amount Cap */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Maximum Payout Cap (₹)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="10"
                                        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-800"
                                        value={currentConfig.maximumPayAmount}
                                        onChange={(e) => handleRateChange(activeVehicleTab, 'maximumPayAmount', e.target.value)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                                        💡 <strong>Help:</strong> Maximum total payout allowed for a single delivery order to prevent excessive earnings on long trips.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Time & Weather Surcharges */}
                        <div>
                            <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
                                <FiMoon className="text-indigo-600" />
                                <span>Time & Weather Surcharges</span>
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Night Charge Settings */}
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center space-x-2">
                                            <FiMoon className="text-indigo-600" />
                                            <label className="font-semibold text-sm text-gray-800">Night Bonus Surcharge</label>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            checked={currentConfig.nightCharge?.enabled || false}
                                            onChange={(e) => handleRateChange(activeVehicleTab, 'nightCharge', e.target.checked, 'enabled')}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        💡 <strong>Help:</strong> Enable to give delivery boys an extra flat bonus during night delivery hours.
                                    </p>

                                    {currentConfig.nightCharge?.enabled && (
                                        <div className="grid grid-cols-3 gap-3 pt-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Start Hour (24h)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                                                    value={currentConfig.nightCharge?.startHour ?? 22}
                                                    onChange={(e) => handleRateChange(activeVehicleTab, 'nightCharge', parseInt(e.target.value), 'startHour')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">End Hour (24h)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                                                    value={currentConfig.nightCharge?.endHour ?? 6}
                                                    onChange={(e) => handleRateChange(activeVehicleTab, 'nightCharge', parseInt(e.target.value), 'endHour')}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Bonus (₹)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-full px-2.5 py-1.5 border rounded-md text-sm"
                                                    value={currentConfig.nightCharge?.additionalAmount ?? 20}
                                                    onChange={(e) => handleRateChange(activeVehicleTab, 'nightCharge', parseFloat(e.target.value), 'additionalAmount')}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Rain Charge Settings */}
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center space-x-2">
                                            <FiCloudRain className="text-blue-600" />
                                            <label className="font-semibold text-sm text-gray-800">Rain Bonus Surcharge Settings</label>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            checked={currentConfig.rainCharge?.enabled || false}
                                            onChange={(e) => handleRateChange(activeVehicleTab, 'rainCharge', e.target.checked, 'enabled')}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        💡 <strong>Help:</strong> Enable to configure the rain bonus amount (₹) added when Rain Mode is toggled ON.
                                    </p>

                                    {currentConfig.rainCharge?.enabled && (
                                        <div className="pt-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Rain Bonus Amount (₹)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full px-3 py-2 border rounded-md text-sm"
                                                value={currentConfig.rainCharge?.additionalAmount ?? 25}
                                                onChange={(e) => handleRateChange(activeVehicleTab, 'rainCharge', parseFloat(e.target.value), 'additionalAmount')}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Save Button */}
                    <div className="p-4 bg-gray-50 border-t flex justify-end">
                        <button
                            onClick={() => handleSaveRateConfig(activeVehicleTab)}
                            disabled={savingRate}
                            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow disabled:opacity-50"
                        >
                            <FiSave />
                            <span>Save Rate Card for '{activeVehicleTab}'</span>
                        </button>
                    </div>
                </div>

                {/* Global Engine Settings Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center">
                        <FiSettings className="text-gray-500 text-xl mr-3" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Global Routing Engine Weights</h3>
                            <p className="text-sm text-gray-500">Determines how the delivery engine evaluates all providers to pick the winner.</p>
                        </div>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        {Object.entries(engineWeights).map(([key, value]) => (
                            <div key={key} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-semibold text-gray-700 capitalize">{key}</label>
                                    <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded text-gray-700">{value}%</span>
                                </div>
                                <input 
                                    type="range"
                                    min="0"
                                    max="100"
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                    value={value}
                                    onChange={(e) => setEngineWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                                />
                                <p className="text-xs text-gray-500">
                                    💡 <strong>Help:</strong> {key === 'serviceability' && 'Importance of provider being able to deliver to the destination pincode.'}
                                    {key === 'eta' && 'Importance of delivering the order quickly (Estimated Time of Arrival).'}
                                    {key === 'margin' && 'Importance of keeping shipping costs low for better profit margins.'}
                                    {key === 'reliability' && 'Importance of the provider\'s historical delivery success rate.'}
                                </p>
                            </div>
                        ))}
                    </div>
                    
                    {Object.values(engineWeights).reduce((a, b) => a + b, 0) !== 100 && (
                        <div className="px-6 pb-2 text-red-500 text-sm font-medium">
                            Warning: The total sum of all weights is {Object.values(engineWeights).reduce((a, b) => a + b, 0)}%. It must be exactly 100% to save.
                        </div>
                    )}

                    <div className="p-4 bg-gray-50 border-t flex justify-end">
                        <button 
                            onClick={handleSaveEngineWeights}
                            disabled={saving || Object.values(engineWeights).reduce((a, b) => a + b, 0) !== 100}
                            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            <FiSave />
                            <span>Save Global Weights</span>
                        </button>
                    </div>
                </div>

                {/* Courier Providers Settings */}
                {(providers || []).map(provider => (
                    <div key={provider.providerId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <div className="flex items-center space-x-3">
                                {provider.isEnabled ? (
                                    <FiCheckCircle className="text-green-500 text-xl" />
                                ) : (
                                    <FiXCircle className="text-red-500 text-xl" />
                                )}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 capitalize">{provider.displayName}</h3>
                                    <p className="text-sm text-gray-500">ID: {provider.providerId}</p>
                                </div>
                            </div>
                            
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only" 
                                        checked={provider.isEnabled}
                                        onChange={(e) => handleProviderChange(provider.providerId, 'isEnabled', e.target.checked)}
                                    />
                                    <div className={`block w-14 h-8 rounded-full transition-colors ${provider.isEnabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${provider.isEnabled ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                                <span className="ml-3 text-sm font-medium text-gray-700">{provider.isEnabled ? 'Active' : 'Disabled'}</span>
                            </label>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-5">
                                <h4 className="font-semibold text-gray-700 border-b pb-2">Engine Rules</h4>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Priority (Lower is preferred)
                                    </label>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="100"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                        value={provider.priority}
                                        onChange={(e) => handleProviderChange(provider.providerId, 'priority', parseInt(e.target.value))}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">💡 <strong>Help:</strong> Used to break ties between providers with the same score.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Reliability Score (0-100)
                                    </label>
                                    <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                        value={provider.reliabilityScore}
                                        onChange={(e) => handleProviderChange(provider.providerId, 'reliabilityScore', parseInt(e.target.value))}
                                    />
                                </div>
                                
                                {provider.providerId !== 'own_fleet' && (
                                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex space-x-3">
                                        <FiAlertCircle className="text-yellow-500 mt-0.5 flex-shrink-0" />
                                        <p className="text-sm text-yellow-700">
                                            API credentials for {provider.displayName} are managed securely via server environment variables.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="p-4 bg-gray-50 border-t flex justify-end">
                            <button 
                                onClick={() => handleSave(provider)}
                                disabled={saving}
                                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                <FiSave />
                                <span>Save {provider.displayName} Settings</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LogisticsSettings;
