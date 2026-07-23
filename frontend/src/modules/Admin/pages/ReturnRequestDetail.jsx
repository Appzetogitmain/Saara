import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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
  FiEdit
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import { getPlaceholderImage } from '../../../shared/utils/helpers';
import { useReturnStore } from '../../../shared/store/returnStore';
import { reassignReversePickup } from '../services/adminService';
import toast from 'react-hot-toast';
import {
  getStatusConfig,
  getTimelineConfig,
  RETURN_TRANSITIONS,
  EXCHANGE_TRANSITIONS
} from '../../../shared/constants/returnExchangeConfig';

const RETURN_PRODUCT_PLACEHOLDER = getPlaceholderImage(100, 100, 'Product');

const ReturnRequestDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { fetchReturnRequestById, updateReturnStatus } = useReturnStore();
  const [returnRequest, setReturnRequest] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [overrideProviderId, setOverrideProviderId] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  const handleReassign = async () => {
    try {
      setIsReassigning(true);
      const res = await reassignReversePickup(id, overrideProviderId || undefined, 'Admin manual override');
      const engineResult = res.data?.data || res.data;
      toast.success(`Successfully reassigned to ${engineResult.providerId}`);
      // Refresh the page data
      const freshReq = await fetchReturnRequestById(id);
      setReturnRequest(freshReq);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to reassign reverse pickup');
    } finally {
      setIsReassigning(false);
    }
  };

  const getOtpStatusText = (verified, expiresAt) => {
    if (verified) return 'Verified ✅';
    if (!expiresAt) return 'Not Generated ❌';
    const exp = new Date(expiresAt);
    if (Date.now() > exp) return 'Expired ❌';
    const diffMins = Math.ceil((exp - Date.now()) / (1000 * 60));
    return `Generated ✅ (${diffMins} min left)`;
  };

  useEffect(() => {
    const loadDetail = async () => {
      const data = await fetchReturnRequestById(id);
      if (data) {
        setReturnRequest(data);
        setStatus(data.status);
      } else {
        navigate('/admin/return-requests');
      }
    };
    loadDetail();
  }, [id, navigate, fetchReturnRequestById]);

  const handleStatusUpdate = async (newStatus, action = '') => {
    const statusData = { status: newStatus };

    if (newStatus === 'approved' && action === 'approve') {
      statusData.refundStatus = 'pending';
    } else if (newStatus === 'completed' && action === 'process-refund') {
      statusData.refundStatus = 'processed';
    } else if (newStatus === 'completed' && !action) {
      statusData.refundStatus = 'processed';
    } else if (newStatus === 'approved' && !action) {
      if (returnRequest.refundStatus !== 'processed') {
        statusData.refundStatus = 'pending';
      }
    }

    const success = await updateReturnStatus(id, statusData);
    if (success) {
      // Refresh local data
      const data = await fetchReturnRequestById(id);
      if (data) {
        setReturnRequest(data);
        setStatus(data.status);
      }
      setIsEditing(false);
    }
  };

  const handleStatusSave = () => {
    if (status !== returnRequest.status) {
      handleStatusUpdate(status);
    } else {
      setIsEditing(false);
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
      processing: 'processing',
      completed: 'completed',
    };
    return statusMap[status] || 'pending';
  };

  if (!returnRequest) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const isExchange = returnRequest.requestType === 'exchange';
  const transitions = isExchange ? EXCHANGE_TRANSITIONS : RETURN_TRANSITIONS;
  const allowedNextStatuses = transitions[returnRequest.status] || [];
  const editableStatusOptions = [returnRequest.status, ...allowedNextStatuses].map((value) => {
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
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{returnRequest.id}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                isExchange 
                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {isExchange ? 'Exchange' : 'Return'}
              </span>
            </div>
            <p className="text-xs text-gray-500">Requested on {formatDateTime(returnRequest.requestDate)}</p>
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
              >
                <FiCheck className="text-sm" />
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStatus(returnRequest.status);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold"
              >
                <FiEdit className="text-sm" />
                Edit Status
              </button>
              {returnRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to approve this ${returnRequest.requestType}?`)) {
                        handleStatusUpdate('approved', 'approve');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
                  >
                    <FiCheck className="text-sm" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to reject this ${returnRequest.requestType}?`)) {
                        handleStatusUpdate('rejected', 'reject');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
                  >
                    <FiX className="text-sm" />
                    Reject
                  </button>
                </>
              )}
              {returnRequest.status === 'approved' && returnRequest.refundStatus === 'pending' && !isExchange && (
                <button
                  onClick={() => {
                    if (window.confirm('Process refund for this return request?')) {
                      handleStatusUpdate('completed', 'process-refund');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
                >
                  <FiRefreshCw className="text-sm" />
                  Process Refund
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
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
                    if (diff > 0) return <p className="font-bold text-amber-600 text-lg">+{formatCurrency(diff)}</p>;
                    return <p className="font-bold text-green-600 text-lg">-{formatCurrency(Math.abs(diff))}</p>;
                  })()
                ) : (
                  <p className="font-bold text-gray-800 text-lg">{formatCurrency(returnRequest.refundAmount)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Items</p>
                <p className="font-semibold text-gray-800 text-lg">{returnRequest.items.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">{isExchange ? 'Exchange Status' : 'Refund Status'}</p>
                <Badge variant={returnRequest.refundStatus === 'processed' ? 'success' : returnRequest.refundStatus === 'failed' ? 'error' : 'pending'} className="text-xs">
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
                  <p className="text-xs text-purple-600 mt-1">
                    Size: {returnRequest.exchangeDetails.requestedVariant?.size || 'N/A'} | Color: {returnRequest.exchangeDetails.requestedVariant?.color || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Financial Reconciliation</p>
                  {(() => {
                    const diff = Number(returnRequest.exchangeDetails.priceDifference || 0);
                    if (diff === 0) return <p className="font-semibold text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-150">Even Exchange (No additional charge)</p>;
                    if (diff > 0) return <p className="font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-150">Customer owes vendor: {formatCurrency(diff)}</p>;
                    return <p className="font-semibold text-green-800 bg-green-50 p-2.5 rounded-lg border border-green-150">Refund due to customer: {formatCurrency(Math.abs(diff))}</p>;
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
              to={`/admin/orders/${returnRequest.orderId}`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold text-sm"
            >
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
                <div key={item.id || index} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name || 'Product'}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = RETURN_PRODUCT_PLACEHOLDER;
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{item.name || 'Unknown Product'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-600">
                        {formatCurrency(item.price || 0)} × {item.quantity || 1}
                      </p>
                      {item.reason && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-sm text-gray-800">
                    {formatCurrency((item.price || 0) * (item.quantity || 1))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Return Reason */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiAlertCircle className="text-primary-600 text-base" />
              Return Reason
            </h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Reason</p>
                <p className="font-semibold text-sm text-gray-800">{returnRequest.reason}</p>
              </div>
              {returnRequest.description && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{returnRequest.description}</p>
                </div>
              )}
              {returnRequest.rejectionReason && (
                <div>
                  <p className="text-xs text-red-500 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{returnRequest.rejectionReason}</p>
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
                <p className="font-semibold text-sm text-gray-800">{returnRequest.customer.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <a
                  href={`mailto:${returnRequest.customer.email}`}
                  className="font-semibold text-xs text-blue-600 hover:text-blue-800 break-all"
                >
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
                    className="font-semibold text-sm text-gray-800 hover:text-blue-600"
                  >
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
                  {formatCurrency(
                    returnRequest.items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
                  )}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Refund Amount</span>
                <span className="font-bold text-lg text-gray-800">{formatCurrency(returnRequest.refundAmount)}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Refund Status</p>
                <Badge variant={returnRequest.refundStatus === 'processed' ? 'success' : returnRequest.refundStatus === 'failed' ? 'error' : 'pending'}>
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

          {/* Reverse Logistics Details */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Reverse Logistics
            </h2>
            <div className="space-y-3 text-xs text-gray-600">
              {/* If we have a Reverse Shipment from Phase 5+ */}
              {returnRequest.reverseShipment ? (
                <>
                  {returnRequest.reverseShipment.status === 'failed' ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-red-600 uppercase flex items-center gap-1"><FiAlertCircle /> Reverse Pickup Failed</p>
                        <p className="font-medium bg-red-50 text-red-800 p-2 rounded border border-red-200">
                          {returnRequest.reverseShipment.errorNotes || 'Unknown API failure.'}
                        </p>
                      </div>
                      
                      <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg space-y-2">
                        <p className="text-[10px] text-orange-800 font-bold uppercase tracking-wider">Manual Reassignment</p>
                        <select
                          className="w-full text-xs p-2 rounded border border-orange-200 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                          value={overrideProviderId}
                          onChange={(e) => setOverrideProviderId(e.target.value)}
                        >
                          <option value="">Auto-select best provider</option>
                          <option value="shiprocket">Force Shiprocket</option>
                          <option value="delhivery">Force Delhivery</option>
                        </select>
                        <button
                          onClick={handleReassign}
                          disabled={isReassigning}
                          className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold transition-colors disabled:opacity-50"
                        >
                          {isReassigning ? 'Reassigning...' : 'Retry Assignment'}
                        </button>
                      </div>
                    </div>
                  ) : returnRequest.reverseShipment.providerId === 'own_fleet' ? (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <p className="font-semibold text-gray-800">Own Fleet Assigned</p>
                        <Badge variant="info" className="text-[10px] uppercase">
                          {returnRequest.reverseShipment.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {returnRequest.reverseShipment.deliveryBoyId ? (
                        <p className="mt-1 font-medium bg-gray-50 p-2 rounded border border-gray-150">
                          🧑 {returnRequest.reverseShipment.deliveryBoyId.name}<br/>
                          📞 {returnRequest.reverseShipment.deliveryBoyId.phone}<br/>
                        </p>
                      ) : (
                        <p className="text-gray-400 italic bg-gray-50 p-2 rounded text-center">Finding nearest rider...</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <p className="font-semibold text-gray-800 capitalize">
                          {returnRequest.reverseShipment.providerId} Scheduled
                        </p>
                        <Badge variant="success" className="text-[10px] uppercase">
                          {returnRequest.reverseShipment.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="mt-1 bg-gray-50 p-2 rounded border border-gray-150 space-y-1">
                        <p className="flex justify-between items-center">
                          <span className="text-gray-500">AWB Number:</span>
                          <span className="font-semibold text-gray-800">{returnRequest.reverseShipment.awbCode || 'N/A'}</span>
                        </p>
                        <p className="flex justify-between items-center">
                          <span className="text-gray-500">Tracking:</span>
                          {returnRequest.reverseShipment.trackingUrl ? (
                            <a 
                              href={returnRequest.reverseShipment.trackingUrl}
                              target="_blank" 
                              rel="noreferrer"
                              className="font-semibold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              Track Package
                            </a>
                          ) : (
                            <span className="text-gray-400 italic">Not available</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Legacy Fallback or Not Yet Created */
                <>
                  {returnRequest.status === 'pending' || returnRequest.status === 'rejected' ? (
                    <p className="text-gray-500 italic bg-gray-50 p-2 rounded text-center border border-gray-150">
                      Reverse shipment has not been created yet.
                    </p>
                  ) : returnRequest.deliveryBoyId ? (
                    <div>
                      <p className="font-semibold text-gray-800">Assigned Driver (Legacy)</p>
                      <p className="mt-1 font-medium bg-gray-50 p-2 rounded border border-gray-150">
                        🧑 {returnRequest.deliveryBoyId.name}<br/>
                        📞 {returnRequest.deliveryBoyId.phone}<br/>
                        ✉️ {returnRequest.deliveryBoyId.email}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 italic bg-gray-50 p-2 rounded text-center">No rider assigned.</p>
                  )}
                </>
              )}
              
              <div className="border-t border-gray-100 pt-2 mt-3 space-y-2">
                <p className="font-semibold text-gray-800 mb-1">Security OTP Statuses</p>
                <div className="flex justify-between items-center py-0.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">Return Pickup OTP:</span>
                  <span className="font-semibold text-gray-700">
                    {getOtpStatusText(returnRequest.returnPickupOtpVerified, returnRequest.returnPickupOtpExpiresAt)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">Vendor Handoff OTP:</span>
                  <span className="font-semibold text-gray-700">
                    {getOtpStatusText(returnRequest.vendorHandoffOtpVerified, returnRequest.vendorHandoffOtpExpiresAt)}
                  </span>
                </div>
                {isExchange && (
                  <>
                    <div className="flex justify-between items-center py-0.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">Vendor Handover OTP:</span>
                      <span className="font-semibold text-gray-700">
                        {getOtpStatusText(returnRequest.vendorHandoverOtpVerified, returnRequest.vendorHandoverOtpExpiresAt)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-0.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">Delivery OTP:</span>
                      <span className="font-semibold text-gray-700">
                        {getOtpStatusText(returnRequest.customerDeliveryOtpVerified, returnRequest.customerDeliveryOtpExpiresAt)}
                      </span>
                    </div>
                  </>
                )}
              </div>
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
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDateTime(log.changedAt)}</span>
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
                      <span className="block text-[10px] text-gray-400 mt-0.5">{formatDateTime(returnRequest.requestDate)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-800">Current Status: {returnRequest.status}</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{formatDateTime(returnRequest.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              <Link
                to={`/admin/orders/${returnRequest.orderId}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold"
              >
                <FiShoppingBag className="text-sm" />
                View Original Order
              </Link>
              <button
                onClick={() => window.location.href = `mailto:${returnRequest.customer.email}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
              >
                <FiMail className="text-sm" />
                Email Customer
              </button>
              {returnRequest.customer.phone && (
                <button
                  onClick={() => window.location.href = `tel:${returnRequest.customer.phone}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
                >
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

