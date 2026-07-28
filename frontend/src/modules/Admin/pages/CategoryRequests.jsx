import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiX, FiEye, FiSearch, FiInfo } from "react-icons/fi";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../components/DataTable";
import AnimatedSelect from "../components/AnimatedSelect";
import ConfirmModal from "../components/ConfirmModal";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import {
  getAllCategoryRequests,
  approveCategoryRequest,
  rejectCategoryRequest,
} from "../services/adminService";

const CategoryRequests = () => {
  const { categories, getCategories } = useCategoryStore();
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("pending");

  // Dialog & Form states
  const [actionRequest, setActionRequest] = useState(null); // { type: 'approve'|'reject', request }
  const [rejectionReason, setRejectionReason] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [mergeWithCategoryId, setMergeWithCategoryId] = useState("");

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await getAllCategoryRequests({
        page,
        limit: 10,
        status: selectedStatus === "all" ? "" : selectedStatus,
        search: searchQuery,
      });
      const data = res?.requests ? res : (res?.data || res || {});
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error("Failed to fetch category requests", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    getCategories(); // ensure categories are loaded for parent selection
  }, [page, selectedStatus, searchQuery]);

  const handleAction = async () => {
    if (!actionRequest) return;
    const { type, request } = actionRequest;

    try {
      if (type === "approve") {
        await approveCategoryRequest(request._id, {
          parentCategoryId: parentCategoryId || undefined,
          mergeWithCategoryId: mergeWithCategoryId || undefined,
        });
        toast.success(
          mergeWithCategoryId
            ? "Category request merged successfully!"
            : "Category request approved!"
        );
      } else if (type === "reject") {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required");
          return;
        }
        await rejectCategoryRequest(request._id, rejectionReason.trim());
        toast.success("Category request rejected.");
      }
      setActionRequest(null);
      setRejectionReason("");
      setParentCategoryId("");
      setMergeWithCategoryId("");
      fetchRequests();
    } catch (err) {
      // Handled by api interceptor
    }
  };

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
              <span className="text-xs text-gray-500 line-clamp-1">
                {row.description}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "requestedParentCategoryId",
      label: "Requested Parent",
      sortable: false,
      render: (value, row) => (
        <span className="text-sm font-medium text-gray-700">
          {row.requestedParentCategoryId?.name || "Root (None)"}
        </span>
      ),
    },
    {
      key: "vendorId",
      label: "Requested By",
      sortable: false,
      render: (_, row) => (
        <div>
          <span className="font-medium text-gray-800 block">
            {row.vendorId?.name || "Unknown"}
          </span>
          <span className="text-xs text-gray-500">
            {row.vendorId?.storeName || row.vendorId?.email}
          </span>
        </div>
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
            <div className="text-[11px] text-red-500 mt-1 max-w-[180px] truncate" title={row.rejectionReason}>
              Reason: {row.rejectionReason}
            </div>
          )}
          {row.resubmittedCount > 0 && (
            <div className="text-[10px] text-blue-600 mt-0.5 font-medium">
              Resubmitted {row.resubmittedCount} time(s)
            </div>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Requested Date",
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
        <div className="flex items-center gap-1">
          {row.vendorId && (
            <Link
              to={`/admin/vendors/${row.vendorId?._id || row.vendorId}`}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="View Vendor Profile">
              <FiEye />
            </Link>
          )}
          {row.status === "pending" && (
            <>
              <button
                onClick={() => {
                  setActionRequest({ type: "approve", request: row });
                  setParentCategoryId(row.requestedParentCategoryId?._id || "");
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve Request">
                <FiCheck />
              </button>
              <button
                onClick={() => setActionRequest({ type: "reject", request: row })}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reject Request">
                <FiX />
              </button>
            </>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 lg:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Category Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Moderate catalog category requests submitted by marketplace vendors.
          </p>
        </div>
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
          data={requests}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
          totalItems={total}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* Approve Modal */}
      {actionRequest && actionRequest.type === "approve" && (
        <ConfirmModal
          isOpen={true}
          onClose={() => {
            setActionRequest(null);
            setParentCategoryId("");
            setMergeWithCategoryId("");
          }}
          onConfirm={handleAction}
          title="Approve Category Request?"
          message={
            <div className="space-y-4 text-left">
              <p className="text-sm text-gray-600">
                You are approving the request for <strong>"{actionRequest.request.categoryName}"</strong>.
              </p>
              
              <div className="border border-purple-200 bg-purple-50 p-3 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-purple-800">
                  Option A: Merge with Existing Category
                </label>
                <AnimatedSelect
                  value={mergeWithCategoryId}
                  onChange={(e) => {
                    setMergeWithCategoryId(e.target.value);
                    if (e.target.value) setParentCategoryId(""); // merge overrides creating a new one
                  }}
                  options={[
                    { value: "", label: "Create as new category (Do not merge)" },
                    ...categories
                      .filter((c) => c.isActive !== false)
                      .map((c) => ({
                        value: String(c.id || c._id),
                        label: c.name,
                      })),
                  ]}
                />
                <p className="text-[10px] text-purple-600">
                  If selected, this request maps to the existing category instead of creating a duplicate.
                </p>
              </div>

              {!mergeWithCategoryId && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700">
                    Option B: Create New Category - Choose Parent Category
                  </label>
                  <AnimatedSelect
                    value={parentCategoryId}
                    onChange={(e) => setParentCategoryId(e.target.value)}
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
                  <p className="text-[10px] text-gray-500">
                    Choose the parent node in the catalog. You can keep the vendor's choice or override it.
                  </p>
                </div>
              )}
            </div>
          }
          confirmText="Approve"
          cancelText="Cancel"
          type="primary"
        />
      )}

      {/* Rejection Modal */}
      {actionRequest && actionRequest.type === "reject" && (
        <ConfirmModal
          isOpen={true}
          onClose={() => {
            setActionRequest(null);
            setRejectionReason("");
          }}
          onConfirm={handleAction}
          title="Reject Category Request?"
          message={
            <div className="space-y-3 text-left">
              <p className="text-sm text-gray-600">
                Are you sure you want to reject the request for "{actionRequest.request.categoryName}"?
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                rows={3}
                placeholder="Reason: Category already exists under Accessories..."
                required
              />
            </div>
          }
          confirmText="Reject"
          cancelText="Cancel"
          type="danger"
        />
      )}
    </motion.div>
  );
};

export default CategoryRequests;
