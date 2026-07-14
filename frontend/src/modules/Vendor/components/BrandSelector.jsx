import { useState, useEffect, useRef } from "react";
import { FiChevronDown, FiPlus, FiSearch, FiUpload, FiX } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useBrandStore } from "../../../shared/store/brandStore";
import { uploadVendorImage } from "../services/vendorService";
import AnimatedSelect from "../../../modules/Admin/components/AnimatedSelect";

const BrandSelector = ({ value, onChange, name = "brandId", error }) => {
  const { brands, initialize, requestBrand } = useBrandStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  // Brand Request Modal state inside selector
  const [showModal, setShowModal] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [formData, setFormData] = useState({
    brandName: "",
    description: "",
    website: "",
    logo: "",
    country: "",
    ownershipType: "private_label",
    reason: "",
    requestedVisibility: "private",
  });

  useEffect(() => {
    initialize();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedBrandObj = brands.find((b) => String(b._id || b.id) === String(value));

  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const globalBrands = filteredBrands.filter((b) => b.visibility === "global");
  const myBrands = filteredBrands.filter((b) => b.visibility === "private");

  const handleSelect = (brandId) => {
    onChange({ target: { name, value: brandId } });
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange({ target: { name, value: "" } });
  };

  const handleOpenRequest = (visibilityType) => {
    setFormData({
      brandName: "",
      description: "",
      website: "",
      logo: "",
      country: "",
      ownershipType: "private_label",
      reason: "",
      requestedVisibility: visibilityType,
    });
    setIsOpen(false);
    setShowModal(true);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setIsUploadingLogo(true);
    try {
      const res = await uploadVendorImage(file, "brands");
      if (res?.data?.url) {
        setFormData((prev) => ({ ...prev, logo: res.data.url }));
        toast.success("Logo uploaded successfully");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!formData.brandName.trim()) {
      toast.error("Brand name is required");
      return;
    }
    try {
      await requestBrand(formData);
      setShowModal(false);
    } catch (err) {
      // Handled
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        Brand
      </label>

      {/* Select Field trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2 border rounded-lg cursor-pointer bg-white transition-all duration-200 ${
          error ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-primary-200"
        } ${isOpen ? "ring-2 ring-primary-500/20 border-primary-500" : ""}`}>
        {selectedBrandObj ? (
          <div className="flex items-center gap-2">
            {selectedBrandObj.logo && (
              <img
                src={selectedBrandObj.logo}
                alt={selectedBrandObj.name}
                className="w-5 h-5 object-contain"
              />
            )}
            <span className="text-sm text-gray-800 font-medium">
              {selectedBrandObj.name}
              {selectedBrandObj.visibility === "private" && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                  MY BRAND
                </span>
              )}
            </span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">Select Brand</span>
        )}

        <div className="flex items-center gap-1">
          {value && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
              <FiX size={14} />
            </button>
          )}
          <FiChevronDown
            className={`text-gray-400 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[999] overflow-hidden flex flex-col max-h-[350px]">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <FiSearch className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brands..."
                className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-400 py-1"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Brands list */}
            <div className="flex-1 overflow-y-auto p-1 space-y-2 max-h-[220px] scrollbar-admin">
              {/* My Brands Section */}
              {myBrands.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                    My Brands
                  </div>
                  {myBrands.map((b) => (
                    <div
                      key={b.id || b._id}
                      onClick={() => handleSelect(b.id || b._id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-blue-50 text-sm transition-colors ${
                        String(value) === String(b.id || b._id)
                          ? "bg-blue-50/50 text-blue-700 font-semibold"
                          : "text-gray-700"
                      }`}>
                      {b.logo && (
                        <img
                          src={b.logo}
                          alt={b.name}
                          className="w-5 h-5 object-contain rounded border border-gray-200 bg-white"
                        />
                      )}
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Global Brands Section */}
              {globalBrands.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Global Brands
                  </div>
                  {globalBrands.map((b) => (
                    <div
                      key={b.id || b._id}
                      onClick={() => handleSelect(b.id || b._id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 text-sm transition-colors ${
                        String(value) === String(b.id || b._id)
                          ? "bg-primary-50 text-primary-700 font-semibold"
                          : "text-gray-700"
                      }`}>
                      {b.logo && (
                        <img
                          src={b.logo}
                          alt={b.name}
                          className="w-5 h-5 object-contain rounded border border-gray-200 bg-white"
                        />
                      )}
                      <span>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {globalBrands.length === 0 && myBrands.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400">
                  No brands found
                </div>
              )}
            </div>

            {/* Dropdown Footer Actions */}
            <div className="grid grid-cols-2 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={() => handleOpenRequest("private")}
                className="flex items-center justify-center gap-1 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border-r border-gray-100 transition-colors">
                <FiPlus size={12} />
                <span>Create My Brand</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenRequest("global")}
                className="flex items-center justify-center gap-1 py-2 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
                <FiPlus size={12} />
                <span>Request Global Brand</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brand Request Modal inside Selector */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    {formData.requestedVisibility === "private"
                      ? "Create Private Brand"
                      : "Request Global Brand"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                    <FiX size={18} />
                  </button>
                </div>

                <form onSubmit={handleModalSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Brand Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="brandName"
                      value={formData.brandName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, brandName: e.target.value }))
                      }
                      required
                      placeholder="e.g. My Shoes Store"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>

                  {formData.requestedVisibility === "private" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Ownership Type
                      </label>
                      <AnimatedSelect
                        name="ownershipType"
                        value={formData.ownershipType}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, ownershipType: e.target.value }))
                        }
                        options={[
                          { value: "manufacturer", label: "Manufacturer" },
                          { value: "reseller", label: "Reseller" },
                          { value: "distributor", label: "Distributor" },
                          { value: "private_label", label: "Private Label" },
                        ]}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, country: e.target.value }))
                        }
                        placeholder="e.g. India"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Website
                      </label>
                      <input
                        type="text"
                        name="website"
                        value={formData.website}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, website: e.target.value }))
                        }
                        placeholder="e.g. https://domain.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Logo Image
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 hover:border-primary-500 rounded-lg cursor-pointer text-xs font-semibold transition-colors bg-white">
                        <FiUpload />
                        <span>{isUploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={isUploadingLogo}
                        />
                      </label>
                      {formData.logo && (
                        <div className="relative">
                          <img
                            src={formData.logo}
                            alt="Logo preview"
                            className="w-12 h-12 object-contain rounded border border-gray-200 p-1"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, logo: "" }))}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
                            <FiX size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={2}
                      placeholder="Describe the brand..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Reason for Request
                    </label>
                    <textarea
                      name="reason"
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, reason: e.target.value }))
                      }
                      rows={2}
                      placeholder="Why request this brand?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingLogo}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-colors shadow-md disabled:opacity-50">
                      Submit Request
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BrandSelector;
