import React, { useState, useEffect } from 'react';
import api from '../../../shared/utils/api';
import { FiSettings, FiCheckCircle, FiXCircle, FiSave, FiAlertCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

const LogisticsSettings = () => {
    const [providers, setProviders] = useState([]);
    const [engineWeights, setEngineWeights] = useState({ serviceability: 50, eta: 20, margin: 20, reliability: 10 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchProviders(), fetchEngineConfig()]);
            setLoading(false);
        };
        loadData();
    }, []);

    const fetchProviders = async () => {
        try {
            const res = await api.get('/admin/logistics/providers');
            setProviders(res.data);
        } catch (error) {
            console.error('Error fetching providers:', error);
            toast.error('Failed to load logistics providers');
        }
    };

    const fetchEngineConfig = async () => {
        try {
            const res = await api.get('/admin/logistics/engine-config');
            if (res.data) setEngineWeights(res.data);
        } catch (error) {
            console.error('Error fetching engine config:', error);
            toast.error('Failed to load global engine weights');
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

    const handleProviderChange = (providerId, field, value, subField = null) => {
        setProviders(prev => prev.map(p => {
            if (p.providerId === providerId) {
                if (subField) {
                    return {
                        ...p,
                        [field]: {
                            ...p[field],
                            [subField]: value
                        }
                    };
                }
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
        return <div className="p-8 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div></div>;
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Logistics & Delivery Settings</h1>
                    <p className="text-gray-500 mt-1">Manage delivery providers, API keys, and routing algorithms.</p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Global Engine Settings Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center">
                        <FiSettings className="text-gray-500 text-xl mr-3" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800">Global Engine Weights</h3>
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
                                    {key === 'serviceability' && 'The importance of the provider being able to deliver to the destination pincode.'}
                                    {key === 'eta' && 'The importance of delivering the order quickly (Estimated Time of Arrival).'}
                                    {key === 'margin' && 'The importance of keeping shipping costs low for better profit margins.'}
                                    {key === 'reliability' && 'The importance of the provider\'s historical success rate.'}
                                </p>
                            </div>
                        ))}
                    </div>
                    
                    {/* Validation Message */}
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

                {providers.map(provider => (
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
                            {/* Left Column: Basic & Engine Config */}
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
                                    <p className="text-xs text-gray-500 mt-1">Used to break ties between providers with the same score.</p>
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
