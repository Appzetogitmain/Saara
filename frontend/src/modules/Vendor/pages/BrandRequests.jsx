import { useState, useEffect } from "react";
import { FiPlus, FiSearch, FiEdit2, FiInfo, FiUpload, FiX } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../../../modules/Admin/components/DataTable";
import AnimatedSelect from "../../../modules/Admin/components/AnimatedSelect";
import { useBrandStore } from "../../../shared/store/brandStore";
import { uploadVendorImage } from "../services/vendorService";

const BrandRequests = () => {
  const { brandRequests, fetchBrandRequests, requestBrand, resubmitBrand } = useBrandStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null); // If set, we are in Edit/Resubmit mode
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
    fetchBrandRequests();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenRequestModal = (reqToEdit = null) => {
    if (reqToEdit) {
      setEditingRequest(reqToEdit);
      setFormData({
        brandName: reqToEdit.brandName || "",
        description: reqToEdit.description || "",
        website: reqToEdit.website || "",
        logo: reqToEdit.logo || "",
        country: reqToEdit.country || "",
        ownershipType: reqToEdit.ownershipType || "private_label",
        reason: reqToEdit.reason || "",
        requestedVisibility: reqToEdit.requestedVisibility || "private",
      });
    } else {
      setEditingRequest(null);
      setFormData({
        brandName: "",
        description: "",
        website: "",
        logo: "",
        country: "",
        ownershipType: "private_label",
        reason: "",
        requestedVisibility: "private",
      });
    }
    setShowModal(true);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const response = await uploadVendorImage(file, "brands");
      const logoUrl = response?.data?.url;
      if (!logoUrl) {
        toast.error("Logo upload failed");
        return;
      }
      setFormData((prev) => ({ ...prev, logo: logoUrl }));
      toast.success("Logo uploaded");
    } catch (error) {
      // Handled by api interceptor
    } finally {
      setIsUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.brandName.trim()) {
      toast.error("Brand name is required");
      return;
    }

    try {
      if (editingRequest) {
        await resubmitBrand(editingRequest._id, formData);
      } else {
        await requestBrand(formData);
      }
      setShowModal(false);
      fetchBrandRequests();
    } catch (error) {
      // Error handled by store/api
    }
  };

  const filteredRequests = brandRequests.filter((req) => {
    const matchesSearch =
      !searchQuery ||
      req.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (req.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || req.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "brandName",
      label: "Brand Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          {row.logo ? (
            <img
              src={row.logo}
              alt={value}
              className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-400 text-xs">
              NO LOGO
            </div>
          )}
          <div>
            <span className="font-semibold text-gray-900 block">{value}</span>
            {row.website && (
              <a
                href={row.website}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-500 hover:underline">
                {row.website}
              </a>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "requestedVisibility",
      label: "Type",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
            value === "global"
              ? "bg-purple-100 text-purple-800"
              : "bg-blue-100 text-blue-800"
          }`}>
          {value === "global" ? "Global" : "Private (My Brand)"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value, row) => (
        <div>
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
          {value === "rejected" && row.rejectionReason && (
            <div className="text-xs text-red-600 mt-1 max-w-[220px] font-medium flex items-start gap-1">
              <FiInfo className="mt-0.5 flex-shrink-0" />
              <span>Reason: {row.rejectionReason}</span>
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
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.status === "rejected" && (
            <button
              onClick={() => handleOpenRequestModal(row)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
              title="Edit and Resubmit Brand Request">
              <FiEdit2 />
              <span>Edit & Resubmit</span>
            </button>
          )}
        </div>
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
            My Brand Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Submit global or private brand requests and track their approval statuses.
          </p>
        </div>
        <button
          onClick={() => handleOpenRequestModal(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-semibold text-sm shadow-md">
          <FiPlus />
          <span>New Brand Request</span>
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
              placeholder="Search requested brand name..."
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

      {/* Brand Request Modal */}
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
                    {editingRequest ? "Edit & Resubmit Request" : "New Brand Request"}
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
                      Brand Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="brandName"
                      value={formData.brandName}
                      onChange={handleChange}
                      required
                      placeholder="e.g. Raj Comfort, ABC Shoes"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Visibility Request <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-4 mt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="requestedVisibility"
                          value="private"
                          checked={formData.requestedVisibility === "private"}
                          onChange={handleChange}
                          className="text-primary-600 focus:ring-primary-500 w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700">Vendor-Owned (Private)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="requestedVisibility"
                          value="global"
                          checked={formData.requestedVisibility === "global"}
                          onChange={handleChange}
                          className="text-primary-600 focus:ring-primary-500 w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700">Global Brand</span>
                      </label>
                    </div>
                  </div>

                  {formData.requestedVisibility === "private" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Ownership Type
                      </label>
                      <AnimatedSelect
                        name="ownershipType"
                        value={formData.ownershipType}
                        onChange={handleChange}
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
                        onChange={handleChange}
                        placeholder="e.g. India"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
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
                        onChange={handleChange}
                        placeholder="e.g. https://abc.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Logo Image
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 hover:border-primary-500 hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-semibold transition-colors bg-white">
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
                            className="w-12 h-12 object-contain rounded-lg border border-gray-200 p-1"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, logo: "" }))}
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
                      placeholder="Enter brand description..."
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
                      placeholder="Why do you want this brand?"
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
                      disabled={isUploadingLogo}
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

export default BrandRequests;
