import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiEye,
  FiEyeOff,
  FiEdit,
  FiArrowUp,
  FiArrowDown,
  FiCheck,
  FiInfo,
  FiImage,
  FiX,
  FiCalendar,
  FiList,
  FiSettings,
  FiGrid,
  FiSliders,
  FiPlusCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';
import Badge from '../../../../shared/components/Badge';

const HomepageSections = () => {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Search/selection lists from DB
  const [allProducts, setAllProducts] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [libraryBanners, setLibraryBanners] = useState([]);

  // Form states
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [countdownDate, setCountdownDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [gradient, setGradient] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayLimit, setDisplayLimit] = useState(10);
  const [minimumProducts, setMinimumProducts] = useState(4);
  const [layout, setLayout] = useState('horizontal');
  
  // Decoupled Curation & Reusable Banners
  const [curationMode, setCurationMode] = useState('manual');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [autoCategories, setAutoCategories] = useState([]);
  const [autoBrands, setAutoBrands] = useState([]);
  const [autoMinDiscount, setAutoMinDiscount] = useState(0);
  const [autoSortBy, setAutoSortBy] = useState('latest');
  const [bannerAsset, setBannerAsset] = useState(''); // Stores HomeBanner ID

  // Search query states
  const [productSearch, setProductSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');

  // Fetch sections
  const fetchSections = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/marketing/homepage-sections');
      const payload = Array.isArray(res) ? res : (res?.data ?? res ?? []);
      setSections(payload);
    } catch (err) {
      toast.error('Failed to load homepage sections');
    } finally {
      setLoading(false);
    }
  };

  // Fetch curation metadata, brands and reusable banners
  const fetchMetadata = async () => {
    try {
      const [prodRes, catRes, brandRes, bannerRes] = await Promise.all([
        api.get('/products', { params: { page: 1, limit: 200 } }),
        api.get('/categories/all'),
        api.get('/brands/all'),
        api.get('/admin/marketing/homepage-banners')
      ]);

      const prodPayload = Array.isArray(prodRes) ? prodRes : (prodRes?.products || prodRes?.data?.products || []);
      const catPayload = Array.isArray(catRes) ? catRes : (catRes?.data ?? catRes ?? []);
      const brandPayload = Array.isArray(brandRes) ? brandRes : (brandRes?.data ?? brandRes ?? []);
      const bannerPayload = Array.isArray(bannerRes) ? bannerRes : (bannerRes?.data ?? bannerRes ?? []);

      setAllProducts(prodPayload);
      setAllCategories(catPayload);
      setAllBrands(brandPayload);
      setLibraryBanners(bannerPayload);
    } catch (err) {
      console.error('Failed to load metadata lists:', err);
    }
  };

  useEffect(() => {
    fetchSections();
    fetchMetadata();
  }, []);

  // Save / Update Section
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!editingSection) return;

    const payload = {
      title,
      subtitle,
      countdownDate: countdownDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      backgroundColor,
      gradient,
      isActive,
      displayLimit: Number(displayLimit),
      minimumProducts: Number(minimumProducts),
      layout,
      curationMode,
      products: selectedProducts,
      autoCategories,
      autoBrands,
      autoMinDiscount: Number(autoMinDiscount),
      autoSortBy,
      bannerAsset: bannerAsset || null
    };

    try {
      await api.put(`/admin/marketing/homepage-sections/${editingSection._id}`, payload);
      toast.success('Section updated successfully');
      setShowEditModal(false);
      setEditingSection(null);
      fetchSections();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update section');
    }
  };

  // Toggle active status
  const handleToggleActive = async (id, currentStatus) => {
    try {
      await api.put(`/admin/marketing/homepage-sections/${id}`, { isActive: !currentStatus });
      toast.success('Status updated');
      fetchSections();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Reorder
  const handleReorder = async (direction, index) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sections.length - 1) return;

    const newSections = [...sections];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    const tempOrder = newSections[index].order;
    newSections[index].order = newSections[targetIdx].order;
    newSections[targetIdx].order = tempOrder;

    const temp = newSections[index];
    newSections[index] = newSections[targetIdx];
    newSections[targetIdx] = temp;

    setSections(newSections);

    try {
      const items = newSections.map((sec, idx) => ({ id: sec._id, order: idx + 1 }));
      await api.patch('/admin/marketing/homepage-sections/reorder', { items });
    } catch (err) {
      toast.error('Failed to save section order');
      fetchSections();
    }
  };

  // Edit action
  const handleEditClick = (sec) => {
    setEditingSection(sec);
    setTitle(sec.title || '');
    setSubtitle(sec.subtitle || '');
    setCountdownDate(sec.countdownDate ? sec.countdownDate.substring(0, 16) : '');
    setStartDate(sec.startDate ? sec.startDate.substring(0, 10) : '');
    setEndDate(sec.endDate ? sec.endDate.substring(0, 10) : '');
    setBackgroundColor(sec.backgroundColor || '');
    setGradient(sec.gradient || '');
    setIsActive(sec.isActive !== false);
    setDisplayLimit(sec.displayLimit || 10);
    setMinimumProducts(sec.minimumProducts ?? 4);
    setLayout(sec.layout || 'horizontal');
    
    setCurationMode(sec.curationMode || 'manual');
    setSelectedProducts(sec.products?.map(p => p._id || p) || []);
    setAutoCategories(sec.autoCategories || []);
    setAutoBrands(sec.autoBrands || []);
    setAutoMinDiscount(sec.autoMinDiscount || 0);
    setAutoSortBy(sec.autoSortBy || 'latest');
    setBannerAsset(sec.bannerAsset?._id || sec.bannerAsset || '');

    setActiveTab('general');
    setShowEditModal(true);
  };

  // Search filters
  const filteredProducts = useMemo(() => {
    return allProducts.filter(p =>
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.brandId?.name?.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [allProducts, productSearch]);

  const filteredCategories = useMemo(() => {
    return allCategories.filter(c =>
      c.name?.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [allCategories, categorySearch]);

  const filteredBrands = useMemo(() => {
    return allBrands.filter(b =>
      b.name?.toLowerCase().includes(brandSearch.toLowerCase())
    );
  }, [allBrands, brandSearch]);

  // Find currently selected banner details for live preview
  const currentBannerPreviewObj = useMemo(() => {
    if (!bannerAsset) return null;
    return libraryBanners.find(b => b._id === bannerAsset);
  }, [bannerAsset, libraryBanners]);

  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Homepage CMS</h1>
        <p className="text-sm text-gray-500">Manage promotional, countdown and category spotlight configurations.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800">Dynamic CMS Sections</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
            <FiInfo className="text-primary-500" />
            <span>Drag or click arrows to reorder display sequence</span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : sections.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No CMS sections seeded. Restart backend to populate default sections.</div>
        ) : (
          <div className="space-y-4">
            {sections.map((sec, idx) => (
              <div
                key={sec._id}
                className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-gray-50/50 hover:bg-gray-50 rounded-2xl border border-gray-100 transition-colors gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-800">{sec.title || 'Untitled Section'}</h3>
                      <Badge variant="info">{sec.key.replace('_', ' ').toUpperCase()}</Badge>
                      <Badge variant={sec.isActive ? 'success' : 'error'}>
                        {sec.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{sec.subtitle || 'No subtitle configured.'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">Curation: {sec.curationMode === 'automatic' ? 'Automatic' : 'Manual'}</span>
                      <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">Layout: {sec.layout || 'horizontal'}</span>
                      <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">Limit: {sec.displayLimit}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end self-end md:self-center">
                  <button
                    onClick={() => handleReorder('up', idx)}
                    disabled={idx === 0}
                    className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors border border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move Up"
                  >
                    <FiArrowUp />
                  </button>
                  <button
                    onClick={() => handleReorder('down', idx)}
                    disabled={idx === sections.length - 1}
                    className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors border border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move Down"
                  >
                    <FiArrowDown />
                  </button>
                  <button
                    onClick={() => handleToggleActive(sec._id, sec.isActive)}
                    className={`p-2 rounded-lg border transition-colors ${sec.isActive
                        ? 'text-red-600 border-red-200 hover:bg-red-50'
                        : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    title={sec.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {sec.isActive ? <FiEyeOff /> : <FiEye />}
                  </button>
                  <button
                    onClick={() => handleEditClick(sec)}
                    className="p-2 text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Section Configuration"
                  >
                    <FiEdit />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Form Modal (Three-Tabs + Split Screen Live Preview) */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                    <FiSliders className="text-emerald-500" />
                    Configure Section: {editingSection?.title || editingSection?.key}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Control layout parameters, dynamic rules and live visual layouts.</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiX className="text-gray-500" />
                </button>
              </div>

              {/* Split Screen Frame */}
              <div className="flex flex-col lg:flex-row flex-grow overflow-hidden">
                
                {/* LEFT BLOCK: FORM CONTROLS (3/5 Width) */}
                <div className="flex-grow lg:w-3/5 overflow-y-auto border-r border-gray-100 flex flex-col">
                  {/* Tabs */}
                  <div className="flex border-b border-gray-100 px-6 bg-white sticky top-0 z-10 shrink-0">
                    {[
                      { id: 'general', label: 'General Info', icon: FiSettings },
                      { id: 'curation', label: 'Curation Rules', icon: FiList },
                      { id: 'appearance', label: 'Appearance & Banners', icon: FiImage }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 py-4 px-4 font-bold text-xs border-b-2 transition-all relative shrink-0 ${activeTab === tab.id
                            ? 'border-emerald-500 text-emerald-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                      >
                        <tab.icon className="text-sm" />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Form inputs */}
                  <div className="p-6 space-y-6 flex-grow">
                    {/* TAB: GENERAL */}
                    {activeTab === 'general' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-bold text-gray-700 uppercase">Section Display Title</label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Midnight Rush Deals"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                            required
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-bold text-gray-700 uppercase">Section Subtitle / Description</label>
                          <input
                            type="text"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="e.g. Grab 50% Off before the clock strikes midnight!"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">Layout Variant</label>
                          <select
                            value={layout}
                            onChange={(e) => setLayout(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                          >
                            <option value="horizontal">Horizontal Scroll List</option>
                            <option value="carousel">Slide Carousel Layout</option>
                            <option value="grid">Responsive Grid</option>
                            <option value="banner">Promotional Banner Card</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">Display Products Limit</label>
                          <input
                            type="number"
                            value={displayLimit}
                            onChange={(e) => setDisplayLimit(e.target.value)}
                            min={1}
                            max={50}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">Minimum Products threshold</label>
                          <input
                            type="number"
                            value={minimumProducts}
                            onChange={(e) => setMinimumProducts(e.target.value)}
                            min={0}
                            max={10}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                            required
                          />
                        </div>

                        {editingSection?.key === 'flash_sale' && (
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">Countdown End Date & Time</label>
                            <input
                              type="datetime-local"
                              value={countdownDate}
                              onChange={(e) => setCountdownDate(e.target.value)}
                              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                            />
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">Schedule Start Date</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-700 uppercase">Schedule End Date</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                          />
                        </div>

                        <div className="flex items-center gap-3 py-4 md:col-span-2">
                          <input
                            type="checkbox"
                            id="isActiveInput"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded cursor-pointer"
                          />
                          <label htmlFor="isActiveInput" className="text-sm font-bold text-gray-700 select-none cursor-pointer">
                            Enable Section (Visible on homepage)
                          </label>
                        </div>
                      </div>
                    )}

                    {/* TAB: CURATION */}
                    {activeTab === 'curation' && (
                      <div className="space-y-6">
                        {/* Toggle Mode */}
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-3">
                          <label className="text-xs font-black uppercase text-gray-600 tracking-wider">Curation Strategy Mode</label>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setCurationMode('manual')}
                              className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${
                                curationMode === 'manual'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              Manual Selection
                            </button>
                            <button
                              type="button"
                              onClick={() => setCurationMode('automatic')}
                              className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${
                                curationMode === 'automatic'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              Automatic Rule Builder
                            </button>
                          </div>
                        </div>

                        {/* MODE: MANUAL */}
                        {curationMode === 'manual' ? (
                          <div className="space-y-4">
                            <div className="space-y-2 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                              <label className="text-xs font-bold text-gray-700 uppercase block">Curate Products Selection</label>
                              <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder="Search products by name/brand..."
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs font-semibold mb-3"
                              />
                              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white space-y-1.5">
                                {filteredProducts.map((p) => {
                                  const isChecked = selectedProducts.includes(p._id || p.id);
                                  return (
                                    <label key={p._id || p.id} className="flex items-center gap-2 text-xs text-gray-700 font-semibold cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg transition-colors">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setSelectedProducts(selectedProducts.filter(id => id !== (p._id || p.id)));
                                          } else {
                                            setSelectedProducts([...selectedProducts, p._id || p.id]);
                                          }
                                        }}
                                        className="text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                                      />
                                      <span>{p.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-gray-500 font-bold mt-1 text-right">Selected count: {selectedProducts.length}</div>
                            </div>
                          </div>
                        ) : (
                          /* MODE: AUTOMATIC */
                          <div className="space-y-5">
                            {/* Sorting Rule */}
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-700 uppercase">Sort Order & Rule Priority</label>
                              <select
                                value={autoSortBy}
                                onChange={(e) => setAutoSortBy(e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                              >
                                <option value="latest">Latest uploads first</option>
                                <option value="best_sellers">Best Selling Volume</option>
                                <option value="top_rated">Top Customer Ratings first</option>
                              </select>
                            </div>

                            {/* Min Discount percentage input */}
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-700 uppercase">Minimum Discount Filter (e.g. &gt;= 40%)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max="95"
                                  value={autoMinDiscount}
                                  onChange={(e) => setAutoMinDiscount(e.target.value)}
                                  placeholder="0"
                                  className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                                />
                                <span className="absolute right-3.5 top-3.5 text-xs font-bold text-gray-400">% Off</span>
                              </div>
                            </div>

                            {/* Categories Selector */}
                            <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                              <label className="text-xs font-bold text-gray-700 uppercase block">Filter Categories (All if empty)</label>
                              <input
                                type="text"
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                placeholder="Search categories..."
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs font-semibold mb-3"
                              />
                              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white space-y-1.5">
                                {filteredCategories.map((c) => {
                                  const isChecked = autoCategories.includes(c._id || c.id);
                                  return (
                                    <label key={c._id || c.id} className="flex items-center gap-2 text-xs text-gray-700 font-semibold cursor-pointer hover:bg-gray-50 p-1 rounded-lg">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setAutoCategories(autoCategories.filter(id => id !== (c._id || c.id)));
                                          } else {
                                            setAutoCategories([...autoCategories, c._id || c.id]);
                                          }
                                        }}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                      />
                                      <span>{c.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Brands Selector */}
                            <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                              <label className="text-xs font-bold text-gray-700 uppercase block">Filter Brands (All if empty)</label>
                              <input
                                type="text"
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                                placeholder="Search brands..."
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs font-semibold mb-3"
                              />
                              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white space-y-1.5">
                                {filteredBrands.map((b) => {
                                  const isChecked = autoBrands.includes(b._id || b.id);
                                  return (
                                    <label key={b._id || b.id} className="flex items-center gap-2 text-xs text-gray-700 font-semibold cursor-pointer hover:bg-gray-50 p-1 rounded-lg">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setAutoBrands(autoBrands.filter(id => id !== (b._id || b.id)));
                                          } else {
                                            setAutoBrands([...autoBrands, b._id || b.id]);
                                          }
                                        }}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                      />
                                      <span>{b.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: APPEARANCE */}
                    {activeTab === 'appearance' && (
                      <div className="space-y-6">
                        {/* Decoupled Banner Asset Library Picker */}
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                          <div>
                            <label className="text-xs font-bold text-gray-700 uppercase block mb-1">Select Library Banner Asset</label>
                            <p className="text-[10px] text-gray-400">Linked from your Media Asset Library. Leaving this empty or unselected automatically resolves to the default campaign banner.</p>
                          </div>
                          <select
                            value={bannerAsset}
                            onChange={(e) => setBannerAsset(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                          >
                            <option value="">▼ None (Fallback to Default Banner)</option>
                            {libraryBanners
                              .filter(b => b.sectionType === editingSection?.key || b.sectionType === editingSection?.sectionType || !b.sectionType)
                              .map((b) => (
                                <option key={b._id} value={b._id}>
                                  ▼ {b.name} {b.isDefault ? '(Default)' : ''}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Visual override fallbacks */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">Background Solid Color Override</label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={backgroundColor || '#ffffff'}
                                onChange={(e) => setBackgroundColor(e.target.value)}
                                className="w-10 h-10 p-0 rounded-lg border border-gray-200 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={backgroundColor}
                                onChange={(e) => setBackgroundColor(e.target.value)}
                                placeholder="e.g. #f4f5f7 or transparent"
                                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 uppercase">Gradient Style CSS Override</label>
                            <input
                              type="text"
                              value={gradient}
                              onChange={(e) => setGradient(e.target.value)}
                              placeholder="e.g., linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT BLOCK: INTERACTIVE LIVE PREVIEW (2/5 Width) */}
                <div className="hidden lg:block lg:w-2/5 bg-slate-950 p-6 overflow-y-auto flex flex-col justify-between">
                  <div className="space-y-5">
                    <span className="inline-block bg-primary-500 text-white px-3 py-1 rounded-full text-[9px] font-black tracking-wide uppercase select-none">
                      Interactive Live Preview
                    </span>

                    {/* Section Box representation */}
                    <div 
                      className="rounded-3xl border border-white/10 p-5 overflow-hidden relative shadow-2xl transition-all duration-300"
                      style={{ 
                        background: backgroundColor || 'transparent', 
                        backgroundImage: gradient || 'none',
                        minHeight: '260px'
                      }}
                    >
                      {/* Decorative blurs if default gradient or solid override */}
                      {(!backgroundColor && !gradient && !currentBannerPreviewObj) && (
                        <div className="absolute inset-0 bg-slate-900 flex flex-col justify-center items-center text-slate-500 text-xs">
                          <FiImage className="text-3xl mb-2" />
                          <span>Solid Visual Fallback Card</span>
                        </div>
                      )}

                      {/* Decoupled Banner Render */}
                      {currentBannerPreviewObj ? (
                        <div className="w-full h-44 rounded-2xl overflow-hidden relative border border-white/20 bg-slate-900">
                          <img
                            src={currentBannerPreviewObj.desktopImage}
                            alt="Preview desktop"
                            className="w-full h-full object-cover"
                          />
                          {/* Banner Overlay */}
                          <div 
                            className="absolute inset-0 flex flex-col justify-center p-5 text-left"
                            style={{ 
                              backgroundColor: `rgba(0,0,0,${currentBannerPreviewObj.overlayOpacity ?? 0.3})`,
                              color: currentBannerPreviewObj.textColor || '#fff'
                            }}
                          >
                            <h4 className="font-black text-sm drop-shadow leading-tight">
                              {currentBannerPreviewObj.title || title || 'Campaign Title'}
                            </h4>
                            <p className="text-[10px] font-medium opacity-80 mt-1 line-clamp-2">
                              {currentBannerPreviewObj.subtitle || subtitle || 'Campaign Subtitle details...'}
                            </p>
                            {currentBannerPreviewObj.ctaText && (
                              <span 
                                className="inline-block mt-3 px-3 py-1 rounded-lg text-[9px] font-black self-start uppercase tracking-wider"
                                style={{ 
                                  backgroundColor: currentBannerPreviewObj.buttonColor || '#ffffff',
                                  color: '#111827'
                                }}
                              >
                                {currentBannerPreviewObj.ctaText}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Default fallback simulation or css fallback design representation */
                        <div className="relative z-10 space-y-3">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur border border-white/20 rounded-full text-[9px] font-black text-white uppercase animate-pulse">
                            ✨ Default Fallback Active
                          </div>
                          <h4 className="text-xl font-black text-white leading-tight">{title || 'Section Title'}</h4>
                          <p className="text-xs text-white/80 leading-relaxed line-clamp-2">{subtitle || 'Configure a subtitle to preview here.'}</p>
                          <span className="inline-block px-4 py-2 bg-white text-gray-900 rounded-xl text-[10px] font-black uppercase">
                            Shop Now
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Section Layout Skeletons */}
                    <div className="bg-slate-900/60 p-4 border border-white/5 rounded-2xl">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">
                        Curation: {curationMode === 'manual' ? `Manual list (${selectedProducts.length} items)` : `Automatic rules`}
                      </div>
                      
                      {/* Curation rule summary list if auto */}
                      {curationMode === 'automatic' && (
                        <div className="space-y-1.5 mb-4 text-xs text-slate-300">
                          <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg">
                            <span>Categories:</span>
                            <span className="font-bold text-emerald-400">{autoCategories.length > 0 ? `${autoCategories.length} selected` : 'All'}</span>
                          </div>
                          <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg">
                            <span>Brands:</span>
                            <span className="font-bold text-emerald-400">{autoBrands.length > 0 ? `${autoBrands.length} selected` : 'All'}</span>
                          </div>
                          <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg">
                            <span>Min Discount:</span>
                            <span className="font-bold text-emerald-400">&gt;= {autoMinDiscount}% Off</span>
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-3">
                        Layout Style: <span className="text-primary-400 capitalize font-black">{layout}</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="bg-slate-950/80 border border-white/5 w-24 p-2 rounded-xl shrink-0 space-y-1.5">
                            <div className="h-16 bg-slate-900 rounded-lg" />
                            <div className="h-2 w-14 bg-slate-800 rounded" />
                            <div className="h-2.5 w-10 bg-slate-700 rounded" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 text-center select-none pt-4 border-t border-white/5">
                    Layout renders dynamically matching display parameters and rules.
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all shadow-sm font-bold text-sm flex items-center gap-1.5"
                >
                  <FiCheck className="text-base" />
                  <span>Publish Changes</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HomepageSections;
