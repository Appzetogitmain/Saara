import { useState, useEffect } from 'react';
import { FiSave, FiCreditCard, FiTruck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';
import { getCompanyPaymentSettings, updateCompanyPaymentSettings } from '../../services/adminService';

const PaymentShippingSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [paymentData, setPaymentData] = useState({});
  const [shippingData, setShippingData] = useState({});
  const [activeSection, setActiveSection] = useState('payment');
  const [companyPaymentData, setCompanyPaymentData] = useState({
    upiId: '',
    accountName: '',
    accountNumber: '',
    bankName: '',
    ifscCode: ''
  });

  useEffect(() => {
    initialize();
    if (settings) {
      if (settings.payment) setPaymentData(settings.payment);
      if (settings.shipping) setShippingData(settings.shipping);
    }

    // Load company payment settings from database
    const loadCompanySettings = async () => {
      try {
        const res = await getCompanyPaymentSettings();
        const data = res?.data ?? res ?? {};
        if (data.value) {
          setCompanyPaymentData(data.value);
        }
      } catch (err) {
        console.error('Failed to load company payment settings', err);
      }
    };
    loadCompanySettings();
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.payment) setPaymentData(settings.payment);
      if (settings.shipping) setShippingData(settings.shipping);
    }
  }, [settings]);

  const handlePaymentChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPaymentData({
      ...paymentData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleShippingChange = (e) => {
    const { name, value } = e.target;
    setShippingData({
      ...shippingData,
      [name]: value,
    });
  };

  const handleCompanyChange = (e) => {
    const { name, value } = e.target;
    setCompanyPaymentData({
      ...companyPaymentData,
      [name]: value,
    });
  };

  const handlePaymentFeeChange = (method, fee) => {
    setPaymentData({
      ...paymentData,
      paymentFees: {
        ...paymentData.paymentFees,
        [method]: parseFloat(fee) || 0,
      },
    });
  };

  const handleShippingMethodToggle = (method) => {
    const methods = shippingData.shippingMethods || [];
    if (methods.includes(method)) {
      setShippingData({
        ...shippingData,
        shippingMethods: methods.filter((m) => m !== method),
      });
    } else {
      setShippingData({
        ...shippingData,
        shippingMethods: [...methods, method],
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateSettings('payment', paymentData, true);
      await updateSettings('shipping', shippingData, true);
      await updateCompanyPaymentSettings(companyPaymentData);
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save settings');
    }
  };

  const sections = [
    { id: 'payment', label: 'Payment Methods', icon: FiCreditCard },
    { id: 'shipping', label: 'Shipping Settings', icon: FiTruck },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Payment & Shipping</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure payment methods and shipping options</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${activeSection === section.id
                      ? 'border-primary-600 text-primary-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Payment Section */}
          {activeSection === 'payment' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods</h3>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="codEnabled"
                        checked={paymentData.codEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Cash on Delivery (COD)</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.cod || 0}
                        onChange={(e) => handlePaymentFeeChange('cod', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="cardEnabled"
                        checked={paymentData.cardEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Credit/Debit Card</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.card || 2.5}
                        onChange={(e) => handlePaymentFeeChange('card', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="walletEnabled"
                        checked={paymentData.walletEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Digital Wallet</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.wallet || 1.5}
                        onChange={(e) => handlePaymentFeeChange('wallet', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="upiEnabled"
                        checked={paymentData.upiEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">UPI</span>
                    </div>
                    <div className="flex items-center gap-2 sm:ml-4">
                      <label className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Fee (%):</label>
                      <input
                        type="number"
                        value={paymentData.paymentFees?.upi || 0.5}
                        onChange={(e) => handlePaymentFeeChange('upi', e.target.value)}
                        step="0.1"
                        min="0"
                        max="10"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>


              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Company Payout Collection Details (COD Settlements)</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Company UPI ID</label>
                      <input
                        type="text"
                        name="upiId"
                        value={companyPaymentData.upiId || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. pay@company.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Account Holder Name</label>
                      <input
                        type="text"
                        name="accountName"
                        value={companyPaymentData.accountName || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. COMPANY LOGISTICS PVT LTD"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number</label>
                      <input
                        type="text"
                        name="accountNumber"
                        value={companyPaymentData.accountNumber || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. 50200012345678"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono text-gray-800 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name</label>
                      <input
                        type="text"
                        name="bankName"
                        value={companyPaymentData.bankName || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. HDFC Bank"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold text-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">IFSC Code</label>
                      <input
                        type="text"
                        name="ifscCode"
                        value={companyPaymentData.ifscCode || ''}
                        onChange={handleCompanyChange}
                        placeholder="e.g. HDFC0000103"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono text-gray-800 font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shipping Section */}
          {activeSection === 'shipping' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Free Shipping Threshold
                  </label>
                  <input
                    type="number"
                    name="freeShippingThreshold"
                    value={shippingData.freeShippingThreshold || 100}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Free shipping for orders above this amount</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Default Shipping Rate
                  </label>
                  <input
                    type="number"
                    name="defaultShippingRate"
                    value={shippingData.defaultShippingRate || 5}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default shipping cost</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Shipping Methods</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('standard') || false}
                      onChange={() => handleShippingMethodToggle('standard')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Standard Shipping</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('express') || false}
                      onChange={() => handleShippingMethodToggle('express')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Express Shipping</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
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

export default PaymentShippingSettings;

