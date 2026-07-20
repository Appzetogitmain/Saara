import { useState, useEffect } from 'react';
import { FiSave, FiPlus, FiTrash2, FiHelpCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';

const PREDEFINED_CATEGORIES = [
  'General',
  'Orders',
  'Shipping',
  'Returns & Refunds',
  'Payments',
  'Account',
  'Seller',
  'Offers & Coupons',
  'Technical Support',
  'Other'
];

const FAQPolicy = () => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await api.get('/admin/policies/faq');
        const data = response?.data ?? response;
        if (data?.items && Array.isArray(data.items)) {
          setItems(data.items);
        } else {
          setItems([{ question: 'How do I place an order?', answer: 'To place an order...' }]);
        }
      } catch (err) {
        console.error('Failed to load FAQ:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPolicy();
  }, []);

  const handleSave = async () => {
    try {
      // Validate
      const validItems = items.filter(item => item.question.trim() !== '' && item.answer.trim() !== '');
      if (validItems.length !== items.length) {
        toast.error("Please fill in all fields or remove empty questions.");
        return;
      }
      
      await api.put('/admin/policies/faq', { items: validItems });
      toast.success('FAQ saved successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save FAQ');
    }
  };

  const addQuestion = () => {
    setItems([...items, { category: 'General', question: '', answer: '' }]);
  };

  const removeQuestion = (index) => {
    const newItems = items.filter((_, idx) => idx !== index);
    setItems(newItems);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading FAQ...</p>
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Frequently Asked Questions</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage your store's FAQ</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiSave />
          <span>Save FAQ</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiHelpCircle className="text-primary-600" />
            <h3 className="font-semibold text-gray-800">Q&A List</h3>
          </div>
          <button
            onClick={addQuestion}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium"
          >
            <FiPlus />
            <span>Add Question</span>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {items.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              No questions added yet. Click "Add Question" to start.
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="relative p-6 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                <button
                  onClick={() => removeQuestion(idx)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove Question"
                >
                  <FiTrash2 />
                </button>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
                    <select
                      value={item.category || 'General'}
                      onChange={(e) => updateItem(idx, 'category', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      {PREDEFINED_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Question</label>
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) => updateItem(idx, 'question', e.target.value)}
                      placeholder="e.g. How do I track my order?"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 pr-12 text-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Answer</label>
                  <textarea
                    value={item.answer}
                    onChange={(e) => updateItem(idx, 'answer', e.target.value)}
                    rows={3}
                    placeholder="Provide a clear, helpful answer..."
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-y"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default FAQPolicy;
