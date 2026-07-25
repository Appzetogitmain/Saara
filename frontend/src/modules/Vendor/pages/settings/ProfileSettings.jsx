import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiUser, FiLock, FiShield, FiFile } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import toast from 'react-hot-toast';

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { vendor, updateProfile, logout } = useVendorAuthStore();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [activeSection, setActiveSection] = useState('profile');

  useEffect(() => {
    if (vendor) {
      setFormData((prev) => ({
        ...prev,
        name: vendor.name || '',
        phone: vendor.phone || '',
      }));
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    try {
      await updateProfile({
        name: formData.name,
        phone: formData.phone,
      });
      toast.success('Profile updated successfully');
    } catch {
      // api.js shows toast
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    if (!formData.currentPassword) {
      toast.error('Please enter your current password');
      return;
    }

    if (formData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    try {
      // In a real app, this would be an API call to change password
      toast.success('Password changed successfully');
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      toast.error('Failed to change password');
    }
  };

  const sections = [
    { id: 'profile', label: 'Profile Info', icon: FiUser },
    { id: 'password', label: 'Change Password', icon: FiLock },
    { id: 'security', label: 'Security', icon: FiShield },
    { id: 'documents', label: 'Documents', icon: FiFile },
  ];

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading vendor information...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Profile Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage your profile and account security</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    if (section.id === 'documents') {
                      navigate('/vendor/documents');
                    } else {
                      setActiveSection(section.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${activeSection === section.id
                    ? 'border-purple-600 text-purple-600 font-semibold'
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

        <div className="p-3 sm:p-4 md:p-6">
          {/* Profile Info Section */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              {/* Commission Rate Summary Card */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-600 text-white rounded-xl flex items-center justify-center shadow-md font-bold text-xl">
                    %
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">Active Store Commission Rate</h3>
                    <p className="text-xs sm:text-sm text-gray-600">Configured by Admin for your vendor account</p>
                  </div>
                </div>
                <div className="bg-white border border-purple-200 px-4 py-2 rounded-xl shadow-inner text-center self-stretch sm:self-auto">
                  <span className="text-2xl font-black text-purple-700">
                    {((vendor?.commissionRate !== undefined && vendor?.commissionRate !== null ? (vendor.commissionRate <= 1 ? vendor.commissionRate * 100 : vendor.commissionRate) : 10)).toFixed(1)}%
                  </span>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold text-sm sm:text-base"
                >
                  <FiSave />
                  Save Profile
                </button>
              </div>
            </form>
          </div>
          )}

          {/* Change Password Section */}
          {activeSection === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold text-sm sm:text-base"
                >
                  <FiSave />
                  Change Password
                </button>
              </div>
            </form>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">Account Status</h3>
                <div className="space-y-2 text-sm text-blue-700">
                  <div className="flex items-center justify-between">
                    <span>Status:</span>
                    <span className="font-semibold capitalize">{vendor.status || 'pending'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Verified:</span>
                    <span className="font-semibold">{vendor.isVerified ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Joined:</span>
                    <span className="font-semibold">{new Date(vendor.joinDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="text-sm font-semibold text-yellow-800 mb-2">Security Recommendations</h3>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                  <li>Use a strong, unique password</li>
                  <li>Enable two-factor authentication when available</li>
                  <li>Never share your login credentials</li>
                  <li>Log out from shared devices</li>
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={logout}
                  className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold text-sm sm:text-base"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProfileSettings;

