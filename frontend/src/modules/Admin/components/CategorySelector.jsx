import { useState, useRef, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronRight, FiPlus, FiUpload, FiX } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { uploadVendorImage } from "../../../modules/Vendor/services/vendorService";
import AnimatedSelect from "./AnimatedSelect";
import toast from "react-hot-toast";

const CategorySelector = ({
  value,
  subcategoryId,
  onChange,
  required = false,
  className = "",
}) => {
  const isVendorArea = typeof window !== "undefined" && window.location.pathname.startsWith("/vendor");
  const {
    categories,
    getRootCategories,
    getCategoriesByParent,
    getCategoryById,
    requestCategory,
  } = useCategoryStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const containerRef = useRef(null);
  const parentDropdownRef = useRef(null);
  const subcategoryDropdownRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Category Request Popup state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [requestFormData, setRequestFormData] = useState({
    categoryName: "",
    description: "",
    image: "",
    reason: "",
    requestedParentCategoryId: "",
  });

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestFormData.categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    try {
      await requestCategory(requestFormData);
      setShowRequestModal(false);
      setRequestFormData({
        categoryName: "",
        description: "",
        image: "",
        reason: "",
        requestedParentCategoryId: "",
      });
    } catch (err) {
      // Handled
    }
  };

  const handleRequestImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setIsUploadingImage(true);
    try {
      const res = await uploadVendorImage(file, "categories");
      const payload = res?.data ?? res ?? {};
      if (payload?.url) {
        setRequestFormData((prev) => ({ ...prev, image: payload.url }));
        toast.success("Image uploaded");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Get root categories (parent categories)
  const rootCategories = useMemo(() => {
    return getRootCategories().filter((cat) => cat.isActive !== false);
  }, [categories, getRootCategories]);

  // Get selected category and subcategory info
  const selectedCategory = value ? getCategoryById(value) : null;
  const selectedSubcategory = subcategoryId
    ? getCategoryById(subcategoryId)
    : null;
  const parentCategory = selectedSubcategory
    ? getCategoryById(selectedSubcategory.parentId)
    : selectedCategory;

  // Get subcategories for hovered category
  const hoveredSubcategories = useMemo(() => {
    if (!hoveredCategoryId) return [];
    return getCategoriesByParent(hoveredCategoryId).filter(
      (cat) => cat.isActive !== false
    );
  }, [hoveredCategoryId, categories, getCategoriesByParent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHoveredCategoryId(null);
        // Clear any pending timeout
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        // Cleanup timeout on unmount
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      };
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Position subcategory dropdown to the right of parent dropdown
  useEffect(() => {
    if (
      hoveredCategoryId &&
      subcategoryDropdownRef.current &&
      parentDropdownRef.current &&
      containerRef.current
    ) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const parentDropdownRect =
        parentDropdownRef.current.getBoundingClientRect();
      const hoveredElement = parentDropdownRef.current.querySelector(
        `[data-category-id="${hoveredCategoryId}"]`
      );

      if (hoveredElement) {
        const elementRect = hoveredElement.getBoundingClientRect();
        const dropdown = subcategoryDropdownRef.current;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = 200; // min-w-[200px]

        // Position to the right of the parent dropdown container
        // Calculate left position relative to container
        let left = parentDropdownRect.right - containerRect.left + 8; // Right edge of parent dropdown + gap
        // Calculate top position to align with hovered item, relative to container
        let top = elementRect.top - containerRect.top;

        // Check if dropdown would overflow viewport, adjust if needed
        const rightEdge = parentDropdownRect.right + dropdownWidth + 8;
        if (rightEdge > viewportWidth - 20) {
          // Position to the left of parent dropdown instead
          left =
            parentDropdownRect.left - containerRect.left - dropdownWidth - 8;
        }

        // Ensure dropdown doesn't go above or below viewport
        if (top < 0) {
          top = 0;
        }

        // Ensure dropdown doesn't go below the parent dropdown
        const maxTop = parentDropdownRect.height - 40; // Leave some space
        if (top > maxTop) {
          top = maxTop;
        }

        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      }
    }
  }, [hoveredCategoryId, isOpen]);

  const handleCategorySelect = (categoryId) => {
    // Clear subcategory when selecting a new parent
    onChange({
      target: {
        name: "categoryId",
        value: categoryId,
      },
    });
    onChange({
      target: {
        name: "subcategoryId",
        value: "",
      },
    });
    setIsOpen(false);
    setHoveredCategoryId(null);
  };

  const handleSubcategorySelect = (subcategoryId, parentId) => {
    onChange({
      target: {
        name: "categoryId",
        value: parentId,
      },
    });
    onChange({
      target: {
        name: "subcategoryId",
        value: subcategoryId,
      },
    });
    setIsOpen(false);
    setHoveredCategoryId(null);
  };

  // Display text
  const displayText = useMemo(() => {
    if (selectedSubcategory && parentCategory) {
      return `${parentCategory.name} (${selectedSubcategory.name})`;
    }
    if (selectedCategory) {
      return selectedCategory.name;
    }
    return "Select Category";
  }, [selectedCategory, selectedSubcategory, parentCategory]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected Value Display */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          // Clear any pending timeout when toggling
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
          }
          if (!isOpen) {
            setHoveredCategoryId(null);
          }
        }}
        className={`w-full px-4 py-2.5 text-left border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white flex items-center justify-between transition-all duration-200 hover:border-primary-400 ${
          !value ? "text-gray-500" : "text-gray-900"
        }`}>
        <span className="truncate">{displayText}</span>
        <FiChevronDown
          className={`ml-2 text-gray-500 transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setIsOpen(false);
                setHoveredCategoryId(null);
              }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden"
            />

            {/* Categories Dropdown */}
            <motion.div
              ref={parentDropdownRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
              <div className="py-1">
                {rootCategories.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-gray-500 text-center">
                    No categories available
                  </div>
                ) : (
                  rootCategories.map((category) => {
                    const subcategories = getCategoriesByParent(
                      category.id
                    ).filter((cat) => cat.isActive !== false);
                    const hasSubcategories = subcategories.length > 0;
                    const isSelected = value === category.id && !subcategoryId;
                    const isHovered = hoveredCategoryId === category.id;

                    return (
                      <div key={category.id} data-category-id={category.id}>
                        <motion.div
                          whileHover={{
                            backgroundColor: isSelected
                              ? "rgba(40, 116, 240, 0.1)"
                              : "rgba(249, 250, 251, 1)",
                          }}
                          className={`px-4 py-2 cursor-pointer flex items-center justify-between transition-colors duration-150 ${
                            isSelected
                              ? "bg-primary-50 text-primary-600"
                              : "text-gray-900"
                          }`}
                          onClick={() => {
                            if (!hasSubcategories) {
                              handleCategorySelect(category.id);
                            } else {
                              setHoveredCategoryId(
                                hoveredCategoryId === category.id ? null : category.id
                              );
                            }
                          }}
                          onMouseEnter={() => {
                            if (hasSubcategories) {
                              // Clear any pending close timeout
                              if (closeTimeoutRef.current) {
                                clearTimeout(closeTimeoutRef.current);
                                closeTimeoutRef.current = null;
                              }
                              setHoveredCategoryId(category.id);
                            }
                          }}
                          onMouseLeave={(e) => {
                            // Clear any existing timeout
                            if (closeTimeoutRef.current) {
                              clearTimeout(closeTimeoutRef.current);
                            }
                            // 0.20 second delay before closing subcategory dropdown
                            closeTimeoutRef.current = setTimeout(() => {
                              if (subcategoryDropdownRef.current) {
                                const rect =
                                  subcategoryDropdownRef.current.getBoundingClientRect();
                                const x = e.clientX;
                                const y = e.clientY;
                                const isHoveringSub =
                                  x >= rect.left &&
                                  x <= rect.right &&
                                  y >= rect.top &&
                                  y <= rect.bottom;
                                if (!isHoveringSub) {
                                  setHoveredCategoryId(null);
                                }
                              } else {
                                setHoveredCategoryId(null);
                              }
                              closeTimeoutRef.current = null;
                            }, 200); // 0.20 seconds = 200ms
                          }}>
                          <span className="flex-1">{category.name}</span>
                          {hasSubcategories && (
                            <FiChevronRight className="ml-2 text-gray-400" />
                          )}
                        </motion.div>
                      </div>
                    );
                  })
                )}
                {isVendorArea && (
                  <div
                    onClick={() => {
                      setIsOpen(false);
                      setShowRequestModal(true);
                    }}
                    className="border-t border-gray-100 mt-1 py-2.5 px-4 text-center text-xs font-semibold text-primary-600 hover:bg-primary-50 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FiPlus size={14} />
                    <span>Request New Category</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Subcategories Dropdown - Positioned to the right of parent dropdown */}
            {hoveredCategoryId && hoveredSubcategories.length > 0 && (
              <motion.div
                ref={subcategoryDropdownRef}
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="absolute bg-white border border-gray-200 rounded-xl shadow-xl min-w-[200px] z-[60]"
                onMouseEnter={() => {
                  // Clear any pending close timeout when entering subcategory dropdown
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                  }
                  setHoveredCategoryId(hoveredCategoryId);
                }}
                onMouseLeave={() => {
                  // 0.20 second delay before closing
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                  }
                  closeTimeoutRef.current = setTimeout(() => {
                    setHoveredCategoryId(null);
                    closeTimeoutRef.current = null;
                  }, 200); // 0.20 seconds = 200ms
                }}>
                <div className="py-1 max-h-60 overflow-y-auto">
                  {/* Option to select the parent category itself */}
                  <motion.div
                    onClick={() => handleCategorySelect(hoveredCategoryId)}
                    whileHover={{
                      backgroundColor: value === hoveredCategoryId && !subcategoryId
                        ? "rgba(40, 116, 240, 0.1)"
                        : "rgba(249, 250, 251, 1)",
                    }}
                    className={`px-4 py-2 cursor-pointer font-semibold border-b border-gray-100 transition-colors duration-150 text-xs text-left ${
                      value === hoveredCategoryId && !subcategoryId
                        ? "bg-primary-50 text-primary-600"
                        : "text-gray-700 hover:text-gray-900"
                    }`}
                  >
                    All {rootCategories.find(c => String(c.id) === String(hoveredCategoryId))?.name || "Category"}
                  </motion.div>
                  {hoveredSubcategories.map((subcategory) => {
                    const isSubSelected = subcategoryId === subcategory.id;
                    return (
                      <motion.div
                        key={subcategory.id}
                        onClick={() =>
                          handleSubcategorySelect(
                            subcategory.id,
                            hoveredCategoryId
                          )
                        }
                        whileHover={{
                          backgroundColor: isSubSelected
                            ? "rgba(40, 116, 240, 0.1)"
                            : "rgba(249, 250, 251, 1)",
                        }}
                        className={`px-4 py-2 cursor-pointer transition-colors duration-150 ${
                          isSubSelected
                            ? "bg-primary-50 text-primary-600"
                            : "text-gray-900"
                        }`}>
                        {subcategory.name}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Hidden input for form validation */}
      {required && (
        <input type="hidden" value={value || ""} required={required} />
      )}

      {/* Category Request Modal inside Selector */}
      <AnimatePresence>
        {showRequestModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestModal(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <h3 className="text-lg font-bold text-gray-800">
                    Request New Category
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <form onSubmit={handleRequestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Category Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="categoryName"
                      value={requestFormData.categoryName}
                      onChange={(e) =>
                        setRequestFormData((prev) => ({ ...prev, categoryName: e.target.value }))
                      }
                      required
                      placeholder="e.g. Smart Watches"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Parent Category
                    </label>
                    <AnimatedSelect
                      name="requestedParentCategoryId"
                      value={requestFormData.requestedParentCategoryId}
                      onChange={(e) =>
                        setRequestFormData((prev) => ({
                          ...prev,
                          requestedParentCategoryId: e.target.value,
                        }))
                      }
                      options={[
                        { value: "", label: "No Parent (Root Category)" },
                        ...categories
                          .filter((c) => c.isActive !== false)
                          .map((c) => ({
                            value: String(c.id || c._id),
                            label: c.name,
                          })),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Category Image
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 hover:border-primary-500 rounded-lg cursor-pointer text-xs font-semibold transition-colors bg-white">
                        <FiUpload />
                        <span>{isUploadingImage ? "Uploading..." : "Upload Image"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleRequestImageUpload}
                          className="hidden"
                          disabled={isUploadingImage}
                        />
                      </label>
                      {requestFormData.image && (
                        <div className="relative">
                          <img
                            src={requestFormData.image}
                            alt="Category preview"
                            className="w-12 h-12 object-contain rounded border border-gray-200 p-1"
                          />
                          <button
                            type="button"
                            onClick={() => setRequestFormData((prev) => ({ ...prev, image: "" }))}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                          >
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
                      value={requestFormData.description}
                      onChange={(e) =>
                        setRequestFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={2}
                      placeholder="Enter description..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Reason for Request
                    </label>
                    <textarea
                      name="reason"
                      value={requestFormData.reason}
                      onChange={(e) =>
                        setRequestFormData((prev) => ({ ...prev, reason: e.target.value }))
                      }
                      rows={2}
                      placeholder="Why request this category?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowRequestModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingImage}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-colors shadow-md disabled:opacity-50"
                    >
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

export default CategorySelector;
