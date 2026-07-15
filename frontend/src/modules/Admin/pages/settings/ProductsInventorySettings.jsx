import { useState, useEffect } from 'react';
import { FiSave, FiPackage, FiDollarSign } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';

const ProductsInventorySettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [productsData, setProductsData] = useState({});
  const [taxData, setTaxData] = useState({});

  useEffect(() => {
    initialize();
    if (settings) {
      if (settings.products) setProductsData(settings.products);
      if (settings.tax) setTaxData(settings.tax);
    }
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.products) setProductsData(settings.products);
      if (settings.tax) setTaxData(settings.tax);
    }
  }, [settings]);

  const handleProductsChange = (e) => {
    const { name, value } = e.target;
    setProductsData({
      ...productsData,
      [name]: value,
    });
  };

  const handleTaxChange = (e) => {
    const { name, value } = e.target;
    setTaxData({
      ...taxData,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings('products', productsData);
    updateSettings('tax', taxData);
    toast.success('Settings saved successfully');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Tax & Inventory Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure tax rates, pricing display, and low stock thresholds</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6 space-y-8">
          
          {/* Tax & Pricing Section */}
          <div>
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <FiDollarSign className="text-primary-600" />
              Tax & Pricing Rules
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Price Display Format
                </label>
                <AnimatedSelect
                  name="priceDisplayFormat"
                  value={taxData.priceDisplayFormat || 'INR'}
                  onChange={handleTaxChange}
                  options={[
                    { value: 'INR', label: 'INR (₹)' },
                    { value: 'USD', label: 'USD ($)' },
                    { value: 'EUR', label: 'EUR (€)' },
                    { value: 'GBP', label: 'GBP (£)' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Inventory Alerts Section */}
          <div>
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <FiPackage className="text-primary-600" />
              Inventory & Out of Stock Rules
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  name="lowStockThreshold"
                  value={productsData.lowStockThreshold || 10}
                  onChange={handleProductsChange}
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this number</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Out of Stock Behavior
                </label>
                <AnimatedSelect
                  name="outOfStockBehavior"
                  value={productsData.outOfStockBehavior || 'show'}
                  onChange={handleProductsChange}
                  options={[
                    { value: 'show', label: 'Show with "Out of Stock" message' },
                    { value: 'hide', label: 'Hide from listings' },
                  ]}
                />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Stock Alerts</h4>
                  <p className="text-xs text-gray-600">Send notifications when stock is low</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                  <input
                    type="checkbox"
                    name="stockAlertsEnabled"
                    checked={productsData.stockAlertsEnabled !== false}
                    onChange={(e) => setProductsData({ ...productsData, stockAlertsEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
            >
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default ProductsInventorySettings;

