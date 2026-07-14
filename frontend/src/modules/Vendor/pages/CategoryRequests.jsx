import { useState, useEffect } from "react";
import { FiPlus, FiSearch, FiEdit2, FiInfo, FiUpload, FiX } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../../../modules/Admin/components/DataTable";
import AnimatedSelect from "../../../modules/Admin/components/AnimatedSelect";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { uploadVendorImage } from "../services/vendorService";

const CategoryRequests = () => {
  const { categories, getCategories, categoryRequests, fetchCategoryRequests, requestCategory, resubmitCategoryRequest } = useCategoryStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    categoryName: "",
    description: "",
    image: "",
    reason: "",
    requestedParentCategoryId: "",
  });

  useEffect(() => {
    fetchCategoryRequests();
    getCategories(); // Load approved categories for parent select list
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenRequestModal = (reqToEdit = null) => {
    if (reqToEdit) {
      setEditingRequest(reqToEdit);
      setFormData({
        categoryName: reqToEdit.categoryName || "",
        description: reqToEdit.description || "",
        image: reqToEdit.image || "",
        reason: reqToEdit.reason || "",
        requestedParentCategoryId: reqToEdit.requestedParentCategoryId?._id || reqToEdit.requestedParentCategoryId || "",
      });
    } else {
      setEditingRequest(null);
      setFormData({
        categoryName: "",
        description: "",
        image: "",
        reason: "",
        requestedParentCategoryId: "",
      });
    }
    setShowModal(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadVendorImage(file, "categories");
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error("Image upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, image: imageUrl }));
      toast.success("Image uploaded");
    } catch (error) {
      // Handled
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    try {
      if (editingRequest) {
        await resubmitCategoryRequest(editingRequest._id, formData);
      } else {
        await requestCategory(formData);
      }
      setShowModal(false);
      fetchCategoryRequests();
    } catch (error) {
      // Handled
    }
  };

  const filteredRequests = categoryRequests.filter((req) => {
    const matchesSearch =
      !searchQuery ||
      req.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || req.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "categoryName",
      label: "Category Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {row.image ? (
            <img
              src={row.image}
              alt={value}
              className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-400 text-xs">
              NO IMAGE
            </div>
          )}
          <div>
            <span className="font-semibold text-gray-900 block">{value}</span>
            {row.description && (
              <span className="text-xs text-gray-500 line-clamp-1">{row.description}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "requestedParentCategoryId",
      label: "Requested Parent",
      sortable: true,
      render: (value, row) => (
        <span className="text-sm font-medium text-gray-700">
          {row.requestedParentCategoryId?.name || "Root (None)"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value, row) => (
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                value === "approved"
                  ? "bg-green-100 text-green-800"
                  : value === "rejected"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
              {value}
            </span>
            {value === "rejected" && (
              <button
                onClick={() => handleOpenRequestModal(row)}
                className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[10px] font-bold transition-colors"
                title="Edit and Resubmit Request">
                <FiEdit2 size={10} />
                <span>Resubmit</span>
              </button>
            )}
          </div>
          {value === "rejected" && row.rejectionReason && (
            <div className="text-xs text-red-600 font-medium flex items-start gap-1 mt-1 max-w-[240px]">
              <FiInfo className="mt-0.5 flex-shrink-0" />
              <span>Reason: {row.rejectionReason}</span>
            </div>
          )}
          {row.resubmittedCount > 0 && (
            <div className="text-[10px] text-blue-600 font-medium mt-0.5">
              Resubmitted {row.resubmittedCount} time(s)
            </div>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Date Requested",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Category Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Submit catalog category requests and track their review history.
          </p>
        </div>
        <button
          onClick={() => handleOpenRequestModal(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-semibold text-sm shadow-md">
          <FiPlus />
          <span>Request New Category</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requested category name..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          <AnimatedSelect
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
            className="w-full sm:w-auto min-w-[160px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredRequests}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>

      {/* Category Request Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 bg-black/50 z-[999]"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                  <h2 className="text-xl font-bold text-gray-800">
                    {editingRequest ? "Edit & Resubmit Request" : "New Category Request"}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
                    <FiX size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Category Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="categoryName"
                      value={formData.categoryName}
                      onChange={handleChange}
                      required
                      placeholder="e.g. Wireless Chargers, Ethnic Jackets"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Parent Category
                    </label>
                    <AnimatedSelect
                      name="requestedParentCategoryId"
                      value={formData.requestedParentCategoryId}
                      onChange={handleChange}
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
                    <p className="text-[10px] text-gray-500 mt-1">
                      Select where this category belongs in the catalog hierarchy.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Category Image
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 hover:border-primary-500 hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-semibold transition-colors bg-white">
                        <FiUpload />
                        <span>{isUploadingImage ? "Uploading..." : "Upload Image"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={isUploadingImage}
                        />
                      </label>
                      {formData.image && (
                        <div className="relative">
                          <img
                            src={formData.image}
                            alt="Category preview"
                            className="w-12 h-12 object-contain rounded-lg border border-gray-200 p-1"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
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
                      onChange={handleChange}
                      rows={2}
                      placeholder="Brief description of the category..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Reason for Request
                    </label>
                    <textarea
                      name="reason"
                      value={formData.reason}
                      onChange={handleChange}
                      rows={2}
                      placeholder="Why do we need this category?"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold transition-colors">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingImage}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-semibold transition-colors shadow-md disabled:opacity-50">
                      {editingRequest ? "Resubmit Request" : "Submit Request"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CategoryRequests;
