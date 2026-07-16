import { useState, useEffect } from 'react';
import { 
  FiDollarSign, 
  FiCheckCircle, 
  FiXCircle, 
  FiRefreshCw, 
  FiInfo, 
  FiPlusCircle, 
  FiUserMinus, 
  FiUserPlus,
  FiClock,
  FiSearch
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import Badge from '../../../../shared/components/Badge';
import AnimatedSelect from '../../components/AnimatedSelect';
import { formatCurrency } from '../../utils/adminHelpers';
import { 
  getDeliveryPayoutRequests, 
  updateDeliveryWithdrawalStatus, 
  adjustDeliveryBoyWallet, 
  getAllDeliveryBoys 
} from '../../services/adminService';
import toast from 'react-hot-toast';

const AdminPayouts = () => {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const itemsPerPage = 20;

  // Modals state
  const [approveModalData, setApproveModalData] = useState(null);
  const [rejectModalData, setRejectModalData] = useState(null);
  const [transactionId, setTransactionId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Adjustment state
  const [adjustmentBoyId, setAdjustmentBoyId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('bonus');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchBoyQuery, setSearchBoyQuery] = useState('');

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const res = await getDeliveryPayoutRequests({
        status: statusFilter || undefined,
        page: currentPage,
        limit: itemsPerPage
      });
      const data = res?.data ?? res ?? {};
      setRequests(data.requests || []);
      setPagination({
        total: Number(data.totalCount || 0),
        page: Number(data.currentPage || 1),
        limit: itemsPerPage,
        pages: Number(data.totalPages || 1)
      });
    } catch (err) {
      toast.error('Failed to load payout requests.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBoys = async () => {
    try {
      const res = await getAllDeliveryBoys({ limit: 100 });
      setDeliveryBoys(res?.data?.deliveryBoys || []);
    } catch (err) {
      // Slently ignore
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchBoys();
  }, []);

  const handleProcessRequest = async (id) => {
    try {
      await updateDeliveryWithdrawalStatus(id, { action: 'process' });
      toast.success('Payout request locked in processing state.');
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'Failed to lock payout.');
    }
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setIsSubmitting(true);
    try {
      await updateDeliveryWithdrawalStatus(approveModalData._id, {
        action: 'approve',
        transactionId: transactionId.trim()
      });
      toast.success('Payout marked as completed successfully!');
      setApproveModalData(null);
      setTransactionId('');
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'Failed to approve payout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) return;

    setIsSubmitting(true);
    try {
      await updateDeliveryWithdrawalStatus(rejectModalData._id, {
        action: 'reject',
        rejectionReason: rejectionReason.trim()
      });
      toast.success('Payout request rejected. Funds refunded to rider.');
      setRejectModalData(null);
      setRejectionReason('');
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'Failed to reject payout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!adjustmentBoyId) {
      toast.error('Please select a delivery boy.');
      return;
    }
    const amt = parseFloat(adjustmentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!adjustmentNotes.trim()) {
      toast.error('Audit notes are required.');
      return;
    }

    setIsSavingAdjustment(true);
    try {
      await adjustDeliveryBoyWallet(adjustmentBoyId, {
        amount: amt,
        type: adjustmentType,
        notes: adjustmentNotes.trim()
      });
      toast.success(`Successfully posted ${adjustmentType} adjustment!`);
      setAdjustmentAmount('');
      setAdjustmentNotes('');
      setAdjustmentBoyId('');
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'Failed to adjust wallet balance.');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'processing':
        return <Badge variant="info">Processing</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      case 'rejected':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const columns = [
    {
      key: 'deliveryBoy',
      label: 'Rider Details',
      render: (_, row) => {
        const boy = row.deliveryBoyId || {};
        return (
          <div>
            <p className="font-semibold text-gray-800">{boy.name || 'N/A'}</p>
            <p className="text-xs text-gray-500">{boy.phone || boy.email || ''}</p>
          </div>
        );
      }
    },
    {
      key: 'amount',
      label: 'Requested Amount',
      render: (val) => (
        <span className="font-bold text-gray-800 font-mono">{formatCurrency(val)}</span>
      )
    },
    {
      key: 'payoutDetails',
      label: 'Payout Target Details',
      render: (_, row) => {
        const target = row.payoutMethodDetails || {};
        if (target.method === 'upi') {
          return (
            <div>
              <p className="text-xs font-semibold text-gray-800">UPI</p>
              <p className="text-xs text-gray-500 font-mono">{target.upiId}</p>
            </div>
          );
        }
        const bank = target.bankDetails || {};
        return (
          <div>
            <p className="text-xs font-semibold text-gray-800">Bank ({bank.bankName})</p>
            <p className="text-xs text-gray-500">
              Holder: {bank.accountHolder} <br />
              A/C: <span className="font-mono">{bank.accountNumber}</span> <br />
              IFSC: <span className="font-mono">{bank.ifsc}</span>
            </p>
          </div>
        );
      }
    },
    {
      key: 'createdAt',
      label: 'Request Date',
      render: (val) => (
        <span className="text-xs text-gray-500">
          {new Date(val).toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => getStatusBadge(val)
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        if (row.status === 'pending') {
          return (
            <button
              onClick={() => handleProcessRequest(row._id)}
              className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <FiClock /> Lock Processing
            </button>
          );
        }
        if (row.status === 'processing') {
          return (
            <div className="flex gap-2">
              <button
                onClick={() => setApproveModalData(row)}
                className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-0.5"
              >
                <FiCheckCircle /> Pay
              </button>
              <button
                onClick={() => setRejectModalData(row)}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-0.5"
              >
                <FiXCircle /> Reject
              </button>
            </div>
          );
        }
        return (
          <div className="text-[10px] text-gray-400 font-mono">
            {row.transactionId ? `Ref: ${row.transactionId}` : row.rejectionReason || '-'}
          </div>
        );
      }
    }
  ];

  const filteredBoysForAdjustment = deliveryBoys.filter(boy =>
    boy.name.toLowerCase().includes(searchBoyQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="lg:hidden">
          <h1 className="text-2xl font-bold text-gray-800">Rider Payout & Adjustment Management</h1>
          <p className="text-sm text-gray-600">Review logistics withdrawals, complete payouts, and adjustments</p>
        </div>
        <button 
          onClick={fetchRequests} 
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors lg:ml-auto"
        >
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Payout requests list table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex justify-between items-center gap-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Payout Requests</h2>
            <AnimatedSelect
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: '', label: 'All Payouts' },
                { value: 'pending', label: 'Pending Requests' },
                { value: 'processing', label: 'In Processing' },
                { value: 'completed', label: 'Paid/Completed' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'failed', label: 'Failed' }
              ]}
              className="min-w-[150px]"
            />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <DataTable
              data={requests}
              columns={columns}
              pagination={false}
              loading={isLoading}
            />
            <Pagination
              currentPage={pagination.page || currentPage}
              totalPages={pagination.pages || 1}
              totalItems={pagination.total || 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              className="mt-6"
            />
          </div>
        </div>

        {/* Manual adjustment section */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4 h-fit">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Manual Wallet Adjustment</h2>
            <p className="text-xs text-gray-500">Post penalties or bonus payouts directly to driver wallets</p>
          </div>

          <form onSubmit={handleAdjustmentSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Select Rider</label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Type to filter riders..."
                  value={searchBoyQuery}
                  onChange={(e) => setSearchBoyQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                />
              </div>
              <select
                value={adjustmentBoyId}
                onChange={(e) => setAdjustmentBoyId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs mt-1"
                required
              >
                <option value="">-- Choose Rider --</option>
                {filteredBoysForAdjustment.map((boy) => (
                  <option key={boy._id} value={boy._id}>
                    {boy.name} (Bal: {formatCurrency(boy.walletBalance || 0)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustmentType('bonus')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 ${
                  adjustmentType === 'bonus' 
                    ? 'bg-green-50 border-green-200 text-green-700' 
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <FiUserPlus /> Bonus
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentType('penalty')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 ${
                  adjustmentType === 'penalty' 
                    ? 'bg-red-50 border-red-200 text-red-700' 
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <FiUserMinus /> Penalty
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Adjustment Amount (₹)</label>
              <input 
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Audit Justification Notes</label>
              <textarea 
                value={adjustmentNotes}
                onChange={(e) => setAdjustmentNotes(e.target.value)}
                placeholder="e.g. Incentive bonus for Diwali rush / Penalty for order cancellation."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                rows="3"
                required
              />
            </div>

            <button 
              type="submit"
              disabled={isSavingAdjustment}
              className={`w-full py-2.5 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                adjustmentType === 'bonus' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <FiPlusCircle /> {isSavingAdjustment ? 'Posting...' : `Post Adjustment`}
            </button>
          </form>
        </div>
      </div>

      {/* Approve Modal */}
      <AnimatePresence>
        {approveModalData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
            >
              <div>
                <h3 className="text-lg font-bold text-gray-800">Approve Payout Withdrawal</h3>
                <p className="text-xs text-gray-500">Record Bank/UPI transaction details below</p>
              </div>

              <form onSubmit={handleApproveSubmit} className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-xs">
                  <p><span className="text-gray-500">Amount:</span> <span className="font-bold text-gray-800 font-mono">{formatCurrency(approveModalData.amount)}</span></p>
                  <p><span className="text-gray-500">Recipient:</span> <span className="font-semibold text-gray-800">{approveModalData.deliveryBoyId?.name}</span></p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Transaction ID / Reference Key</label>
                  <input 
                    type="text"
                    placeholder="Enter bank transfer transaction reference"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button 
                    type="button" 
                    onClick={() => setApproveModalData(null)}
                    className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {isSubmitting ? 'Approving...' : 'Confirm Paid'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectModalData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
            >
              <div>
                <h3 className="text-lg font-bold text-gray-800 text-red-600">Reject Withdrawal</h3>
                <p className="text-xs text-gray-500">Provide rejection audit justification reason</p>
              </div>

              <form onSubmit={handleRejectSubmit} className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-xs">
                  <p><span className="text-gray-500">Amount:</span> <span className="font-bold text-gray-850 font-mono">{formatCurrency(rejectModalData.amount)}</span></p>
                  <p><span className="text-gray-500">Recipient:</span> <span className="font-semibold text-gray-800">{rejectModalData.deliveryBoyId?.name}</span></p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Rejection Reason</label>
                  <input 
                    type="text"
                    placeholder="e.g. Bank details IFSC is incorrect / UPI invalid."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button 
                    type="button" 
                    onClick={() => setRejectModalData(null)}
                    className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {isSubmitting ? 'Rejecting...' : 'Reject Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPayouts;
export { AdminPayouts };
