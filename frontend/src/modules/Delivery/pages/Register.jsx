import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiPhone, FiTruck, FiMapPin, FiFileText, FiChevronDown } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

const DeliveryRegister = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useDeliveryAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    vehicleType: 'Bike',
    vehicleNumber: '',
    password: '',
    confirmPassword: '',
    drivingLicense: null,
    aadharCard: null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'drivingLicense' || name === 'aadharCard') {
      setFormData((prev) => ({ ...prev, [name]: files?.[0] || null }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !formData.address || !formData.vehicleType || !formData.vehicleNumber || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!formData.drivingLicense || !formData.aadharCard) {
      toast.error('Driving License and Aadhar Card are required');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const result = await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        vehicleType: formData.vehicleType,
        vehicleNumber: formData.vehicleNumber.trim(),
        password: formData.password,
        drivingLicense: formData.drivingLicense,
        aadharCard: formData.aadharCard,
      });
      toast.success(result.message || 'Registration submitted');
      navigate('/delivery/login', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 flex items-center justify-center p-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 gradient-green rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-green">
            <FiTruck className="text-white text-2xl" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800 mb-2">Join as Delivery Partner</h1>
          <p className="text-gray-600">Register your account and wait for admin approval</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="John Doe" required className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="delivery@example.com" required className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiPhone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1234567890" required className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiMapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="City, State" required className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Vehicle Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative w-full">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Vehicle Type <span className="text-red-500">*</span></label>
                <button
                  type="button"
                  onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800 text-left transition-all"
                >
                  <span className="font-medium">{formData.vehicleType || 'Select Vehicle Type'}</span>
                  <FiChevronDown className={`text-gray-400 text-base flex-shrink-0 transition-transform ${vehicleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {vehicleDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      {['Bike', 'Scooter', 'Car', 'Van'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, vehicleType: type }));
                            setVehicleDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-primary-50 transition-colors ${formData.vehicleType === type ? 'bg-primary-50 text-primary-700 font-bold' : 'text-gray-700'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Vehicle Number <span className="text-red-500">*</span></label>
                <input type="text" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} placeholder="ABC-1234" required className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Document Upload</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Driving License <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiFileText className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="file" name="drivingLicense" onChange={handleChange} accept=".pdf,image/*" required className="w-full pl-12 pr-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1 file:text-sm file:text-primary-700" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Aadhar Card <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiFileText className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="file" name="aadharCard" onChange={handleChange} accept=".pdf,image/*" required className="w-full pl-12 pr-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1 file:text-sm file:text-primary-700" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Account Security</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} placeholder="Minimum 6 characters" required className="w-full pl-12 pr-12 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <FiEyeOff /> : <FiEye />}</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Re-enter password" required className="w-full pl-12 pr-12 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800" />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showConfirmPassword ? <FiEyeOff /> : <FiEye />}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Your registration will be sent to admin for approval. You will receive email when approved or rejected. Login is allowed only after approval.
            </p>
          </div>

          <button type="submit" disabled={isLoading} className="w-full gradient-green text-white py-3 rounded-xl font-semibold hover:shadow-glow-green transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? 'Registering...' : 'Register as Delivery Partner'}
          </button>

          <div className="text-center pt-4">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/delivery/login" className="text-primary-600 hover:text-primary-700 font-semibold">
                Login
              </Link>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default DeliveryRegister;
