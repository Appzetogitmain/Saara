import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiX,
  FiPhone,
  FiMail,
  FiPackage,
  FiCalendar,
  FiRefreshCw,
  FiShoppingBag,
  FiDollarSign,
  FiAlertCircle,
  FiEdit,
} from "react-icons/fi";
import { motion } from "framer-motion";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import {
  getVendorReturnRequestById,
  updateVendorReturnRequestStatus,
  verifyVendorHandoffOtp,
} from "../../services/vendorService";
import toast from "react-hot-toast";
import {
  getStatusConfig,
  getTimelineConfig,
  RETURN_TRANSITIONS,
  EXCHANGE_TRANSITIONS
} from "../../../../shared/constants/returnExchangeConfig";

const ReturnRequestDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vendor } = useVendorAuthStore();
  const [returnRequest, setReturnRequest] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState("");

  const getOtpStatusText = (verified, expiresAt) => {
    if (verified) return 'Verified ✅';
    if (!expiresAt) return 'Not Generated ❌';
    const exp = new Date(expiresAt);
    if (Date.now() > exp) return 'Expired ❌';
    const diffMins = Math.ceil((exp - Date.now()) / (1000 * 60));
    return `Generated ✅ (${diffMins} min left)`;
  };

  const [vendorChecklist, setVendorChecklist] = useState({
    correctProduct: false,
    correctVariant: false,
    tagPresent: false,
    accessoriesIncluded: false,
    packagingAvailable: false,
    conditionAcceptable: false,
    matchesReason: false
  });

  const isVendorChecklistComplete = Object.values(vendorChecklist).every(Boolean);

  const [handoffOtp, setHandoffOtp] = useState("");
  const [isVerifyingHandoff, setIsVerifyingHandoff] = useState(false);

  const handleVerifyHandoffOtp = async (e) => {
    e.preventDefault();
    if (!handoffOtp || handoffOtp.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit OTP.");
      return;
    }
    setIsVerifyingHandoff(true);
    try {
      const res = await verifyVendorHandoffOtp(id, handoffOtp.trim());
      const data = res?.data ?? res;
      toast.success("Handoff verified successfully! Package received.");
      setReturnRequest(data);
      setStatus(data.status);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to verify OTP.");
    } finally {
      setIsVerifyingHandoff(false);
    }
  };

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchReturnRequest = async () => {
      try {
        const res = await getVendorReturnRequestById(id);
        const data = res?.data ?? res;
        if (!data) {
          toast.error("Return request not found");
          navigate("/vendor/return-requests");
          return;
        }
        setReturnRequest(data);
        setStatus(data.status);
      } catch {
        toast.error("Return request not found");
        navigate("/vendor/return-requests");
      }
    };

    fetchReturnRequest();
  }, [id, navigate, vendorId]);

  const handleStatusUpdate = async (
    newStatus,
    action = "",
    options = {}
  ) => {
    const statusData = { status: newStatus };
    if (newStatus === "approved" && action === "approve") {
      statusData.refundStatus = "pending";
    } else if (newStatus === "completed" && action === "confirm-received") {
      statusData.refundStatus = "processed";
    }
    if (newStatus === "rejected" && options?.rejectionReason !== undefined) {
      statusData.rejectionReason = options.rejectionReason;
    }

    try {
      const res = await updateVendorReturnRequestStatus(id, statusData);
      const updatedRequest = res?.data ?? res;
      if (!updatedRequest) return;
      setReturnRequest(updatedRequest);
      setStatus(updatedRequest.status);
      setIsEditing(false);
    } catch {
      return;
    }

    const statusMessages = {
      approve: "Return request approved",
      reject: "Return request rejected",
      "confirm-received": "Confirm receipt recorded. Refund processed successfully.",
    };

    toast.success(statusMessages[action] || "Status updated successfully");
  };

  const handleStatusSave = () => {
    if (status !== returnRequest.status) {
      if (status === "rejected") {
        const reason = window.prompt(
          "Optional rejection reason (visible in return details):",
          returnRequest?.rejectionReason || ""
        );
        handleStatusUpdate(status, "", { rejectionReason: reason || "" });
        return;
      }
      handleStatusUpdate(status);
    } else {
      setIsEditing(false);
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      pending: "warning",
      approved: "success",
      rejected: "error",
      processing: "info",
      completed: "success",
    };
    return statusMap[status] || "warning";
  };

  if (!returnRequest || !vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const isExchange = returnRequest.requestType === "exchange";
  const transitions = isExchange ? EXCHANGE_TRANSITIONS : RETURN_TRANSITIONS;
  const allowedNextStatuses = transitions[returnRequest.status] || [];
  const editableStatusOptions = [returnRequest.status, ...allowedNextStatuses]
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .map((value) => {
      const config = getStatusConfig(value, returnRequest.requestType);
      return {
        value,
        label: config.label,
      };
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                {returnRequest.id}
              </h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                isExchange 
                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {isExchange ? 'Exchange' : 'Return'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Requested on{" "}
              {new Date(returnRequest.requestDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {isEditing ? (
            <>
              <AnimatedSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={editableStatusOptions}
                className="min-w-[140px]"
              />
              <button
                onClick={handleStatusSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold">
                <FiCheck className="text-sm" />
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStatus(returnRequest.status);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold">
                <FiX className="text-sm" />
                Cancel
              </button>
            </>
          ) : (
            <>
              {(() => {
                const config = getStatusConfig(returnRequest.status, returnRequest.requestType);
                return (
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
                    {config.label}
                  </span>
                );
              })()}
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
                <FiEdit className="text-sm" />
                Edit Status
              </button>
              {returnRequest.status === "pending" && (
                <>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to approve this return request?"
                        )
                      ) {
                        handleStatusUpdate("approved", "approve");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold">
                    <FiCheck className="text-sm" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to reject this return request?"
                        )
                      ) {
                        const reason = window.prompt(
                          "Optional rejection reason (visible in return details):",
                          returnRequest?.rejectionReason || ""
                        );
                        handleStatusUpdate("rejected", "reject", {
                          rejectionReason: reason || "",
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold">
                    <FiX className="text-sm" />
                    Reject
                  </button>
                </>
              )}
              {returnRequest.status === "delivered_to_vendor" && (
                <>
                  <button
                    disabled={!isVendorChecklistComplete}
                    onClick={() => {
                      const isExchange = returnRequest.requestType === "exchange";
                      const confirmMsg = isExchange
                        ? "Confirm you received the returned product? This will restore catalog inventory and begin replacement preparation."
                        : "Confirm you received the returned product? This will process the refund and restore catalog inventory.";
                      if (window.confirm(confirmMsg)) {
                        handleStatusUpdate(isExchange ? "replacement_preparing" : "completed", "confirm-received");
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed`}>
                    <FiCheck className="text-sm" />
                    Confirm Product Received
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to reject this return request after inspection?")) {
                        const reason = window.prompt("Enter rejection reason (required):");
                        if (!reason || !reason.trim()) {
                          toast.error("Rejection reason is required.");
                          return;
                        }
                        handleStatusUpdate("rejected", "reject", { rejectionReason: reason.trim() });
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-750 transition-colors text-sm font-semibold">
                    <FiX className="text-sm" />
                    Reject Return
                  </button>
                </>
              )}
              {returnRequest.status === "replacement_preparing" && (
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure the replacement package is ready for dispatch?")) {
                      handleStatusUpdate("replacement_ready", "mark-ready");
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold">
                  <FiPackage className="text-sm" />
                  Mark Replacement Ready
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* OTP Handoff verification card */}
          {returnRequest.status === 'picked_up' && (
            <div className="bg-amber-50/40 border border-amber-250 rounded-lg p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-amber-850 flex items-center gap-1.5">
                🔑 Delivery Partner Handoff Verification
              </h2>
              <p className="text-xs text-amber-700 leading-relaxed font-medium">
                The delivery rider is currently returning this package. Please collect the physical returned product from the rider, ask them for the 6-digit **Vendor Handoff OTP**, and enter it below to confirm receipt.
              </p>
              
              <form onSubmit={handleVerifyHandoffOtp} className="flex flex-col sm:flex-row gap-3 pt-1">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit Handoff OTP"
                  value={handoffOtp}
                  onChange={(e) => setHandoffOtp(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-4 py-2 bg-white border border-amber-200 rounded-lg text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-widest text-center"
                />
                <button
                  type="submit"
                  disabled={isVerifyingHandoff}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:bg-amber-400 shadow-sm"
                >
                  {isVerifyingHandoff ? "Verifying..." : "Verify & Accept Package"}
                </button>
              </form>

              {/* Show debug code for testing */}
              {returnRequest.vendorHandoffOtpDebug && (
                <div className="mt-2 p-2 bg-white border border-amber-100 rounded-md text-center text-xs font-bold text-amber-900 font-mono">
                  [TESTING ONLY] Handoff OTP Code: <span className="text-red-600 tracking-wider font-extrabold">{returnRequest.vendorHandoffOtpDebug}</span>
                </div>
              )}
            </div>
          )}

          {returnRequest.status === 'replacement_assigned' && (
            <div className="bg-purple-50/40 border border-purple-250 rounded-lg p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-purple-850 flex items-center gap-1.5">
                🔑 Replacement Handover OTP Verification
              </h2>
              <p className="text-xs text-purple-700 leading-relaxed font-medium">
                A delivery partner has arrived to collect the replacement items. Please hand over the replacement items, and provide them with the following 6-digit **Handover OTP** to verify the pickup:
              </p>
              <div className="text-3xl font-extrabold text-purple-800 tracking-widest bg-white py-3 rounded-xl border border-purple-300 font-mono text-center shadow-inner">
                {returnRequest.vendorHandoverOtpDebug || 'Check Inbox'}
              </div>
            </div>
          )}

          {/* Overview */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              {isExchange ? 'Exchange Overview' : 'Return Overview'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{isExchange ? 'Price Difference' : 'Refund Amount'}</p>
                {isExchange ? (
                  (() => {
                    const diff = Number(returnRequest.exchangeDetails?.priceDifference || 0);
                    if (diff === 0) return <p className="font-bold text-gray-800 text-lg">Even Exchange</p>;
                    if (diff > 0) return <p className="font-bold text-amber-600 text-lg">+{formatPrice(diff)}</p>;
                    return <p className="font-bold text-green-600 text-lg">-{formatPrice(Math.abs(diff))}</p>;
                  })()
                ) : (
                  <p className="font-bold text-gray-800 text-lg">{formatPrice(returnRequest.refundAmount)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Items</p>
                <p className="font-semibold text-gray-800 text-lg">{returnRequest.items.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{isExchange ? 'Exchange Status' : 'Refund Status'}</p>
                <Badge
                  variant={
                    returnRequest.refundStatus === "processed"
                      ? "success"
                      : returnRequest.refundStatus === "failed"
                      ? "error"
                      : "warning"
                  }
                  className="text-xs">
                  {isExchange ? returnRequest.status : returnRequest.refundStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Exchange Details block */}
          {isExchange && returnRequest.exchangeDetails && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiRefreshCw className="text-purple-600 text-base" />
                Exchange Details (Replacement Variant)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Replacement Item</p>
                  <p className="font-semibold text-gray-800">
                    {returnRequest.items[0]?.name || 'Replacement Product'}
                  </p>
                  <p className="text-xs text-purple-600 mt-1 font-semibold">
                    Size: {returnRequest.exchangeDetails.requestedVariant?.size || 'N/A'} | Color: {returnRequest.exchangeDetails.requestedVariant?.color || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Financial Reconciliation</p>
                  {(() => {
                    const diff = Number(returnRequest.exchangeDetails.priceDifference || 0);
                    if (diff === 0) return <p className="font-semibold text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-150">Even Exchange (No additional charge)</p>;
                    if (diff > 0) return <p className="font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-150">Customer owes: {formatPrice(diff)}</p>;
                    return <p className="font-semibold text-green-800 bg-green-50 p-2.5 rounded-lg border border-green-150">Refund customer: {formatPrice(Math.abs(diff))}</p>;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Original Order Link */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiShoppingBag className="text-primary-600 text-base" />
              Original Order
            </h2>
            <Link
              to={`/vendor/orders/${returnRequest.orderId}`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold text-sm">
              <span>View Order: {returnRequest.orderId}</span>
              <FiArrowLeft className="rotate-180 text-xs" />
            </Link>
          </div>

          {/* Return Items */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Items Being Returned ({returnRequest.items.length})
            </h2>
            <div className="space-y-2">
              {returnRequest.items.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name || "Product"}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.src =
                          "https://via.placeholder.com/100x100?text=Product";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">
                      {item.name || "Unknown Product"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-600">
                        {formatPrice(item.price || 0)} × {item.quantity || 1}
                      </p>
                      {item.reason && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-sm text-gray-800">
                    {formatPrice((item.price || 0) * (item.quantity || 1))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Images Gallery */}
          {((Array.isArray(returnRequest.evidenceImages) && returnRequest.evidenceImages.length > 0) || (Array.isArray(returnRequest.images) && returnRequest.images.length > 0)) && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                🖼️ Uploaded Evidence Images
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {((Array.isArray(returnRequest.evidenceImages) && returnRequest.evidenceImages.length > 0)
                  ? returnRequest.evidenceImages.map(img => img.url)
                  : returnRequest.images
                ).map((imgUrl, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 shadow-sm bg-slate-50">
                    <img src={imgUrl} alt="Evidence" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                      <button
                        onClick={() => window.open(imgUrl, "_blank")}
                        className="px-2 py-1 bg-white text-gray-800 rounded hover:bg-gray-100 text-[10px] font-bold shadow"
                        title="View Fullscreen"
                      >
                        🔍 Zoom
                      </button>
                      <a
                        href={imgUrl}
                        download={`evidence-${i + 1}.png`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-white text-gray-800 rounded hover:bg-gray-100 text-[10px] font-bold shadow text-center"
                        title="Download"
                      >
                        ⬇️ Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor inspection checklist */}
          {returnRequest.status === "delivered_to_vendor" && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 space-y-3">
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                📋 Vendor Return Handoff Inspection
              </h2>
              <p className="text-xs text-gray-500">
                Please physically inspect the returned items and check all items below to confirm correct package handoff.
              </p>
              <div className="space-y-2 mt-2">
                {[
                  { id: 'correctProduct', label: 'Correct Product received' },
                  { id: 'correctVariant', label: 'Correct Variant (color/size) received' },
                  { id: 'tagPresent', label: 'Original Tag Present' },
                  { id: 'accessoriesIncluded', label: 'All Accessories Included' },
                  { id: 'packagingAvailable', label: 'Original Packaging Available' },
                  { id: 'conditionAcceptable', label: 'Product Condition Acceptable' },
                  { id: 'matchesReason', label: 'Return matches customer claimed reason' }
                ].map((check) => (
                  <label key={check.id} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={vendorChecklist[check.id] || false}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setVendorChecklist((prev) => ({
                          ...prev,
                          [check.id]: val
                        }));
                      }}
                      className="w-4 h-4 border-gray-300 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <span className={`text-xs font-semibold ${vendorChecklist[check.id] ? 'text-gray-850' : 'text-gray-500'}`}>
                      {check.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Request Reason */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiAlertCircle className="text-primary-600 text-base" />
              {returnRequest.requestType === 'exchange' ? 'Exchange Reason' : 'Return Reason'}
            </h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Reason</p>
                <p className="font-semibold text-sm text-gray-800">
                  {returnRequest.returnReason || returnRequest.reason}
                </p>
              </div>
              {(returnRequest.customReason || returnRequest.description) && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Description</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed font-medium">
                    {returnRequest.customReason || returnRequest.description}
                  </p>
                </div>
              )}
              {returnRequest.requestType === 'exchange' && returnRequest.exchangeDetails?.requestedVariant && (
                <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-lg mt-3">
                  <p className="text-[10px] font-black text-purple-800 uppercase tracking-wider mb-1">Requested Exchange Variant</p>
                  <div className="flex gap-4 text-xs font-bold text-purple-700">
                    {returnRequest.exchangeDetails.requestedVariant.size && (
                      <span>Size: {returnRequest.exchangeDetails.requestedVariant.size}</span>
                    )}
                    {returnRequest.exchangeDetails.requestedVariant.color && (
                      <span>Color: {returnRequest.exchangeDetails.requestedVariant.color}</span>
                    )}
                  </div>
                </div>
              )}
              {returnRequest.rejectionReason && (
                <div>
                  <p className="text-xs text-red-500 mb-0.5">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                    {returnRequest.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiMail className="text-primary-600 text-base" />
              Customer Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Name</p>
                <p className="font-semibold text-sm text-gray-800">
                  {returnRequest.customer.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <a
                  href={`mailto:${returnRequest.customer.email}`}
                  className="font-semibold text-xs text-blue-600 hover:text-blue-800 break-all">
                  {returnRequest.customer.email}
                </a>
              </div>
              {returnRequest.customer.phone && (
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <FiPhone className="text-xs" />
                    Phone
                  </p>
                  <a
                    href={`tel:${returnRequest.customer.phone}`}
                    className="font-semibold text-sm text-gray-800 hover:text-blue-600">
                    {returnRequest.customer.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Refund Summary */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiDollarSign className="text-primary-600 text-base" />
              Refund Summary
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items Total</span>
                <span className="font-semibold">
                  {formatPrice(
                    returnRequest.items.reduce(
                      (sum, item) =>
                        sum + (item.price || 0) * (item.quantity || 1),
                      0
                    )
                  )}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Refund Amount</span>
                <span className="font-bold text-lg text-gray-800">
                  {formatPrice(returnRequest.refundAmount)}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Refund Status</p>
                <Badge
                  variant={
                    returnRequest.refundStatus === "processed"
                      ? "success"
                      : returnRequest.refundStatus === "failed"
                      ? "error"
                      : "warning"
                  }>
                  {returnRequest.refundStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Workflow Progress */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Workflow Progress
            </h2>
            <div className="relative border-l border-gray-200 ml-2.5 pl-4 space-y-4 py-2">
              {getTimelineConfig(returnRequest.requestType).map((step, index) => {
                const isCurrent = step.status === returnRequest.status;
                const isCompleted = getTimelineConfig(returnRequest.requestType).findIndex(t => t.status === returnRequest.status) >= index;
                return (
                  <div key={step.status} className="relative">
                    <div className={`absolute -left-[21.5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-white transition-colors ${
                      isCurrent ? 'border-primary-600 bg-primary-600' : isCompleted ? 'border-green-500 bg-green-500' : 'border-gray-300 bg-white'
                    }`} />
                    <div>
                      <p className={`text-xs font-semibold ${isCurrent ? 'text-primary-600 font-bold' : isCompleted ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                        {step.label}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit History */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiCalendar className="text-primary-600 text-base" />
              Status Audits & Logs
            </h2>
            <div className="space-y-3">
              {returnRequest.statusHistory && returnRequest.statusHistory.length > 0 ? (
                returnRequest.statusHistory.map((log, idx) => (
                  <div key={idx} className="flex gap-2 text-xs border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-semibold text-gray-800 uppercase tracking-tight break-words">{log.status}</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(log.changedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-gray-500 text-[10px] mt-0.5">
                        By: <span className="font-medium">{log.performedByName}</span> (<span className="capitalize">{log.performedByRole}</span>)
                      </p>
                      {log.notes && (
                        <p className="text-gray-600 italic mt-1 bg-gray-50 p-1.5 rounded text-[10px] leading-relaxed border border-gray-100">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-800">Submitted</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{new Date(returnRequest.requestDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-800">Current Status: {returnRequest.status}</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{new Date(returnRequest.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">
              Quick Actions
            </h2>
            <div className="space-y-1.5">
              <Link
                to={`/vendor/orders/${returnRequest.orderId}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold">
                <FiShoppingBag className="text-sm" />
                View Original Order
              </Link>
              <button
                onClick={() =>
                  (window.location.href = `mailto:${returnRequest.customer.email}`)
                }
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold">
                <FiMail className="text-sm" />
                Email Customer
              </button>
              {returnRequest.customer.phone && (
                <button
                  onClick={() =>
                    (window.location.href = `tel:${returnRequest.customer.phone}`)
                  }
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold">
                  <FiPhone className="text-sm" />
                  Call Customer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ReturnRequestDetail;
