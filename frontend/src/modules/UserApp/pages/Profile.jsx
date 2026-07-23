import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiUser, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiSave, FiCamera, FiPackage, FiMapPin, FiLogOut, FiChevronRight, FiBell, FiMessageCircle, FiCreditCard } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Grid, Clapperboard, UserSquare, Menu, X, Plus } from 'lucide-react';
import MobileLayout from "../components/Layout/MobileLayout";
import { useAuthStore } from '../../../shared/store/authStore';
import { isValidEmail, isValidPhone } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import PasswordStrengthMeter from '../components/Mobile/PasswordStrengthMeter';
import { useUserNotificationStore } from '../store/userNotificationStore';

const MobileProfile = () => {
  const navigate = useNavigate();
  const { user, updateProfile, uploadProfileAvatar, changePassword, logout, isLoading } = useAuthStore();
  const avatarInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('grid'); // 'grid', 'reels', 'tags'
  const [editTab, setEditTab] = useState(null); // null, 'personal', 'password'
  const [showMenu, setShowMenu] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const unreadNotificationCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureNotificationHydrated = useUserNotificationStore((state) => state.ensureHydrated);

  const { register: registerPersonal, handleSubmit: handleSubmitPersonal, reset: resetPersonal, formState: { errors: personalErrors } } = useForm({
    defaultValues: { name: user?.name || '', email: user?.email || '', phone: user?.phone || '' },
  });
  const { register: registerPassword, handleSubmit: handleSubmitPassword, watch, formState: { errors: passwordErrors }, reset: resetPassword } = useForm();
  const newPassword = watch('newPassword');

  useEffect(() => { ensureNotificationHydrated(); }, [ensureNotificationHydrated]);
  useEffect(() => {
    resetPersonal({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  }, [user, resetPersonal]);

  const onPersonalSubmit = async (data) => {
    try {
      await updateProfile({ name: data?.name, phone: data?.phone });
      toast.success('Profile updated successfully!');
      setEditTab(null);
    } catch (error) { toast.error(error.message || 'Failed to update profile'); }
  };

  const onPasswordSubmit = async (data) => {
    try {
      await changePassword(data.currentPassword, data.newPassword);
      toast.success('Password changed successfully!');
      resetPassword();
      setEditTab(null);
    } catch (error) { toast.error(error.message || 'Failed to change password'); }
  };

  const handleLogout = () => { logout(); navigate('/home'); toast.success('Logged out successfully'); };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { toast.error('Only JPEG, PNG, WEBP and GIF images are allowed.'); event.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image size must be 5MB or less.'); event.target.value = ''; return; }
    try { await uploadProfileAvatar(file); toast.success('Profile picture updated!'); } catch (error) { toast.error(error?.message || 'Failed to upload'); } finally { event.target.value = ''; }
  };

  const menuItems = [
    { label: 'Personal Information', icon: FiUser, color: 'text-blue-600', bg: 'bg-blue-50', action: () => { setEditTab('personal'); setShowMenu(false); } },
    { label: 'My Orders', icon: FiPackage, color: 'text-orange-600', bg: 'bg-orange-50', action: () => { navigate('/orders'); setShowMenu(false); } },
    { label: 'My Wallet', icon: FiCreditCard, color: 'text-yellow-600', bg: 'bg-yellow-50', action: () => { navigate('/user/wallet'); setShowMenu(false); } },
    { label: 'My Addresses', icon: FiMapPin, color: 'text-green-600', bg: 'bg-green-50', action: () => { navigate('/addresses'); setShowMenu(false); } },
    { label: 'Notifications', icon: FiBell, color: 'text-indigo-600', bg: 'bg-indigo-50', badge: unreadNotificationCount > 0 ? unreadNotificationCount : null, action: () => { navigate('/notifications'); setShowMenu(false); } },
    { label: 'Change Password', icon: FiLock, color: 'text-purple-600', bg: 'bg-purple-50', action: () => { setEditTab('password'); setShowMenu(false); } },
    { label: 'Support Tickets', icon: FiMessageCircle, color: 'text-teal-600', bg: 'bg-teal-50', action: () => { navigate('/support'); setShowMenu(false); } },
  ];

  const highlights = [
    { label: 'Orders', icon: FiPackage, color: 'text-orange-600', bg: 'bg-orange-50', action: () => navigate('/orders') },
    { label: 'Wishlist', icon: FiBell, color: 'text-pink-600', bg: 'bg-pink-50', action: () => navigate('/wishlist') },
    { label: 'Addresses', icon: FiMapPin, color: 'text-green-600', bg: 'bg-green-50', action: () => navigate('/addresses') },
  ];

  const renderContent = () => {
    if (activeTab === 'grid') return (
      <div className="grid grid-cols-3 gap-0.5">
        {[1,2,3,4,5,6,7,8,9].map((i) => (
          <div key={i} className="aspect-square bg-gray-100 relative overflow-hidden">
            <img src={`https://picsum.photos/seed/${i + 20}/300/300`} alt="post" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
    if (activeTab === 'reels') return (
      <div className="grid grid-cols-3 gap-0.5">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="aspect-[9/16] bg-gray-100 relative overflow-hidden">
            <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-[10px] font-bold z-10">
              <Clapperboard size={12} /> 12.4K
            </div>
            <img src={`https://picsum.photos/seed/reel-${i + 30}/300/533`} alt="reel" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
    if (activeTab === 'tags') return (
      <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
        <div className="h-20 w-20 rounded-full border-2 border-gray-800 flex items-center justify-center mb-4">
          <UserSquare size={40} />
        </div>
        <h3 className="text-xl font-bold mb-2">Photos and videos of you</h3>
        <p className="text-sm text-gray-500">When people tag you in photos and videos, they'll appear here.</p>
      </div>
    );
  };

  return (
    <>
      <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={false}>
        <div className="min-h-[calc(100vh-56px)] bg-white text-black font-sans pb-0">
          <input ref={avatarInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarChange} />

          {/* Header */}
          <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
            <div className="max-w-[935px] mx-auto h-14 flex items-center justify-between px-4 relative">
              <button onClick={() => editTab ? setEditTab(null) : navigate(-1)} className="z-10 relative p-1">
                <ChevronLeft size={28} />
              </button>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <span className="font-bold text-lg truncate max-w-[200px]">
                    {editTab === 'personal' ? 'Personal Info' : editTab === 'password' ? 'Change Password' : (user?.name?.toLowerCase().replace(/\s+/g, '_') || 'my_account')}
                  </span>
                  {!editTab && <ChevronLeft size={14} className="-rotate-90 mt-0.5" />}
                </div>
              </div>
              <div className="flex items-center gap-3 z-10 relative">
                <button onClick={() => avatarInputRef.current?.click()} className="hover:opacity-70 transition-opacity">
                  <Plus className="border-2 border-black rounded-lg p-0.5" size={20} />
                </button>
                <button onClick={() => setShowMenu(true)}>
                  <Menu size={24} />
                </button>
              </div>
            </div>
          </header>

          <div className="max-w-[935px] mx-auto">
            {/* Edit Forms */}
            {editTab === 'personal' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
                      {user?.avatar ? <img src={user.avatar} alt={user?.name} className="w-full h-full object-cover" /> : user?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={isLoading} className="absolute bottom-0 right-0 w-8 h-8 bg-[#7C3AED] rounded-full flex items-center justify-center text-white border-2 border-white">
                      <FiCamera className="text-sm" />
                    </button>
                  </div>
                  <div><p className="text-gray-600 text-sm">Profile Picture</p><p className="text-xs text-gray-400">JPG, PNG or GIF. Max 5MB</p></div>
                </div>
                <form onSubmit={handleSubmitPersonal(onPersonalSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                    <div className="relative">
                      <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" {...registerPersonal('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${personalErrors.name ? 'border-red-300' : 'border-gray-200 focus:border-[#7C3AED]'} focus:outline-none`} placeholder="Your full name" />
                    </div>
                    {personalErrors.name && <p className="mt-1 text-sm text-red-600">{personalErrors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                    <div className="relative">
                      <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" {...registerPersonal('email')} readOnly className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none" />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">Email cannot be changed from profile settings.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                    <div className="relative">
                      <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" {...registerPersonal('phone', { validate: (v) => !v || isValidPhone(v) || 'Enter a valid phone number' })} className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${personalErrors.phone ? 'border-red-300' : 'border-gray-200 focus:border-[#7C3AED]'} focus:outline-none`} placeholder="1234567890" />
                    </div>
                    {personalErrors.phone && <p className="mt-1 text-sm text-red-600">{personalErrors.phone.message}</p>}
                  </div>
                  <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 transition-all disabled:opacity-50">
                    <FiSave /> {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </motion.div>
            )}

            {editTab === 'password' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-6">
                <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="space-y-4">
                  {[
                    { label: 'Current Password', name: 'currentPassword', show: showCurrentPassword, setShow: setShowCurrentPassword, rules: { required: 'Current password is required' } },
                    { label: 'New Password', name: 'newPassword', show: showNewPassword, setShow: setShowNewPassword, rules: { required: 'New password is required', minLength: { value: 6, message: 'At least 6 characters' } } },
                    { label: 'Confirm Password', name: 'confirmPassword', show: showConfirmPassword, setShow: setShowConfirmPassword, rules: { required: 'Please confirm your password', validate: (v) => v === newPassword || 'Passwords do not match' } },
                  ].map(({ label, name, show, setShow, rules }) => (
                    <div key={name}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
                      <div className="relative">
                        <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type={show ? 'text' : 'password'} {...registerPassword(name, rules)} className={`w-full pl-12 pr-12 py-3 rounded-xl border-2 ${passwordErrors[name] ? 'border-red-300' : 'border-gray-200 focus:border-[#7C3AED]'} focus:outline-none`} placeholder={label} />
                        <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                          {show ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                      {passwordErrors[name] && <p className="mt-1 text-sm text-red-600">{passwordErrors[name].message}</p>}
                      {name === 'newPassword' && <PasswordStrengthMeter password={newPassword} />}
                    </div>
                  ))}
                  <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95 transition-all disabled:opacity-50">
                    <FiSave /> {isLoading ? 'Changing...' : 'Change Password'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* Instagram-style Profile View */}
            {!editTab && (
              <>
                <div className="px-4 pt-6">
                  {/* Avatar + Stats */}
                  <div className="flex items-center gap-8 md:gap-20 mb-4">
                    <div className="relative flex-shrink-0">
                      <div className="h-20 w-20 md:h-36 md:w-36 rounded-full bg-emerald-500 flex items-center justify-center text-white text-3xl font-bold overflow-hidden border-2 border-gray-100">
                        {user?.avatar ? <img src={user.avatar} alt={user?.name} className="w-full h-full object-cover" /> : user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div onClick={() => avatarInputRef.current?.click()} className="absolute bottom-0 right-0 bg-[#7C3AED] rounded-full border-2 border-white p-1 text-white cursor-pointer">
                        <Plus size={14} strokeWidth={3} />
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-3">
                      {/* Desktop name + buttons */}
                      <div className="hidden md:flex items-center gap-4">
                        <h2 className="text-xl font-light">{user?.name}</h2>
                        <button onClick={() => setEditTab('personal')} className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white px-4 py-1.5 rounded-xl text-sm font-bold shadow-md shadow-primary-500/20 active:scale-95 transition-all">Edit Profile</button>
                        <Link to="/support" className="bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-bold">Contact</Link>
                      </div>
                      {/* Stats */}
                      <div className="flex justify-between md:justify-start items-center text-center md:text-left gap-0 md:gap-10">
                        <div className="flex flex-col md:flex-row md:gap-1">
                          <div className="font-bold text-lg leading-tight">12</div>
                          <div className="text-xs md:text-base text-gray-500 md:text-black">Posts</div>
                        </div>
                        <div className="flex flex-col md:flex-row md:gap-1">
                          <div className="font-bold text-lg leading-tight">10.5K</div>
                          <div className="text-xs md:text-base text-gray-500 md:text-black">Followers</div>
                        </div>
                        <div className="flex flex-col md:flex-row md:gap-1">
                          <div className="font-bold text-lg leading-tight">482</div>
                          <div className="text-xs md:text-base text-gray-500 md:text-black">Following</div>
                        </div>
                      </div>
                      {/* Desktop Bio */}
                      <div className="hidden md:block">
                        <div className="font-bold text-sm mb-0.5">{user?.name}</div>
                        <div className="text-sm text-gray-600">{user?.email}</div>
                        {user?.phone && <div className="text-sm text-[#7C3AED]">{user.phone}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Mobile Bio */}
                  <div className="mb-4 md:hidden">
                    <div className="font-bold text-sm">{user?.name}</div>
                    <div className="text-sm text-gray-600">{user?.email}</div>
                    {user?.phone && <div className="text-sm text-[#7C3AED]">{user.phone}</div>}
                  </div>

                  {/* Mobile Action Buttons */}
                  <div className="flex md:hidden gap-2 mb-6">
                    <button onClick={() => setEditTab('personal')} className="flex-1 bg-[#7C3AED] text-white rounded-lg py-1.5 text-sm font-bold">Edit Profile</button>
                    <Link to="/support" className="flex-1 bg-gray-100 text-black rounded-lg py-1.5 text-sm font-bold text-center">Contact</Link>
                  </div>

                  {/* Highlights */}
                  <div className="flex gap-4 overflow-x-auto scrollbar-hide mb-6 py-1">
                    {highlights.map((h, idx) => (
                      <div key={idx} onClick={h.action} className="flex flex-col items-center gap-1 min-w-[64px] cursor-pointer">
                        <div className={`h-16 w-16 rounded-full border-2 border-gray-200 ${h.bg} ${h.color} flex items-center justify-center`}>
                          <h.icon className="text-xl" />
                        </div>
                        <span className="text-[10px] font-medium text-gray-700 truncate w-16 text-center">{h.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-t border-gray-200">
                  <button onClick={() => setActiveTab('grid')} className={`flex-1 flex justify-center py-3 ${activeTab === 'grid' ? 'border-b-2 border-[#7C3AED] text-[#7C3AED]' : 'text-gray-400'}`}><Grid size={24} /></button>
                  <button onClick={() => setActiveTab('reels')} className={`flex-1 flex justify-center py-3 ${activeTab === 'reels' ? 'border-b-2 border-[#7C3AED] text-[#7C3AED]' : 'text-gray-400'}`}><Clapperboard size={24} /></button>
                  <button onClick={() => setActiveTab('tags')} className={`flex-1 flex justify-center py-3 ${activeTab === 'tags' ? 'border-b-2 border-[#7C3AED] text-[#7C3AED]' : 'text-gray-400'}`}><UserSquare size={24} /></button>
                </div>

                <div>{renderContent()}</div>
              </>
            )}
          </div>

        </div>
      </MobileLayout>
    </PageTransition>

    {/* Side Menu Drawer - Rendered outside PageTransition to prevent positioning and viewport height bugs from CSS transform */}
    {showMenu && (
      <div className="fixed inset-0 z-[10000] flex justify-end">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowMenu(false)} />
        <div className="relative w-[75%] max-w-[300px] h-[100dvh] max-h-[100dvh] bg-white shadow-2xl flex flex-col">
          <div className="p-4 px-5 border-b border-gray-100 flex items-center justify-between">
            <span className="font-bold text-lg">Settings</span>
            <button onClick={() => setShowMenu(false)} className="p-1 hover:bg-gray-100 rounded-full"><X size={24} /></button>
          </div>
          <div className="flex-1 py-1.5 overflow-y-auto">
            {menuItems.map((item, idx) => (
              <button key={idx} onClick={item.action} className="w-full flex items-center gap-3.5 px-5 py-3 hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0">
                <div className={`w-9 h-9 rounded-xl ${item.bg} ${item.color} flex items-center justify-center relative`}>
                  <item.icon className="text-base" />
                  {item.badge ? <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{item.badge > 9 ? '9+' : item.badge}</span> : null}
                </div>
                <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                <FiChevronRight className="ml-auto text-gray-400" />
              </button>
            ))}
          </div>
          <div className="p-4 px-5 pb-6 border-t border-gray-100">
            <button onClick={handleLogout} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-red-500 hover:bg-red-50 flex items-center justify-center gap-2">
              <FiLogOut /> Sign Out
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default MobileProfile;
