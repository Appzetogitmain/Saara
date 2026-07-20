import { useState, useEffect } from 'react';
import {
  FiSettings,
  FiGrid,
  FiSliders,
  FiCheck,
  FiPlus,
  FiTrash2,
  FiArrowUp,
  FiArrowDown,
  FiImage
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../shared/utils/api';

const ShopConfiguration = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Lists from DB
  const [allCategories, setAllCategories] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [libraryBanners, setLibraryBanners] = useState([]);

  // Config States
  const [defaultSort, setDefaultSort] = useState('newest');
  const [productsPerPage, setProductsPerPage] = useState(20);
  const [defaultViewMode, setDefaultViewMode] = useState('grid');
  const [featuredCategories, setFeaturedCategories] = useState([]);
  const [featuredBrands, setFeaturedBrands] = useState([]);
  const [bannerAsset, setBannerAsset] = useState('');
  const [enabledFilters, setEnabledFilters] = useState({
    category: true,
    brand: true,
    price: true,
    rating: true,
    discount: true,
    stock: true,
    vendor: true,
    deliveryType: true,
    color: true,
    size: true
  });
  const [quickFilters, setQuickFilters] = useState([]);

  // Form states for new chip
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipQuery, setNewChipQuery] = useState('{}');

  const fetchMetadata = async () => {
    try {
      const [catRes, brandRes, bannerRes] = await Promise.all([
        api.get('/categories/all'),
        api.get('/brands/all'),
        api.get('/admin/marketing/homepage-banners')
      ]);

      setAllCategories(Array.isArray(catRes) ? catRes : (catRes?.data ?? catRes ?? []));
      setAllBrands(Array.isArray(brandRes) ? brandRes : (brandRes?.data ?? brandRes ?? []));
      setLibraryBanners(Array.isArray(bannerRes) ? bannerRes : (bannerRes?.data ?? bannerRes ?? []));
    } catch (err) {
      console.error('Failed to load metadata lists:', err);
    }
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/marketing/shop-config');
      const data = res?.data ?? res ?? {};
      
      setDefaultSort(data.defaultSort || 'newest');
      setProductsPerPage(data.productsPerPage || 20);
      setDefaultViewMode(data.defaultViewMode || 'grid');
      setFeaturedCategories(data.featuredCategories || []);
      setFeaturedBrands(data.featuredBrands || []);
      setBannerAsset(data.bannerAsset || '');
      setEnabledFilters(data.enabledFilters || {
        category: true,
        brand: true,
        price: true,
        rating: true,
        discount: true,
        stock: true,
        vendor: true,
        deliveryType: true,
        color: true,
        size: true
      });
      setQuickFilters(data.quickFilters || []);
    } catch (err) {
      toast.error('Failed to load shop configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      await fetchMetadata();
      await fetchConfig();
    };
    loadAll();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        defaultSort,
        productsPerPage: Number(productsPerPage),
        defaultViewMode,
        featuredCategories,
        featuredBrands,
        bannerAsset: bannerAsset || null,
        enabledFilters,
        quickFilters
      };

      await api.put('/admin/marketing/shop-config', payload);
      toast.success('Shop configuration saved successfully!');
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFilter = (key) => {
    setEnabledFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAddChip = () => {
    if (!newChipLabel.trim()) {
      toast.error('Please enter a chip label');
      return;
    }
    try {
      JSON.parse(newChipQuery);
    } catch (e) {
      toast.error('Query must be a valid JSON object string (e.g. {"isNewArrival":"true"})');
      return;
    }

    const newChip = {
      label: newChipLabel.trim(),
      queryParams: newChipQuery.trim(),
      isActive: true,
      order: quickFilters.length + 1
    };

    setQuickFilters([...quickFilters, newChip]);
    setNewChipLabel('');
    setNewChipQuery('{}');
    toast.success('Quick filter chip added!');
  };

  const handleDeleteChip = (index) => {
    const updated = quickFilters.filter((_, idx) => idx !== index).map((chip, idx) => ({
      ...chip,
      order: idx + 1
    }));
    setQuickFilters(updated);
  };

  const handleMoveChip = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === quickFilters.length - 1) return;

    const updated = [...quickFilters];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    // reset order index
    const reordered = updated.map((chip, idx) => ({
      ...chip,
      order: idx + 1
    }));
    setQuickFilters(reordered);
  };

  const handleToggleCategory = (catId) => {
    setFeaturedCategories(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const handleToggleBrand = (brandId) => {
    setFeaturedBrands(prev =>
      prev.includes(brandId) ? prev.filter(id => id !== brandId) : [...prev, brandId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <FiSettings className="text-primary-600" />
            Shop Configuration Editor
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Manage product catalog layouts, default filters, custom banners, and scroll chips dynamically.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary-700 hover:shadow-lg transition-all disabled:opacity-50"
        >
          {saving ? 'Saving Changes...' : 'Save Configuration'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: General & Banner Options */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Layout Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <FiGrid className="text-primary-500" />
              General Layout Preferences
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase block mb-1">Default Sorting</label>
                <select
                  value={defaultSort}
                  onChange={(e) => setDefaultSort(e.target.value)}
                  className="w-full rounded-xl border-gray-200 px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 font-medium bg-gray-50 border"
                >
                  <option value="newest">Newest Arrivals</option>
                  <option value="popular">Popularity (Reviews)</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="rating">Highest Rated</option>
                  <option value="discount">Biggest Discount</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase block mb-1">Products Per Page</label>
                <input
                  type="number"
                  value={productsPerPage}
                  min={5}
                  max={100}
                  onChange={(e) => setProductsPerPage(Number(e.target.value))}
                  className="w-full rounded-xl border-gray-200 px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 font-medium bg-gray-50 border"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase block mb-1">Default View Mode</label>
                <select
                  value={defaultViewMode}
                  onChange={(e) => setDefaultViewMode(e.target.value)}
                  className="w-full rounded-xl border-gray-200 px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 font-medium bg-gray-50 border"
                >
                  <option value="grid">Grid View</option>
                  <option value="list">List View</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 uppercase block mb-1 flex items-center gap-1">
                <FiImage className="text-gray-400" />
                Linked Shop Promo Banner
              </label>
              <select
                value={bannerAsset}
                onChange={(e) => setBannerAsset(e.target.value)}
                className="w-full rounded-xl border-gray-200 px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 font-medium bg-gray-50 border"
              >
                <option value="">None (Use default / transparent fallback)</option>
                {libraryBanners.map(b => (
                  <option key={b._id || b.id} value={b._id || b.id}>
                    {b.name} ({b.title || 'Untitled'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Card: Quick Filter Chips */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <FiSliders className="text-primary-500" />
              Quick Filter Chips (Scroll Row)
            </h2>
            
            {/* List of Chips */}
            <div className="space-y-2.5">
              {quickFilters.map((chip, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full font-bold">
                        #{chip.order}
                      </span>
                      <span className="font-bold text-sm text-gray-800">{chip.label}</span>
                    </div>
                    <code className="text-xs text-gray-500 block truncate mt-1">{chip.queryParams}</code>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveChip(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-600 disabled:opacity-30"
                    >
                      <FiArrowUp />
                    </button>
                    <button
                      onClick={() => handleMoveChip(index, 'down')}
                      disabled={index === quickFilters.length - 1}
                      className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-600 disabled:opacity-30"
                    >
                      <FiArrowDown />
                    </button>
                    <button
                      onClick={() => handleDeleteChip(index)}
                      className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))}
              {quickFilters.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4 font-medium">No quick chips configured. Adding All is recommended.</p>
              )}
            </div>

            {/* Add New Chip Form */}
            <div className="bg-primary-50/50 p-4 rounded-xl border border-primary-100 space-y-3">
              <h3 className="text-xs font-bold text-primary-800 uppercase">Add New Quick Chip</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Chip Label</label>
                  <input
                    type="text"
                    value={newChipLabel}
                    placeholder="e.g. 50% Off"
                    onChange={(e) => setNewChipLabel(e.target.value)}
                    className="w-full rounded-lg border-gray-200 px-3 py-1.5 text-xs bg-white border font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Query Params JSON</label>
                  <input
                    type="text"
                    value={newChipQuery}
                    onChange={(e) => setNewChipQuery(e.target.value)}
                    className="w-full rounded-lg border-gray-200 px-3 py-1.5 text-xs bg-white border font-mono"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddChip}
                className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all"
              >
                <FiPlus /> Add Chip
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Featured Selection & Drawer Filters */}
        <div className="space-y-6">
          {/* Card: Enabled Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <FiSliders className="text-primary-500" />
              Filter Options Drawer
            </h2>
            <p className="text-xs text-gray-400 font-medium">Check the filter inputs to enable them inside the Shop filter drawer panel.</p>
            <div className="space-y-2">
              {Object.keys(enabledFilters).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl cursor-pointer select-none transition-colors border border-transparent hover:border-gray-100"
                >
                  <span className="text-sm font-semibold capitalize text-gray-700">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={enabledFilters[key]}
                      onChange={() => handleToggleFilter(key)}
                      className="sr-only"
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors ${enabledFilters[key] ? 'bg-primary-500' : 'bg-gray-200'}`}>
                      <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow ${enabledFilters[key] ? 'translate-x-4' : ''}`} />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Card: Featured Categories */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <FiCheck className="text-primary-500" />
              Featured Categories
            </h2>
            <p className="text-xs text-gray-400 font-medium">Select categories to pin on the Shop header shortcut list. (All root if empty)</p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-gray-55">
              {allCategories.map(cat => (
                <label key={cat.id || cat._id} className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer p-1 rounded hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={featuredCategories.includes(cat.id || cat._id)}
                    onChange={() => handleToggleCategory(cat.id || cat._id)}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span>{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Card: Featured Brands */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <FiCheck className="text-primary-500" />
              Featured Brands
            </h2>
            <p className="text-xs text-gray-400 font-medium">Select brands to display in the popular brand lists carousel. (All if empty)</p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-gray-55">
              {allBrands.map(brand => (
                <label key={brand._id || brand.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer p-1 rounded hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={featuredBrands.includes(brand._id || brand.id)}
                    onChange={() => handleToggleBrand(brand._id || brand.id)}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span>{brand.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopConfiguration;
