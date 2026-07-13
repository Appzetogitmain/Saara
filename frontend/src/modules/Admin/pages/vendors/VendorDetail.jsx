import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiMail,
  FiPhone,
  FiMapPin,
  FiShoppingBag,
  FiDollarSign,
  FiClock,
  FiEdit,
  FiPackage,
  FiCheckCircle,
  FiXCircle,
  FiTrendingUp,
  FiUser,
  FiFileText,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorStore } from "../../store/vendorStore";
import {
  getAllOrders,
  getVendorCommissions,
  getVendorDocuments,
  updateVendorDocumentStatus,
  bulkUpdateVendorDocumentStatus,
} from "../../services/adminService";
import Badge from "../../../../shared/components/Badge";
import DataTable from "../../components/DataTable";
import { formatPrice } from "../../../../shared/utils/helpers";
// import { formatDateTime } from '../../../utils/adminHelpers';
import toast from "react-hot-toast";

const VendorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVendor, updateVendorStatus, updateCommissionRate } =
    useVendorStore();

  const [vendor, setVendor] = useState(null);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditingCommission, setIsEditingCommission] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const [activeDocFilter, setActiveDocFilter] = useState("all");
  const [checkedDocIds, setCheckedDocIds] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingDocId, setRejectingDocId] = useState(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [isBulkReject, setIsBulkReject] = useState(false);
  const [showConfirmForceModal, setShowConfirmForceModal] = useState(false);
  const [confirmForceParams, setConfirmForceParams] = useState(null);
  const [vendorActionModal, setVendorActionModal] = useState({
    isOpen: false,
    action: "",
    reason: "",
  });
  const isSameVendorId = (a, b) => String(a) === String(b);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await getVendorDocuments(id);
      const docs = response?.data ?? response;
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (error) {
      console.error("Failed to fetch vendor documents:", error);
    }
  }, [id]);

  useEffect(() => {
    const fetchVendorData = async () => {
      // 1. Fetch Vendor Details
      const data = await getVendor(id);
      if (data) {
        setVendor(data);
        setCommissionRate(((data.commissionRate || 0) * 100).toFixed(1));

        // 2. Fetch Vendor Orders (all pages)
        try {
          const fetchedOrders = [];
          let page = 1;
          let pages = 1;
          do {
            const ordersResponse = await getAllOrders({
              vendorId: id,
              page,
              limit: 200,
            });
            const payload = ordersResponse?.data ?? ordersResponse;
            const orderPage = Array.isArray(payload?.orders) ? payload.orders : [];
            fetchedOrders.push(...orderPage);
            pages = Math.max(Number(payload?.pages) || 1, 1);
            page += 1;
          } while (page <= pages);

          const normalizedOrders = fetchedOrders.map((order) => ({
            ...order,
            id: order.orderId || order._id,
            date: order.date || order.createdAt,
          }));
          setVendorOrders(normalizedOrders);
        } catch (error) {
          console.error("Failed to fetch vendor orders:", error);
          toast.error("Failed to load vendor orders");
        }

        // 3. Fetch vendor commissions for commissions tab + earnings summary
        try {
          const fetchedCommissions = [];
          let page = 1;
          let pages = 1;
          do {
            const response = await getVendorCommissions(id, { page, limit: 200 });
            const payload = response?.data ?? response;
            const pageCommissions = Array.isArray(payload?.commissions)
              ? payload.commissions
              : [];
            fetchedCommissions.push(...pageCommissions);
            pages = Math.max(Number(payload?.pages) || 1, 1);
            page += 1;
          } while (page <= pages);
          setCommissions(fetchedCommissions);
        } catch {
          setCommissions([]);
        }

        // 4. Fetch vendor documents
        fetchDocuments();
      } else {
        toast.error("Vendor not found");
        navigate("/admin/vendors");
      }
    };
    fetchVendorData();
  }, [id, getVendor, navigate, fetchDocuments]);

  useEffect(() => {
    if (!vendor) return;

    const summary = commissions.reduce(
      (acc, row) => {
        const earnings = Number(row.vendorEarnings || 0);
        acc.totalEarnings += earnings;
        if (row.status === "pending") acc.pendingEarnings += earnings;
        return acc;
      },
      { totalEarnings: 0, pendingEarnings: 0 }
    );

    setEarningsSummary(summary);
  }, [vendor, commissions]);

  const handleUpdateDocStatus = async (docId, newStatus, remarksVal = "", force = false) => {
    try {
      const res = await updateVendorDocumentStatus(id, docId, newStatus, remarksVal, force);
      
      const payload = res?.data ?? res;
      if (res?.requiresConfirmation || payload?.requiresConfirmation) {
        setConfirmForceParams({ docId, status: newStatus, remarks: remarksVal });
        setShowConfirmForceModal(true);
        return;
      }

      toast.success(`Document status updated to ${newStatus}`);
      fetchDocuments();
      setCheckedDocIds([]);
    } catch (err) {
      const data = err.response?.data;
      if (data?.requiresConfirmation) {
        setConfirmForceParams({ docId, status: newStatus, remarks: remarksVal });
        setShowConfirmForceModal(true);
      } else {
        toast.error(data?.message || err.message || "Failed to update document status");
      }
    }
  };

  const handleConfirmForce = async () => {
    if (!confirmForceParams) return;
    const { docId, status, remarks } = confirmForceParams;
    setShowConfirmForceModal(false);
    setConfirmForceParams(null);
    await handleUpdateDocStatus(docId, status, remarks, true);
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    const trimmed = String(rejectRemarks || '').trim();
    if (!trimmed || trimmed.length < 10) {
      toast.error("Rejection remarks must be at least 10 characters long.");
      return;
    }

    setShowRejectModal(false);
    const remarksToSend = rejectRemarks;
    setRejectRemarks("");

    if (isBulkReject) {
      try {
        await bulkUpdateVendorDocumentStatus(id, checkedDocIds, "rejected", remarksToSend);
        toast.success(`Rejected ${checkedDocIds.length} documents.`);
        fetchDocuments();
        setCheckedDocIds([]);
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || "Failed bulk reject");
      }
    } else {
      await handleUpdateDocStatus(rejectingDocId, "rejected", remarksToSend);
    }
  };

  const handleBulkApprove = async () => {
    if (checkedDocIds.length === 0) return;
    try {
      await bulkUpdateVendorDocumentStatus(id, checkedDocIds, "approved");
      toast.success(`Approved ${checkedDocIds.length} documents.`);
      fetchDocuments();
      setCheckedDocIds([]);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed bulk approve");
    }
  };

  const handleBulkReject = () => {
    if (checkedDocIds.length === 0) return;
    setIsBulkReject(true);
    setRejectingDocId(null);
    setShowRejectModal(true);
  };

  const handleCheckAll = (filteredDocs) => {
    if (checkedDocIds.length === filteredDocs.length) {
      setCheckedDocIds([]);
    } else {
      setCheckedDocIds(filteredDocs.map(d => d._id));
    }
  };

  const handleCheckDoc = (docId) => {
    setCheckedDocIds(prev => 
      prev.includes(docId) 
        ? prev.filter(chk => chk !== docId)
        : [...prev, docId]
    );
  };

  const getExpiryDetails = (expiryDateStr) => {
    if (!expiryDateStr) return { text: "No Expiry", color: "text-gray-400 font-medium", badgeVariant: "info" };
    
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return {
        text: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? "s" : ""} ago`,
        color: "text-red-500 font-semibold",
        badgeVariant: "error"
      };
    } else if (diffDays <= 30) {
      return {
        text: `Expires in ${diffDays} day${diffDays > 1 ? "s" : ""}`,
        color: "text-yellow-600 font-semibold",
        badgeVariant: "warning"
      };
    } else {
      return {
        text: `Valid (Expires in ${diffDays} days)`,
        color: "text-green-600 font-medium",
        badgeVariant: "success"
      };
    }
  };

  const renderPreviewContent = (doc) => {
    if (!doc) return null;
    const fileType = String(doc.fileType || "").toLowerCase();
    
    if (fileType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].some(ext => doc.fileUrl.toLowerCase().endsWith(ext))) {
      return (
        <img 
          src={doc.fileUrl} 
          alt={doc.name} 
          className="max-h-[60vh] object-contain mx-auto rounded-lg shadow-md"
        />
      );
    } else if (fileType === "application/pdf" || doc.fileUrl.toLowerCase().endsWith(".pdf")) {
      return (
        <iframe 
          src={`${doc.fileUrl}#toolbar=0`} 
          title={doc.name} 
          className="w-full h-[60vh] rounded-lg border border-gray-200"
        />
      );
    } else {
      return (
        <div className="p-8 text-center text-gray-500">
          <p className="mb-4">Preview not supported for this file format.</p>
          <a 
            href={doc.fileUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Open in new tab
          </a>
        </div>
      );
    }
  };

  const handleStatusUpdate = async (newStatus, reason = "") => {
    const success = await updateVendorStatus(vendor.id, newStatus, reason);
    if (success) {
      setVendor({ ...vendor, status: newStatus });
      toast.success(`Vendor status updated to ${newStatus}`);
      return true;
    } else {
      toast.error("Failed to update vendor status");
      return false;
    }
  };

  const handleCommissionUpdate = async () => {
    const rate = parseFloat(commissionRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error("Please enter a valid commission rate (0-100%)");
      return;
    }
    const success = await updateCommissionRate(vendor.id, rate);
    if (success) {
      setVendor({ ...vendor, commissionRate: rate });
      setIsEditingCommission(false);
      toast.success("Commission rate updated successfully");
    } else {
      toast.error("Failed to update commission rate");
    }
  };

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const orderColumns = [
    {
      key: "id",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "delivered"
              ? "success"
              : value === "pending"
                ? "warning"
                : value === "cancelled" || value === "canceled"
                  ? "error"
                  : "info"
          }>
          {value?.toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "total",
      label: "Amount",
      sortable: true,
      render: (_, row) => {
        const vendorItem = row.vendorItems?.find(
          (vi) => isSameVendorId(vi.vendorId, vendor.id)
        );
        return formatPrice(vendorItem?.subtotal || 0);
      },
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/admin/orders/${row.id}`)}
          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          View
        </button>
      ),
    },
  ];

  const commissionColumns = [
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "subtotal",
      label: "Subtotal",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "commission",
      label: "Commission",
      sortable: true,
      render: (value) => (
        <span className="text-red-600">-{formatPrice(value)}</span>
      ),
    },
    {
      key: "vendorEarnings",
      label: "Vendor Earnings",
      sortable: true,
      render: (value) => (
        <span className="text-green-600">{formatPrice(value)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "paid"
              ? "success"
              : value === "pending"
                ? "warning"
                : "error"
          }>
          {value?.toUpperCase()}
        </Badge>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">
              {vendor.storeName || vendor.name}
            </h1>
            <p className="text-xs text-gray-550 break-all select-all">Vendor ID: {vendor.id}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Badge
            variant={
              vendor.status === "approved"
                ? "success"
                : vendor.status === "pending"
                  ? "warning"
                  : "error"
            }
            className="text-xs self-start sm:self-auto uppercase">
            {vendor.status?.toUpperCase()}
          </Badge>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {/* Pending actions */}
            {vendor.status === "pending" && (
              <>
                <button
                  onClick={() => setVendorActionModal({ isOpen: true, action: "approve", reason: "" })}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto cursor-pointer"
                >
                  <FiCheckCircle />
                  Approve
                </button>
                <button
                  onClick={() => setVendorActionModal({ isOpen: true, action: "reject", reason: "" })}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto cursor-pointer"
                >
                  <FiXCircle />
                  Reject
                </button>
              </>
            )}

            {/* Approved actions */}
            {vendor.status === "approved" && (
              <>
                <span className="text-green-600 font-bold text-sm px-2 flex items-center justify-center sm:justify-start gap-1">
                  Approved ✓
                </span>
                <button
                  onClick={() => setVendorActionModal({ isOpen: true, action: "suspend", reason: "" })}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto cursor-pointer"
                >
                  <FiXCircle />
                  Suspend Vendor
                </button>
              </>
            )}

            {/* Suspended actions */}
            {vendor.status === "suspended" && (
              <button
                onClick={() => setVendorActionModal({ isOpen: true, action: "reactivate", reason: "" })}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto cursor-pointer"
              >
                <FiCheckCircle />
                Reactivate Vendor
              </button>
            )}

            {/* Rejected actions */}
            {vendor.status === "rejected" && (
              <>
                <span className="text-red-600 font-bold text-sm px-2 flex items-center justify-center sm:justify-start">
                  Rejected
                </span>
                <button
                  onClick={() => setVendorActionModal({ isOpen: true, action: "reopen", reason: "" })}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-indigo-600 hover:bg-indigo-750 text-white rounded-lg transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto cursor-pointer"
                >
                  <FiCheckCircle />
                  Move Back to Pending Review
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto whitespace-nowrap scrollbar-none">
          {["overview", "orders", "commissions", "documents", "settings"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-semibold text-sm transition-colors flex-shrink-0 ${activeTab === tab
                ? "text-primary-600 border-b-2 border-primary-600"
                : "text-gray-600 hover:text-gray-800"
                }`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Vendor Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Vendor Information
                  </h2>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <FiUser className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Name</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiMail className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Email</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiPhone className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Phone</p>
                        <p className="font-semibold text-gray-800">
                          {vendor.phone || "N/A"}
                        </p>
                      </div>
                    </div>
                    {vendor.address && (
                      <div className="flex items-start gap-3">
                        <FiMapPin className="text-gray-400 mt-1" />
                        <div>
                          <p className="text-xs text-gray-600">Address</p>
                          <p className="font-semibold text-gray-800">
                            {vendor.address.street || ""}
                            {vendor.address.city && `, ${vendor.address.city}`}
                            {vendor.address.state &&
                              `, ${vendor.address.state}`}
                            {vendor.address.zipCode &&
                              ` ${vendor.address.zipCode}`}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <FiClock className="text-gray-400 mt-1" />
                      <div>
                        <p className="text-xs text-gray-600">Join Date</p>
                        <p className="font-semibold text-gray-800">
                          {new Date(vendor.joinDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Stats */}
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">
                    Performance
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 mb-1">Total Orders</p>
                      <p className="text-2xl font-bold text-blue-800">
                        {vendorOrders.length}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs text-green-600 mb-1">
                        Total Earnings
                      </p>
                      <p className="text-2xl font-bold text-green-800">
                        {earningsSummary
                          ? formatPrice(earningsSummary.totalEarnings)
                          : formatPrice(0)}
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-xs text-yellow-600 mb-1">
                        Pending Earnings
                      </p>
                      <p className="text-2xl font-bold text-yellow-800">
                        {earningsSummary
                          ? formatPrice(earningsSummary.pendingEarnings)
                          : formatPrice(0)}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs text-purple-600 mb-1">
                        Commission Rate
                      </p>
                      <p className="text-2xl font-bold text-purple-800">
                        {((vendor.commissionRate || 0) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />
              {/* Bank & Payout Details */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FiDollarSign className="text-primary-600" />
                  Bank & Payout Details
                </h2>
                {vendor.bankDetails && (vendor.bankDetails.accountName || vendor.bankDetails.accountNumber) ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                        <p className="text-xs text-gray-555 font-semibold uppercase tracking-wider">Account Holder</p>
                        <p className="font-semibold text-gray-800 mt-0.5">{vendor.bankDetails.accountName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-555 font-semibold uppercase tracking-wider">Bank Name</p>
                        <p className="font-semibold text-gray-800 mt-0.5">{vendor.bankDetails.bankName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-555 font-semibold uppercase tracking-wider">Account Number</p>
                        <p className="font-semibold text-gray-800 mt-0.5 select-all">{vendor.bankDetails.accountNumber || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-555 font-semibold uppercase tracking-wider">IFSC Code</p>
                        <p className="font-semibold text-gray-800 mt-0.5 select-all uppercase">{vendor.bankDetails.ifscCode || "N/A"}</p>
                      </div>
                    </div>

                    {/* Preferred Payout Channels */}
                    <div className="bg-white p-4 rounded-xl border border-gray-150 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">Preferred Payment Channels</h4>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${vendor.paymentMethods?.bankTransfer ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="font-medium text-gray-700">Bank Transfer: <span className="font-bold">{vendor.paymentMethods?.bankTransfer ? "Enabled" : "Disabled"}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${vendor.paymentMethods?.upi ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="font-medium text-gray-700">UPI: <span className="font-bold">{vendor.paymentMethods?.upi ? "Enabled" : "Disabled"}</span></span>
                          {vendor.paymentMethods?.upi && vendor.upiId && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded select-all font-semibold">{vendor.upiId}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${vendor.paymentMethods?.paypal ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="font-medium text-gray-700">PayPal: <span className="font-bold">{vendor.paymentMethods?.paypal ? "Enabled" : "Disabled"}</span></span>
                          {vendor.paymentMethods?.paypal && vendor.paypalEmail && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded select-all font-semibold">{vendor.paypalEmail}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-250 text-yellow-800 rounded-xl p-4 text-sm font-semibold">
                    No bank payout details have been configured by this vendor yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Vendor Orders
              </h2>
              {vendorOrders.length > 0 ? (
                <DataTable
                  data={vendorOrders}
                  columns={orderColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No orders found
                </p>
              )}
            </div>
          )}

          {/* Commissions Tab */}
          {activeTab === "commissions" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                Commission History
              </h2>
              {commissions.length > 0 ? (
                <DataTable
                  data={commissions}
                  columns={commissionColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No commission records found
                </p>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <div className="space-y-6">
              {/* Verification Summary Cards */}
              {(() => {
                const total = documents.length;
                const pending = documents.filter(d => d.status === "pending").length;
                const approved = documents.filter(d => d.status === "approved").length;
                const rejected = documents.filter(d => d.status === "rejected").length;
                
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm">
                      <p className="text-xs text-gray-500 font-semibold mb-1">Total Documents</p>
                      <p className="text-2xl font-bold text-gray-800">{total}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100 shadow-sm">
                      <p className="text-xs text-yellow-600 font-semibold mb-1">Pending Review</p>
                      <p className="text-2xl font-bold text-yellow-800">{pending}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-100 shadow-sm">
                      <p className="text-xs text-green-600 font-semibold mb-1">Approved</p>
                      <p className="text-2xl font-bold text-green-800">{approved}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-100 shadow-sm">
                      <p className="text-xs text-red-600 font-semibold mb-1">Rejected</p>
                      <p className="text-2xl font-bold text-red-800">{rejected}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Filtering & Bulk Actions Bar */}
              {(() => {
                const filteredDocs = documents.filter(doc => {
                  if (activeDocFilter === "all") return true;
                  return doc.status === activeDocFilter;
                });
                
                const isAllChecked = filteredDocs.length > 0 && checkedDocIds.length === filteredDocs.length;
                
                return (
                  <>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex items-center gap-2 pr-2 border-r border-gray-200 lg:hidden">
                          <input 
                            type="checkbox"
                            checked={isAllChecked}
                            onChange={() => handleCheckAll(filteredDocs)}
                            id="mobile-select-all"
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <label htmlFor="mobile-select-all" className="text-xs text-gray-500 font-semibold cursor-pointer">All</label>
                        </div>
                        {["all", "pending", "approved", "rejected"].map((filter) => (
                          <button
                            key={filter}
                            onClick={() => {
                              setActiveDocFilter(filter);
                              setCheckedDocIds([]);
                            }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                              activeDocFilter === filter
                                ? "bg-primary-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {filter} ({filter === "all" ? documents.length : documents.filter(d => d.status === filter).length})
                          </button>
                        ))}
                      </div>
                      
                      {checkedDocIds.length > 0 && (
                        <div className="flex items-center gap-3 animate-fadeIn">
                          <span className="text-xs text-gray-500 font-semibold">{checkedDocIds.length} Selected</span>
                          <button
                            onClick={handleBulkApprove}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-bold shadow-md"
                          >
                            Approve Selected
                          </button>
                          <button
                            onClick={handleBulkReject}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-bold shadow-md"
                          >
                            Reject Selected
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Desktop Documents Table */}
                    <div className="hidden lg:block bg-white rounded-xl overflow-hidden border border-gray-200">
                      {filteredDocs.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-200">
                                <th className="p-4 w-12 text-center">
                                  <input 
                                    type="checkbox"
                                    checked={isAllChecked}
                                    onChange={() => handleCheckAll(filteredDocs)}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                </th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Uploaded On</th>
                                <th className="p-4">Expires On</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Reviewed By</th>
                                <th className="p-4">Reviewed On</th>
                                <th className="p-4 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
                              {filteredDocs.map((doc) => {
                                const isChecked = checkedDocIds.includes(doc._id);
                                const expiry = getExpiryDetails(doc.expiryDate);
                                
                                return (
                                  <tr key={doc._id} className={`hover:bg-gray-50 transition-colors ${isChecked ? "bg-primary-50/30" : ""}`}>
                                    <td className="p-4 text-center">
                                      <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => handleCheckDoc(doc._id)}
                                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                      />
                                    </td>
                                    <td className="p-4 font-semibold text-gray-800">{doc.name}</td>
                                    <td className="p-4">
                                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium uppercase">{doc.category}</span>
                                    </td>
                                    <td className="p-4 text-gray-500">{new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString()}</td>
                                    <td className="p-4">
                                      <div className="flex flex-col">
                                        <span className="text-gray-800 font-semibold">
                                          {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "N/A"}
                                        </span>
                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${expiry.color}`}>
                                          {expiry.text}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="flex flex-col gap-1 items-start">
                                        <Badge
                                          variant={
                                            doc.status === "approved"
                                              ? "success"
                                              : doc.status === "pending"
                                                ? "warning"
                                                : "error"
                                          }
                                        >
                                          {doc.status.toUpperCase()}
                                        </Badge>
                                        {doc.status === "rejected" && doc.remarks && (
                                          <span className="text-xs text-red-500 italic max-w-xs break-words">"{doc.remarks}"</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-4 font-medium text-gray-650">
                                      {doc.reviewedBy?.name || (doc.reviewedBy ? "Admin" : "—")}
                                    </td>
                                    <td className="p-4 text-gray-500">
                                      {doc.reviewedAt ? new Date(doc.reviewedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          onClick={() => setPreviewDoc(doc)}
                                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                                          title="Preview Document"
                                        >
                                          Preview
                                        </button>
                                        
                                        <a
                                          href={doc.fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors text-center"
                                        >
                                          View
                                        </a>

                                        <a
                                          href={doc.fileUrl}
                                          download={doc.fileName || "document"}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-colors text-center"
                                        >
                                          Download
                                        </a>

                                        {doc.status === "pending" && (
                                          <>
                                            <button
                                              onClick={() => handleUpdateDocStatus(doc._id, "approved")}
                                              className="px-2.5 py-1.5 bg-green-55 hover:bg-green-100 text-green-700 rounded-lg text-xs font-bold transition-colors"
                                              title="Approve Document"
                                            >
                                              Approve
                                            </button>
                                            <button
                                              onClick={() => {
                                                setIsBulkReject(false);
                                                setRejectingDocId(doc._id);
                                                setShowRejectModal(true);
                                              }}
                                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition-colors"
                                              title="Reject Document"
                                            >
                                              Reject
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-center py-12">
                          No documents found matching the filter
                        </p>
                      )}
                    </div>

                    {/* Mobile Documents Card List */}
                    <div className="block lg:hidden space-y-4">
                      {filteredDocs.length > 0 ? (
                        filteredDocs.map((doc) => {
                          const isChecked = checkedDocIds.includes(doc._id);
                          const expiry = getExpiryDetails(doc.expiryDate);
                          
                          return (
                            <div 
                              key={doc._id} 
                              className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4 hover:border-primary-100 transition-all ${isChecked ? "border-primary-600 bg-primary-50/10" : ""}`}
                            >
                              {/* Selection & Header */}
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleCheckDoc(doc._id)}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <div>
                                    <h4 className="font-semibold text-gray-850 text-sm sm:text-base">{doc.name}</h4>
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                      {doc.category}
                                    </span>
                                  </div>
                                </div>
                                <Badge
                                  variant={
                                    doc.status === "approved"
                                      ? "success"
                                      : doc.status === "pending"
                                        ? "warning"
                                        : "error"
                                  }
                                  className="text-xs uppercase"
                                >
                                  {doc.status}
                                </Badge>
                              </div>

                              {/* Details Grid */}
                              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm border-t border-gray-150 pt-3">
                                <div>
                                  <span className="text-gray-500 block font-medium">Uploaded On</span>
                                  <span className="text-gray-800 font-semibold">{new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block font-medium">Expires On</span>
                                  <span className="text-gray-800 font-semibold">{doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "N/A"}</span>
                                  <span className={`block text-[10px] uppercase font-bold tracking-wider ${expiry.color}`}>
                                    {expiry.text}
                                  </span>
                                </div>
                                {doc.reviewedBy && (
                                  <>
                                    <div>
                                      <span className="text-gray-500 block font-medium">Reviewed By</span>
                                      <span className="text-gray-800 font-semibold">{doc.reviewedBy?.name || "Admin"}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block font-medium">Reviewed On</span>
                                      <span className="text-gray-800 font-semibold">{new Date(doc.reviewedAt).toLocaleDateString()}</span>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Rejection comments */}
                              {doc.status === "rejected" && doc.remarks && (
                                <div className="bg-red-50 p-2.5 rounded-lg border border-red-100 text-xs text-red-600 italic">
                                  <strong>Rejection Reason:</strong> "{doc.remarks}"
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex flex-col gap-2 pt-2 border-t border-gray-150">
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    onClick={() => setPreviewDoc(doc)}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-250 text-gray-700 rounded-lg text-xs font-bold text-center transition-colors"
                                  >
                                    Preview
                                  </button>
                                  
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold text-center transition-colors"
                                  >
                                    View
                                  </a>

                                  <a
                                    href={doc.fileUrl}
                                    download={doc.fileName || "document"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold text-center transition-colors"
                                  >
                                    Download
                                  </a>
                                </div>

                                {doc.status === "pending" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => handleUpdateDocStatus(doc._id, "approved")}
                                      className="px-3 py-1.5 bg-green-50 hover:bg-green-150 text-green-700 rounded-lg text-xs font-bold text-center transition-colors"
                                    >
                                      Approve
                                    </button>
                                    
                                    <button
                                      onClick={() => {
                                        setIsBulkReject(false);
                                        setRejectingDocId(doc._id);
                                        setShowRejectModal(true);
                                      }}
                                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold text-center transition-colors"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-gray-500 text-center py-8">
                          No documents found matching the filter
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  Commission Rate
                </h2>
                <div className="flex items-center gap-4">
                  {isEditingCommission ? (
                    <>
                      <input
                        type="number"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        min="0"
                        max="100"
                        step="0.1"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-32"
                        placeholder="10.0"
                      />
                      <button
                        onClick={handleCommissionUpdate}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingCommission(false);
                          setCommissionRate(
                            ((vendor.commissionRate || 0) * 100).toFixed(1)
                          );
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-gray-800">
                        {((vendor.commissionRate || 0) * 100).toFixed(1)}%
                      </p>
                      <button
                        onClick={() => setIsEditingCommission(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2">
                        <FiEdit />
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Remarks Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-100 shadow-2xl"
          >
            <h3 className="text-lg font-bold mb-4 text-gray-800">Reject Document</h3>
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-gray-700">Rejection Remarks (Reason) *</label>
                  <span className="text-[10px] text-gray-400 font-semibold">{rejectRemarks.length} / Min 10 chars</span>
                </div>
                <textarea
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="e.g. GST Registration Certificate is blurred or unreadable. Please upload a clear copy."
                  required
                  rows="4"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectRemarks("");
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectRemarks.trim().length < 10}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  Reject Document
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Force Override Status Confirmation Modal */}
      {showConfirmForceModal && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-100 shadow-2xl"
          >
            <h3 className="text-lg font-bold mb-4 text-gray-800">Confirm Status Change</h3>
            <p className="text-sm text-gray-650 mb-6">
              This document has already been processed. Are you sure you want to change its status? Accidental toggling may notify the vendor.
            </p>
            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmForceModal(false);
                  setConfirmForceParams(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm transition-colors"
              >
                No, Keep
              </button>
              <button
                onClick={handleConfirmForce}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold text-sm transition-colors"
              >
                Yes, Change Status
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Media Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-4xl w-full border border-gray-100 shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
              <div>
                <h3 className="font-bold text-gray-850 text-base">{previewDoc.name}</h3>
                <p className="text-xs text-gray-500">Category: {previewDoc.category}</p>
              </div>
              <button 
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-750 rounded-lg transition-colors font-bold text-xs"
              >
                Close Preview
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-[400px] flex items-center justify-center bg-gray-50 rounded-xl p-4">
              {renderPreviewContent(previewDoc)}
            </div>
          </motion.div>
        </div>
      )}

      {/* Vendor Status Action Confirmation Modal */}
      {vendorActionModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-150 shadow-2xl"
          >
            <h3 className="text-lg font-bold mb-2 text-gray-800">
              {vendorActionModal.action === "approve" && "Approve Vendor?"}
              {vendorActionModal.action === "reject" && "Reject Vendor?"}
              {vendorActionModal.action === "suspend" && "Suspend Vendor?"}
              {vendorActionModal.action === "reactivate" && "Reactivate Vendor?"}
              {vendorActionModal.action === "reopen" && "Move Vendor Back To Review?"}
            </h3>
            
            <p className="text-sm text-gray-650 mb-4">
              {vendorActionModal.action === "approve" && "This vendor will gain access to sell products."}
              {vendorActionModal.action === "reactivate" && "The vendor account will become active again."}
              {vendorActionModal.action === "reopen" && "This vendor will return to the pending review queue."}
              {(vendorActionModal.action === "reject" || vendorActionModal.action === "suspend") && "Reason *"}
            </p>

            {(vendorActionModal.action === "reject" || vendorActionModal.action === "suspend") && (
              <div className="mb-4 space-y-1">
                <textarea
                  value={vendorActionModal.reason}
                  onChange={(e) => setVendorActionModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={`Provide details (minimum 10 characters)...`}
                  rows="3"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 text-sm resize-none"
                />
                <div className="flex justify-between text-[11px] font-semibold text-gray-400">
                  <span>{vendorActionModal.reason.length} characters</span>
                  {vendorActionModal.reason.length < 10 && (
                    <span className="text-red-500">Minimum 10 characters required</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setVendorActionModal({ isOpen: false, action: "", reason: "" })}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = vendorActionModal.action;
                  const reason = vendorActionModal.reason.trim();
                  
                  if ((action === "reject" || action === "suspend") && reason.length < 10) {
                    toast.error("Reason must be at least 10 characters long.");
                    return;
                  }

                  const targetStatusMap = {
                    approve: "approved",
                    reject: "rejected",
                    suspend: "suspended",
                    reactivate: "approved",
                    reopen: "pending",
                  };

                  const targetStatus = targetStatusMap[action];
                  
                  setVendorActionModal({ isOpen: false, action: "", reason: "" });
                  
                  await handleStatusUpdate(targetStatus, reason);
                }}
                disabled={
                  (vendorActionModal.action === "reject" || vendorActionModal.action === "suspend") && 
                  vendorActionModal.reason.trim().length < 10
                }
                className={`px-4 py-2 text-white rounded-lg font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  vendorActionModal.action === "approve" ? "bg-green-600 hover:bg-green-700" :
                  vendorActionModal.action === "reject" ? "bg-red-600 hover:bg-red-700" :
                  vendorActionModal.action === "suspend" ? "bg-orange-500 hover:bg-orange-600" :
                  vendorActionModal.action === "reactivate" ? "bg-blue-600 hover:bg-blue-700" :
                  "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {vendorActionModal.action === "approve" && "Approve"}
                {vendorActionModal.action === "reject" && "Reject"}
                {vendorActionModal.action === "suspend" && "Suspend"}
                {vendorActionModal.action === "reactivate" && "Reactivate"}
                {vendorActionModal.action === "reopen" && "Move to Pending"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default VendorDetail;
