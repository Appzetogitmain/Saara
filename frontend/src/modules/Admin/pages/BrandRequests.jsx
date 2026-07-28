import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiX, FiGlobe, FiEye, FiSearch, FiInfo } from "react-icons/fi";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../components/DataTable";
import AnimatedSelect from "../components/AnimatedSelect";
import ConfirmModal from "../components/ConfirmModal";
import {
  getAllBrandRequests,
  approveBrandRequest,
  rejectBrandRequest,
  convertToGlobalBrandRequest,
} from "../services/adminService";

const BrandRequests = () => {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("pending");

  // Dialog states
  const [actionRequest, setActionRequest] = useState(null); // { type: 'approve'|'reject'|'convert', request }
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await getAllBrandRequests({
        page,
        limit: 10,
        status: selectedStatus === "all" ? "" : selectedStatus,
        search: searchQuery,
      });
      const data = res?.requests ? res : (res?.data || res || {});
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      console.error("Failed to fetch brand requests", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [page, selectedStatus, searchQuery]);

  const handleAction = async () => {
    if (!actionRequest) return;
    const { type, request } = actionRequest;

    try {
      if (type === "approve") {
        await approveBrandRequest(request._id);
        toast.success("Brand request approved successfully!");
      } else if (type === "reject") {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is required");
          return;
        }
        await rejectBrandRequest(request._id, rejectionReason.trim());
        toast.success("Brand request rejected.");
      } else if (type === "convert") {
        await convertToGlobalBrandRequest(request._id);
        toast.success("Brand request converted to global and approved!");
      }
      setActionRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch (err) {
      // Handled by api interceptor
    }
  };

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
                Visit Website
              </a>
            )}
          </div>
        </div>
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
          <span className="text-xs text-gray-500">{row.vendorId?.email}</span>
        </div>
      ),
    },
    {
      key: "storeName",
      label: "Store Name",
      sortable: false,
      render: (_, row) => (
        <span className="text-sm font-medium text-gray-700">
          {row.vendorId?.storeName || "N/A"}
        </span>
      ),
    },
    {
      key: "requestedVisibility",
      label: "Visibility",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
            value === "global"
              ? "bg-purple-100 text-purple-800"
              : "bg-blue-100 text-blue-800"
          }`}>
          {value === "global" ? "Global" : "Private"}
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
            <div className="text-[11px] text-red-500 mt-1 max-w-[180px] truncate" title={row.rejectionReason}>
              Reason: {row.rejectionReason}
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
          {new Date(value).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
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
                onClick={() => setActionRequest({ type: "approve", request: row })}
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
              {row.requestedVisibility === "private" && (
                <button
                  onClick={() => setActionRequest({ type: "convert", request: row })}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Approve and Convert to Global">
                  <FiGlobe />
                </button>
              )}
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
            Brand Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Review and moderate brand requests submitted by marketplace vendors.
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
          data={requests}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
          totalItems={total}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      {/* Confirmation & Rejection Modals */}
      {actionRequest && (
        <ConfirmModal
          isOpen={!!actionRequest}
          onClose={() => {
            setActionRequest(null);
            setRejectionReason("");
          }}
          onConfirm={handleAction}
          title={
            actionRequest.type === "approve"
              ? "Approve Brand Request?"
              : actionRequest.type === "reject"
              ? "Reject Brand Request?"
              : "Convert to Global Brand?"
          }
          message={
            actionRequest.type === "approve" ? (
              `Are you sure you want to approve the brand request for "${actionRequest.request.brandName}"?`
            ) : actionRequest.type === "reject" ? (
              <div className="space-y-3">
                <p>Please enter the reason for rejecting the brand request for "{actionRequest.request.brandName}":</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  rows={3}
                  placeholder="Trademark already exists / Incorrect website..."
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-semibold text-amber-700 flex items-center gap-1">
                  <FiInfo /> This brand will become visible and selectable by ALL vendors.
                </p>
                <p>Are you sure you want to approve and convert "{actionRequest.request.brandName}" to a Global Brand? This action cannot be undone.</p>
              </div>
            )
          }
          confirmText={
            actionRequest.type === "approve"
              ? "Approve"
              : actionRequest.type === "reject"
              ? "Reject"
              : "Convert to Global"
          }
          cancelText="Cancel"
          type={actionRequest.type === "reject" ? "danger" : "primary"}
        />
      )}
    </motion.div>
  );
};

export default BrandRequests;
