import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus,
  FiEdit,
  FiTrash2,
  FiSearch,
  FiImage,
  FiTag,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiSliders,
  FiCalendar
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import { uploadAdminImage } from '../../services/adminService';

const HomepageBanners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [selectedSectionType, setSelectedSectionType] = useState('All');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [desktopImage, setDesktopImage] = useState('');
  const [mobileImage, setMobileImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaLink, setCtaLink] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [buttonColor, setButtonColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#7c3aed');
  const [gradient, setGradient] = useState('');
  const [overlayOpacity, setOverlayOpacity] = useState(0.3);
  const [tagsInput, setTagsInput] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [sectionType, setSectionType] = useState('promotional_banner');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Upload States
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);

  // Image validation states
  const [desktopImageRatioWarning, setDesktopImageRatioWarning] = useState(false);
  const [mobileImageRatioWarning, setMobileImageRatioWarning] = useState(false);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/marketing/homepage-banners');
      setBanners(response?.data || response?.data?.data || []);
    } catch (err) {
      toast.error('Failed to load banner library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  // Filter lists
  const allTags = useMemo(() => {
    const tagsSet = new Set(['All']);
    banners.forEach((b) => {
      if (Array.isArray(b.tags)) {
        b.tags.forEach((t) => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet);
  }, [banners]);

  const filteredBanners = useMemo(() => {
    return banners.filter((b) => {
      const matchesSearch = b.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.title?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTag = selectedTag === 'All' || (Array.isArray(b.tags) && b.tags.includes(selectedTag));
      const matchesType = selectedSectionType === 'All' || b.sectionType === selectedSectionType;

      return matchesSearch && matchesTag && matchesType;
    });
  }, [banners, searchQuery, selectedTag, selectedSectionType]);

  const openAddModal = () => {
    setEditingBanner(null);
    setName('');
    setTitle('');
    setSubtitle('');
    setDesktopImage('');
    setMobileImage('');
    setCtaText('Shop Now');
    setCtaLink('');
    setTextColor('#ffffff');
    setButtonColor('#ffffff');
    setBackgroundColor('#7c3aed');
    setGradient('');
    setOverlayOpacity(0.3);
    setTagsInput('');
    setIsDefault(false);
    setSectionType('promotional_banner');
    setStartDate('');
    setEndDate('');
    setIsActive(true);
    setDesktopImageRatioWarning(false);
    setMobileImageRatioWarning(false);
    setShowModal(true);
  };

  const openEditModal = (banner) => {
    setEditingBanner(banner);
    setName(banner.name || '');
    setTitle(banner.title || '');
    setSubtitle(banner.subtitle || '');
    setDesktopImage(banner.desktopImage || '');
    setMobileImage(banner.mobileImage || '');
    setCtaText(banner.ctaText || '');
    setCtaLink(banner.ctaLink || '');
    setTextColor(banner.textColor || '#ffffff');
    setButtonColor(banner.buttonColor || '#ffffff');
    setBackgroundColor(banner.backgroundColor || '#7c3aed');
    setGradient(banner.gradient || '');
    setOverlayOpacity(banner.overlayOpacity ?? 0.3);
    setTagsInput(Array.isArray(banner.tags) ? banner.tags.join(', ') : '');
    setIsDefault(!!banner.isDefault);
    setSectionType(banner.sectionType || 'promotional_banner');
    setStartDate(banner.startDate ? new Date(banner.startDate).toISOString().substring(0, 16) : '');
    setEndDate(banner.endDate ? new Date(banner.endDate).toISOString().substring(0, 16) : '');
    setIsActive(banner.isActive !== false);
    setDesktopImageRatioWarning(false);
    setMobileImageRatioWarning(false);
    setShowModal(true);
  };

  // Image Upload helper
  const handleImageUpload = async (e, mode) => {
    const file = e.target.files[0];
    if (!file) return;

    if (mode === 'desktop') {
      setUploadingDesktop(true);
    } else {
      setUploadingMobile(true);
    }

    // Check size limit (500KB)
    if (file.size > 500 * 1024) {
      toast.error('Image size exceeds 500 KB limit. Please compress first.');
      if (mode === 'desktop') setUploadingDesktop(false);
      else setUploadingMobile(false);
      return;
    }

    // Read aspect ratio
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const ratio = width / height;

      if (mode === 'desktop') {
        // Expected ~1920x700 (2.74 ratio)
        if (width < 1200) {
          toast.error('Warning: Desktop image width should be at least 1200px (Preferred: 1920x700)');
          setDesktopImageRatioWarning(true);
        } else {
          setDesktopImageRatioWarning(false);
        }
      } else {
        // Expected ~800x900 (0.88 ratio)
        if (ratio > 1.2) {
          toast.error('Warning: Mobile image should be portrait (Preferred: 800x900)');
          setMobileImageRatioWarning(true);
        } else {
          setMobileImageRatioWarning(false);
        }
      }
    };

    try {
      const response = await uploadAdminImage(file, 'homepage_banners');
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error('Image upload failed');
        return;
      }
      if (mode === 'desktop') {
        setDesktopImage(imageUrl);
      } else {
        setMobileImage(imageUrl);
      }
      toast.success('Banner uploaded successfully');
    } catch (err) {
      toast.error('Failed to upload image');
    } finally {
      if (mode === 'desktop') {
        setUploadingDesktop(false);
      } else {
        setUploadingMobile(false);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Banner name is required.');
    if (!desktopImage) return toast.error('Desktop image is required.');

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload = {
      name,
      title,
      subtitle,
      desktopImage,
      mobileImage,
      ctaText,
      ctaLink,
      textColor,
      buttonColor,
      backgroundColor,
      gradient,
      overlayOpacity: Number(overlayOpacity),
      tags: parsedTags,
      isDefault,
      sectionType,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive
    };

    try {
      if (editingBanner) {
        await api.put(`/api/admin/marketing/homepage-banners/${editingBanner._id}`, payload);
        toast.success('Banner updated successfully');
      } else {
        await api.post('/api/admin/marketing/homepage-banners', payload);
        toast.success('Banner created successfully');
      }
      setShowModal(false);
      fetchBanners();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save banner');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this banner?')) return;
    try {
      await api.delete(`/api/admin/marketing/homepage-banners/${id}`);
      toast.success('Banner deleted successfully');
      fetchBanners();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete banner');
    }
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      {/* Title & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <FiImage className="text-primary-500" />
            Banner Library
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage reusable marketing banner assets with size constraints and crop optimization.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 font-bold text-sm text-white transition-all shadow-lg active:scale-95 duration-200 self-start md:self-auto"
        >
          <FiPlus className="text-lg" />
          Add Banner Asset
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search Box */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by banner name or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>

          {/* Section Type Filter */}
          <div className="flex items-center gap-2">
            <FiSliders className="text-slate-400 text-sm shrink-0" />
            <select
              value={selectedSectionType}
              onChange={(e) => setSelectedSectionType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
            >
              <option value="All">All Section Types</option>
              <option value="flash_sale">Flash Sale</option>
              <option value="seasonal_collection">Seasonal Collection</option>
              <option value="promotional_banner">Promotional Banner</option>
            </select>
          </div>

          {/* Tags Dropdown filter */}
          <div className="flex items-center gap-2">
            <FiTag className="text-slate-400 text-sm shrink-0" />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500"
            >
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag === 'All' ? 'All Tags' : tag}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Banner Library Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading banner library...</div>
      ) : filteredBanners.length === 0 ? (
        <div className="py-20 text-center text-slate-400 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
          No banner assets found matching the filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBanners.map((banner) => (
            <div
              key={banner._id}
              className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-md flex flex-col group hover:border-slate-600 transition-all duration-300"
            >
              {/* Preview Wrapper */}
              <div className="h-44 bg-slate-950 relative overflow-hidden flex items-center justify-center border-b border-slate-700/50">
                <img
                  src={banner.desktopImage}
                  alt={banner.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                />
                
                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-15">
                  {banner.isDefault && (
                    <span className="bg-primary-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wide shadow-sm">
                      Default
                    </span>
                  )}
                  <span className="bg-slate-900/90 text-slate-200 border border-slate-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full capitalize">
                    {banner.sectionType?.replace('_', ' ')}
                  </span>
                </div>

                {/* Active Toggle overlay */}
                <div className="absolute top-3 right-3 z-15">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    banner.isActive ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${banner.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                    {banner.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Dark Vignette Overlay for Title preview */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent flex flex-col justify-end p-4 text-left">
                  <h4 className="text-white font-black text-sm drop-shadow-sm truncate">{banner.name}</h4>
                  {banner.title && (
                    <p className="text-slate-300 text-xs truncate mt-0.5">{banner.title}</p>
                  )}
                </div>
              </div>

              {/* Detail list info */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  {/* Curation info tags */}
                  {banner.tags && banner.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {banner.tags.map((t, idx) => (
                        <span key={idx} className="bg-slate-700/50 text-slate-300 text-[9px] font-semibold px-2 py-0.5 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Date limits */}
                  {(banner.startDate || banner.endDate) && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 bg-slate-900/40 p-1.5 rounded">
                      <FiCalendar className="shrink-0 text-primary-400" />
                      <span className="truncate">
                        {banner.startDate ? new Date(banner.startDate).toLocaleDateString() : 'Always'} -{' '}
                        {banner.endDate ? new Date(banner.endDate).toLocaleDateString() : 'Always'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/40">
                  <button
                    onClick={() => openEditModal(banner)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold text-xs text-slate-200 transition-colors"
                  >
                    <FiEdit className="text-sm" />
                    Edit Asset
                  </button>
                  <button
                    onClick={() => handleDelete(banner._id)}
                    disabled={banner.isDefault}
                    className={`p-2 rounded-xl border border-red-500/30 text-red-400 transition-all ${
                      banner.isDefault ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/10'
                    }`}
                    title={banner.isDefault ? 'Cannot delete default banner' : 'Delete banner'}
                  >
                    <FiTrash2 className="text-sm" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-3xl overflow-hidden shadow-2xl my-8 flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 bg-slate-950 flex items-center justify-between border-b border-slate-700">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <FiImage className="text-primary-500" />
                  {editingBanner ? 'Edit Banner Library Asset' : 'Add Banner Asset to Library'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white p-1">
                  <FiX className="text-xl" />
                </button>
              </div>

              {/* Form Body scrollable */}
              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* section: General Info */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60 pb-1.5">
                    1. General Info & Curation
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Banner Asset Name (Internal)*</label>
                      <input
                        type="text"
                        placeholder="e.g. Army Summer Campaign Hero"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Section Type Association*</label>
                      <select
                        value={sectionType}
                        onChange={(e) => setSectionType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      >
                        <option value="flash_sale">Flash Sale</option>
                        <option value="seasonal_collection">Seasonal Collection</option>
                        <option value="promotional_banner">Promotional Banner</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Search Tags (Comma Separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Army, Summer, Fashion"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div className="flex items-center gap-8 pt-6">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-slate-900 border-slate-700 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-slate-300">Is Active</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={(e) => setIsDefault(e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-slate-900 border-slate-700 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-slate-300 flex items-center gap-1">
                          Set as Default Banner
                          <FiAlertCircle className="text-slate-400" title="Only one default banner can exist per section type. Enabling this will set others to false." />
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* section: Image Assets */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60 pb-1.5">
                    2. Image Media Assets (Max 500KB, WebP preferred)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Desktop Image */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300">
                        Desktop Banner (1920 × 700 px)*
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          placeholder="Paste image URL or upload..."
                          value={desktopImage}
                          onChange={(e) => setDesktopImage(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                        />
                        <label className={`cursor-pointer px-4 py-2.5 rounded-xl border border-slate-600 font-bold text-xs shrink-0 flex items-center justify-center transition-colors ${
                          uploadingDesktop ? 'bg-slate-700 text-slate-400' : 'bg-slate-700 hover:bg-slate-600 text-white'
                        }`}>
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'desktop')} className="hidden" disabled={uploadingDesktop} />
                          {uploadingDesktop ? 'Uploading...' : 'Upload File'}
                        </label>
                      </div>
                      {desktopImageRatioWarning && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                          <FiAlertCircle /> Dimension warning: Width should be at least 1200px (ideal: 1920px)
                        </p>
                      )}
                      {desktopImage && (
                        <div className="h-28 bg-slate-950 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                          <img src={desktopImage} alt="Desktop Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>

                    {/* Mobile Image */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300">
                        Mobile Banner (800 × 900 px - Portrait)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          placeholder="Paste image URL or upload..."
                          value={mobileImage}
                          onChange={(e) => setMobileImage(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                        />
                        <label className={`cursor-pointer px-4 py-2.5 rounded-xl border border-slate-600 font-bold text-xs shrink-0 flex items-center justify-center transition-colors ${
                          uploadingMobile ? 'bg-slate-700 text-slate-400' : 'bg-slate-700 hover:bg-slate-600 text-white'
                        }`}>
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'mobile')} className="hidden" disabled={uploadingMobile} />
                          {uploadingMobile ? 'Uploading...' : 'Upload File'}
                        </label>
                      </div>
                      {mobileImageRatioWarning && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                          <FiAlertCircle /> Dimension warning: Portrait orientation is highly recommended for mobile
                        </p>
                      )}
                      {mobileImage && (
                        <div className="h-28 bg-slate-950 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                          <img src={mobileImage} alt="Mobile Preview" className="h-full object-contain" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* section: Appearance Overlays */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60 pb-1.5">
                    3. Text & Layout Overlays
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Overlay Banner Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Grab 40% Off Allen Solly!"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Overlay Banner Subtitle</label>
                      <input
                        type="text"
                        placeholder="e.g. Valid on footwear and jackets only"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">CTA Button Text</label>
                      <input
                        type="text"
                        placeholder="e.g. Shop Now"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">CTA Link Target</label>
                      <input
                        type="text"
                        placeholder="e.g. /search?category=shoes"
                        value={ctaLink}
                        onChange={(e) => setCtaLink(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Text Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-10 h-10 border border-slate-700 rounded bg-slate-950 p-1 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Button Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={buttonColor}
                          onChange={(e) => setButtonColor(e.target.value)}
                          className="w-10 h-10 border border-slate-700 rounded bg-slate-950 p-1 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={buttonColor}
                          onChange={(e) => setButtonColor(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Solid Fallback Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={backgroundColor}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          className="w-10 h-10 border border-slate-700 rounded bg-slate-950 p-1 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={backgroundColor}
                          onChange={(e) => setBackgroundColor(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Overlay Dark Opacity</label>
                      <div className="flex items-center gap-3 pt-2">
                        <input
                          type="range"
                          min="0"
                          max="0.9"
                          step="0.05"
                          value={overlayOpacity}
                          onChange={(e) => setOverlayOpacity(e.target.value)}
                          className="w-full accent-primary-500 bg-slate-900 h-2 rounded-lg cursor-pointer"
                        />
                        <span className="text-xs font-black text-slate-300 w-10 text-right">
                          {Math.round(overlayOpacity * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">CSS Background Gradient Override</label>
                    <input
                      type="text"
                      placeholder="e.g. linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
                      value={gradient}
                      onChange={(e) => setGradient(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                {/* section: Schedule limits */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/60 pb-1.5">
                    4. Active Schedule Period (Optional)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Schedule Start Date & Time</label>
                      <input
                        type="datetime-local"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">Schedule End Date & Time</label>
                      <input
                        type="datetime-local"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>

              </form>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-slate-950 border-t border-slate-700 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-lg"
                >
                  Save Banner Asset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HomepageBanners;
