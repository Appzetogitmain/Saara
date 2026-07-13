import { useState, useEffect } from 'react';
import { FiSave, FiFileText } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';

const DEFAULT_CONTENT = `Refund Policy

Last updated: ${new Date().toLocaleDateString()}

1. Refund Eligibility
Items must be returned within 30 days of purchase in their original condition with tags attached.

2. Refund Process
To initiate a refund, please contact our customer service team. Refunds will be processed within 5-7 business days.

3. Non-Refundable Items
Certain items such as personalized products, digital goods, and perishable items are not eligible for refunds.

4. Return Shipping
Customers are responsible for return shipping costs unless the item was defective or incorrect.

5. Refund Methods
Refunds will be issued to the original payment method used for the purchase.`;

const RefundPolicy = () => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await api.get('/admin/policies/refund');
        const data = response?.data ?? response;
        if (data?.content !== undefined) {
          setContent(data.content);
        } else {
          setContent(DEFAULT_CONTENT);
        }
      } catch (err) {
        console.error('Failed to load refund policy:', err);
        setContent(DEFAULT_CONTENT);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPolicy();
  }, []);

  const handleSave = async () => {
    try {
      await api.put('/admin/policies/refund', { content });
      toast.success('Refund policy saved successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save refund policy');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading Refund Policy...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Refund Policy</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage your store's refund policy</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiSave />
          <span>Save Policy</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <FiFileText className="text-primary-600" />
          <h3 className="font-semibold text-gray-800">Refund Policy Content</h3>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
        />
      </div>
    </motion.div>
  );
};

export default RefundPolicy;

