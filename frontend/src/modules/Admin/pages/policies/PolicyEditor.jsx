import { useState, useEffect } from 'react';
import { FiSave, FiFileText } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../../../../shared/utils/api';

const PolicyEditor = ({ title, policyKey, defaultContent = '' }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await api.get(`/admin/policies/${policyKey}`);
        const data = response?.data ?? response;
        if (data?.content !== undefined && data?.content !== '') {
          setContent(data.content);
        } else {
          setContent(defaultContent);
        }
      } catch (err) {
        console.error(`Failed to load ${title}:`, err);
        setContent(defaultContent);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPolicy();
  }, [policyKey, defaultContent, title]);

  const handleSave = async () => {
    try {
      await api.put(`/admin/policies/${policyKey}`, { content });
      toast.success(`${title} saved successfully`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || `Failed to save ${title}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading {title}...</p>
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">{title}</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage your store's {title.toLowerCase()}</p>
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
          <h3 className="font-semibold text-gray-800">{title} Content</h3>
        </div>
        <div className="bg-white ql-editor-container">
          <ReactQuill
            theme="snow"
            value={content}
            onChange={setContent}
            placeholder={`Enter ${title} content here...`}
            className="h-[500px] mb-12"
            modules={{
              toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'clean']
              ]
            }}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default PolicyEditor;
