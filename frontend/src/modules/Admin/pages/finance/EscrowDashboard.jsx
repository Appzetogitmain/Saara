import { useState, useEffect } from "react";
import {
  FiBriefcase,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiTrendingUp,
  FiDownloadCloud,
  FiEye,
  FiShield
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../../shared/utils/api";
import { formatPrice } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";

const EscrowDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchEscrowSummaryAndRequests = async () => {
    setLoading(true);
    try {
      const [summaryRes, withdrawalsRes] = await Promise.all([
        api.get("/admin/escrow/summary"),
        api.get(`/admin/escrow/withdrawals?status=${statusFilter}`)
      ]);
      setSummary(summaryRes.data || summaryRes);
      setWithdrawals(withdrawalsRes.data?.withdrawals || withdrawalsRes.withdrawals || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load admin escrow stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrowSummaryAndRequests();
  }, [statusFilter]);

  const handleUpdateStatus = async (id, newStatus) => {
    setIsUpdating(true);
    try {
      await api.patch(`/admin/escrow/withdrawals/${id}/status`, { status: newStatus });
      toast.success(`Withdrawal status updated to ${newStatus}!`);
      setSelectedWithdrawal(null);
      fetchEscrowSummaryAndRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to update withdrawal status.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-6xl mx-auto pb-24 px-4"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <FiShield className="text-emerald-700" /> Admin Escrow & Settlement Dashboard
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Monitor escrow holds, verify buyer return deadlines, and process vendor withdrawals
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Escrow Hold</span>
            <FiClock className="text-amber-500" />
          </div>
          <p className="text-xl font-black text-slate-800 font-mono">{formatPrice(summary?.totalEscrowBalance || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            {summary?.paymentsOnHold || 0} active orders held
          </span>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Released Today</span>
            <FiCheckCircle className="text-emerald-500" />
          </div>
          <p className="text-xl font-black text-emerald-600 font-mono">{formatPrice(summary?.paymentsReleasedToday || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            Passed 7-day return limit
          </span>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Refunds Pending</span>
            <FiAlertCircle className="text-rose-500" />
          </div>
          <p className="text-xl font-black text-rose-600 font-mono">{formatPrice(summary?.pendingRefunds || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            COD refunds to dispatch
          </span>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pending Payouts</span>
            <FiBriefcase className="text-purple-500" />
          </div>
          <p className="text-xl font-black text-purple-650 font-mono">{summary?.pendingWithdrawalsCount || 0}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            Withdrawal logs pending
          </span>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Payouts</span>
            <FiTrendingUp className="text-blue-500" />
          </div>
          <p className="text-xl font-black text-blue-600 font-mono">{formatPrice(summary?.totalCompletedWithdrawals || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            Completely settled payouts
          </span>
        </div>
      </div>

      {/* Filters and Request logs list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
            Withdrawal Request logs
          </h2>
          <div className="flex gap-2">
            {["all", "pending", "approved", "processing", "completed", "rejected"].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                  statusFilter === st 
                    ? "bg-[#024d3e] border-[#024d3e] text-white" 
                    : "bg-slate-50 border-slate-100 text-slate-550 hover:bg-slate-100"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Vendor Store</th>
                <th className="py-3 px-4">Amount Requested</th>
                <th className="py-3 px-4">Bank Details Details</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 font-bold uppercase tracking-wider">
                    Loading payout records...
                  </td>
                </tr>
              ) : withdrawals.length > 0 ? (
                withdrawals.map((w) => {
                  const statusColors = {
                    pending: "bg-amber-50 text-amber-700 border-amber-100",
                    approved: "bg-indigo-50 text-indigo-700 border-indigo-100",
                    processing: "bg-blue-50 text-blue-700 border-blue-100",
                    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
                    rejected: "bg-rose-50 text-rose-700 border-rose-100"
                  };

                  return (
                    <tr key={w._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4 font-bold text-slate-800">
                        {w.vendorId?.storeName || w.vendorId?.name || "N/A"}
                        <span className="block text-[9px] font-mono text-slate-400 font-medium">
                          {w.vendorId?.email}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-black font-mono text-slate-800">
                        {formatPrice(w.amount)}
                      </td>
                      <td className="py-4 px-4">
                        <div className="text-[10px] text-slate-500 font-medium space-y-0.5">
                          <div><span className="font-bold text-slate-700">Holder:</span> {w.bankDetails?.accountHolder}</div>
                          <div><span className="font-bold text-slate-700">Bank:</span> {w.bankDetails?.bankName}</div>
                          <div><span className="font-bold text-slate-700">A/c:</span> <span className="font-mono">{w.bankDetails?.accountNumber}</span></div>
                          <div><span className="font-bold text-slate-700">IFSC:</span> <span className="font-mono">{w.bankDetails?.ifsc}</span></div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-400 font-mono">
                        {new Date(w.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColors[w.status] || "bg-slate-50"}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => setSelectedWithdrawal(w)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all active:scale-95 inline-flex items-center gap-1"
                        >
                          <FiEye className="text-sm" /> Manage
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-bold uppercase tracking-wider">
                    No withdrawal requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdrawal moderation modal */}
      <AnimatePresence>
        {selectedWithdrawal && (
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-800 uppercase text-sm tracking-wider">
                  Manage Payout Request
                </h3>
                <button
                  onClick={() => setSelectedWithdrawal(null)}
                  className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-400"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-450 font-bold uppercase tracking-wider">Vendor Store</span>
                  <span className="font-black text-slate-800">
                    {selectedWithdrawal.vendorId?.storeName || selectedWithdrawal.vendorId?.name || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-450 font-bold uppercase tracking-wider">Amount</span>
                  <span className="font-black text-slate-800 text-base font-mono">
                    {formatPrice(selectedWithdrawal.amount)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-50 pb-2">
                  <span className="text-slate-450 font-bold uppercase tracking-wider">Date Requested</span>
                  <span className="font-bold text-slate-650">
                    {new Date(selectedWithdrawal.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2">
                  <span className="block text-[10px] font-black text-slate-450 uppercase tracking-wider">
                    Bank Payout Destination
                  </span>
                  <div className="space-y-1 font-medium text-slate-700">
                    <div>Account Holder: <span className="font-bold text-slate-800">{selectedWithdrawal.bankDetails?.accountHolder}</span></div>
                    <div>Bank Name: <span className="font-bold text-slate-800">{selectedWithdrawal.bankDetails?.bankName}</span></div>
                    <div>Account Number: <span className="font-bold text-slate-800 font-mono">{selectedWithdrawal.bankDetails?.accountNumber}</span></div>
                    <div>IFSC Code: <span className="font-bold text-slate-800 font-mono">{selectedWithdrawal.bankDetails?.ifsc}</span></div>
                  </div>
                </div>
              </div>

              {/* Action buttons based on current status */}
              {selectedWithdrawal.status !== "completed" && selectedWithdrawal.status !== "rejected" ? (
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <button
                    onClick={() => handleUpdateStatus(selectedWithdrawal._id, "completed")}
                    disabled={isUpdating}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all"
                  >
                    Complete & Settle
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedWithdrawal._id, "rejected")}
                    disabled={isUpdating}
                    className="py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all"
                  >
                    Reject Withdrawal
                  </button>
                  {selectedWithdrawal.status === "pending" && (
                    <button
                      onClick={() => handleUpdateStatus(selectedWithdrawal._id, "approved")}
                      disabled={isUpdating}
                      className="col-span-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all"
                    >
                      Approve Request
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-100 rounded-xl text-center font-bold text-slate-500 uppercase tracking-widest text-[9px]">
                  Request Finalized ({selectedWithdrawal.status})
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EscrowDashboard;
