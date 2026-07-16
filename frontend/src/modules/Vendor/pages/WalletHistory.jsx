import { useState, useMemo, useEffect } from "react";
import {
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiBriefcase,
  FiArrowUpRight,
  FiGrid
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import Badge from "../../../shared/components/Badge";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import api from "../../../shared/utils/api";
import toast from "react-hot-toast";

const WalletHistory = () => {
  const { vendor } = useVendorAuthStore();
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Withdrawal Form States
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [bankDetails, setBankDetails] = useState({
    accountHolder: vendor?.bankDetails?.accountName || "",
    accountNumber: vendor?.bankDetails?.accountNumber || "",
    ifsc: vendor?.bankDetails?.ifscCode || "",
    bankName: vendor?.bankDetails?.bankName || ""
  });

  const vendorId = vendor?.id || vendor?._id;

  const fetchWalletData = async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get("/vendor/wallet/stats"),
        api.get("/vendor/wallet/history")
      ]);
      setStats(statsRes.data || statsRes);
      setTransactions(historyRes.data?.transactions || historyRes.transactions || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load wallet stats.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [vendorId]);

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(withdrawAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (amountNum > (stats?.walletBalance || 0)) {
      toast.error("Insufficient available balance.");
      return;
    }
    if (!bankDetails.accountNumber || !bankDetails.accountHolder || !bankDetails.ifsc || !bankDetails.bankName) {
      toast.error("Please fill all bank account details.");
      return;
    }

    setIsSubmittingWithdraw(true);
    try {
      await api.post("/vendor/wallet/withdraw", {
        amount: amountNum,
        bankDetails
      });
      toast.success("Withdrawal request submitted successfully!");
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      fetchWalletData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to request withdrawal.");
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto pb-24 px-4"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-wider">
            Vendor Wallet & Payouts
          </h1>
          <p className="text-xs text-slate-400 font-bold mt-0.5 uppercase tracking-wide">
            Manage your escrow release timeline and request payout withdrawals
          </p>
        </div>
        <button
          onClick={() => {
            setBankDetails({
              accountHolder: vendor?.bankDetails?.accountName || bankDetails.accountHolder || "",
              accountNumber: vendor?.bankDetails?.accountNumber || bankDetails.accountNumber || "",
              ifsc: vendor?.bankDetails?.ifscCode || bankDetails.ifsc || "",
              bankName: vendor?.bankDetails?.bankName || bankDetails.bankName || ""
            });
            setShowWithdrawModal(true);
          }}
          disabled={!stats?.walletBalance || stats.walletBalance <= 0}
          className="px-5 py-2.5 bg-[#024d3e] hover:bg-[#01352a] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed lg:ml-auto"
        >
          Withdraw Funds
        </button>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Balance</span>
            <FiCheckCircle className="text-emerald-500 text-sm" />
          </div>
          <p className="text-2xl font-black text-emerald-600 font-mono">{formatPrice(stats?.walletBalance || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Ready for withdrawal</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">On Hold Escrow</span>
            <FiClock className="text-amber-500 text-sm" />
          </div>
          <p className="text-2xl font-black text-amber-600 font-mono">{formatPrice(stats?.onHoldBalance || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Delivered (7-day hold)</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Progress Payouts</span>
            <FiBriefcase className="text-purple-500 text-sm" />
          </div>
          <p className="text-2xl font-black text-purple-600 font-mono">{formatPrice(stats?.pendingWithdrawal || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Withdrawals processing</span>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Withdrawn</span>
            <FiDollarSign className="text-blue-500 text-sm" />
          </div>
          <p className="text-2xl font-black text-blue-600 font-mono">{formatPrice(stats?.totalWithdrawn || 0)}</p>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">All-time completions</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: expected releases timeline & recent releases */}
        <div className="lg:col-span-1 space-y-6">
          {/* Expected releases */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
              ⌛ Escrow Payout Schedule
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {stats?.expectedReleases && stats.expectedReleases.length > 0 ? (
                stats.expectedReleases.map((rel, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">Order #{rel.orderId}</span>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                        Releases in {rel.daysRemaining} days
                      </span>
                    </div>
                    <span className="font-bold text-slate-700 font-mono">
                      {formatPrice(rel.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  No upcoming payouts scheduled.
                </div>
              )}
            </div>
          </div>

          {/* Recent releases */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
              🎉 Recent Escrow Releases (30d)
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {stats?.recentReleases && stats.recentReleases.length > 0 ? (
                stats.recentReleases.map((rel, idx) => (
                  <div key={idx} className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">Order #{rel.orderId}</span>
                      <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                        Released: {new Date(rel.releasedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="font-bold text-emerald-700 font-mono">
                      + {formatPrice(rel.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  No payout releases in last 30 days.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Withdrawal transaction logs */}
        <div className="lg:col-span-2 bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-5">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
            📜 Withdrawal & Payout History
          </h3>

          <div className="space-y-4">
            {transactions.length > 0 ? (
              transactions.map((tx) => {
                const statusColors = {
                  pending: "bg-amber-50 text-amber-700 border-amber-100",
                  approved: "bg-indigo-50 text-indigo-700 border-indigo-100",
                  processing: "bg-blue-50 text-blue-700 border-blue-100",
                  completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  rejected: "bg-rose-50 text-rose-700 border-rose-100"
                };

                return (
                  <div
                    key={tx.id}
                    className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between text-xs hover:border-slate-200 transition-colors"
                  >
                    <div className="space-y-1">
                      <span className="font-bold text-slate-850 block">{tx.description}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Requested: {new Date(tx.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right space-y-1.5">
                      <span className="font-bold text-slate-800 font-mono block">
                        {formatPrice(tx.amount)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColors[tx.status] || "bg-slate-50"}`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase tracking-wider">
                No withdrawal records found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Withdrawal Form Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-800 uppercase text-sm tracking-wider">Request Payout</h3>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 text-slate-400"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                    Withdrawal Amount (Available: {formatPrice(stats?.walletBalance || 0)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Enter amount (Rs.)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#024d3e] focus:outline-none text-sm font-semibold font-mono"
                  />
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Bank Account Details
                  </span>
                  
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    value={bankDetails.accountHolder}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountHolder: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={bankDetails.bankName}
                    onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold font-mono"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={bankDetails.ifsc}
                    onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingWithdraw}
                  className="w-full py-3 bg-[#024d3e] hover:bg-[#01352a] text-white rounded-xl font-bold uppercase text-xs tracking-wider shadow-sm transition-all"
                >
                  {isSubmittingWithdraw ? "Requesting Payout..." : "Submit Payout Request"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default WalletHistory;
