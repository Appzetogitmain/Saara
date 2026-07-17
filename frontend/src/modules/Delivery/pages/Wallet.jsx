import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeliveryAuthStore } from "../store/deliveryStore";
import {
  FiDollarSign,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiCreditCard,
  FiInfo,
  FiChevronRight,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiCheck,
} from "react-icons/fi";
import PageTransition from "../../../shared/components/PageTransition";
import toast from "react-hot-toast";
import { formatPrice } from "../../../shared/utils/helpers";

const DeliveryWallet = () => {
  const {
    walletSummary,
    walletTransactions,
    walletTransactionsPagination,
    fetchWalletSummary,
    requestWithdrawal,
    updatePayoutSettings,
    fetchWalletTransactions,
    companyPaymentDetails,
    fetchCompanyPaymentDetails,
  } = useDeliveryAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  // Payout settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("upi");
  const [upiId, setUpiId] = useState("");
  const [bankDetails, setBankDetails] = useState({
    accountHolder: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
  });

  // State to track if company payment instructions panel is open
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  // State to track clipboard copy status
  const [copiedField, setCopiedField] = useState(null);

  const loadData = useCallback(
    async (page = 1) => {
      try {
        setIsLoading(true);
        const summary = await fetchWalletSummary();
        await fetchWalletTransactions(page);
        await fetchCompanyPaymentDetails().catch((e) =>
          console.error("Failed loading company details", e),
        );

        // Pre-fill payout details from summary
        if (summary?.payoutMethodDetails) {
          setPayoutMethod(summary.payoutMethodDetails.method || "upi");
          setUpiId(summary.payoutMethodDetails.upiId || "");
          if (summary.payoutMethodDetails.bankDetails) {
            setBankDetails({
              accountHolder:
                summary.payoutMethodDetails.bankDetails.accountHolder || "",
              accountNumber:
                summary.payoutMethodDetails.bankDetails.accountNumber || "",
              ifsc: summary.payoutMethodDetails.bankDetails.ifsc || "",
              bankName: summary.payoutMethodDetails.bankDetails.bankName || "",
            });
          }
        }
      } catch (err) {
        toast.error("Failed to load wallet data.");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchWalletSummary, fetchWalletTransactions, fetchCompanyPaymentDetails],
  );

  useEffect(() => {
    loadData(currentPage);
  }, [loadData, currentPage]);

  const handleWithdrawalSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(withdrawAmount);

    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    if (amountNum < 100) {
      toast.error("Minimum withdrawal amount is ₹100.");
      return;
    }

    const available = Number(walletSummary?.availableWithdrawal || 0);
    if (amountNum > available) {
      toast.error(
        "Dues check failed. You cannot request more than your net available balance.",
      );
      return;
    }

    setIsSubmittingWithdraw(true);
    try {
      await requestWithdrawal(amountNum);
      toast.success("Withdrawal request submitted successfully!");
      setWithdrawModalOpen(false);
      setWithdrawAmount("");
      loadData(currentPage); // reload details
    } catch (err) {
      toast.error(err.message || "Failed to submit withdrawal request.");
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);

    try {
      const payload = {
        method: payoutMethod,
        upiId: payoutMethod === "upi" ? upiId.trim() : undefined,
        bankDetails: payoutMethod === "bank" ? bankDetails : undefined,
      };

      await updatePayoutSettings(payload);
      toast.success("Payout details saved successfully!");
      setSettingsOpen(false);
    } catch (err) {
      toast.error(err.message || "Failed to save payout settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "DELIVERY_EARNING":
        return { icon: FiArrowDownLeft, color: "text-green-600 bg-green-50" };
      case "COD_COLLECTION":
        return { icon: FiArrowUpRight, color: "text-orange-600 bg-orange-50" };
      case "COD_SETTLEMENT":
        return { icon: FiCheckCircle, color: "text-blue-600 bg-blue-50" };
      case "WITHDRAWAL":
        return { icon: FiArrowUpRight, color: "text-red-600 bg-red-50" };
      case "WITHDRAWAL_REFUND":
        return {
          icon: FiArrowDownLeft,
          color: "text-emerald-600 bg-emerald-50",
        };
      default:
        return { icon: FiInfo, color: "text-slate-600 bg-slate-50" };
    }
  };

  const formatTxType = (type) => {
    return String(type || "").replace("_", " ");
  };

  const netBalance = Number(walletSummary?.availableWithdrawal || 0);

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-5xl mx-auto pb-24">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-wide">
              My Wallet
            </h1>
            <p className="text-xs text-slate-500">
              View earnings, liabilities, and manage payouts
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full sm:w-auto p-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-2xl transition-all text-xs font-bold flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            <FiCreditCard className="text-sm" />
            Payout Setup
          </button>
        </div>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Balances & Settlement Info */}
          <div className="lg:col-span-5 space-y-6">
            {/* Dynamic balances card grid */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden space-y-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-12 -mt-12" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12" />

              <div className="relative z-10 space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Available for Withdrawal
                </p>
                <h2 className="text-4xl font-black font-mono tracking-tight">
                  {isLoading ? (
                    <span className="inline-block h-9 w-32 rounded bg-slate-700 animate-pulse" />
                  ) : (
                    formatPrice(netBalance)
                  )}
                </h2>
              </div>

              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Logistics Earnings
                  </p>
                  <p className="text-lg font-black font-mono text-emerald-400">
                    {isLoading ? (
                      <span className="inline-block h-6 w-20 rounded bg-slate-700 animate-pulse" />
                    ) : (
                      formatPrice(walletSummary?.earningsBalance || 0)
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    COD Liability (Cash Owed)
                  </p>
                  <p className="text-lg font-black font-mono text-orange-400">
                    {isLoading ? (
                      <span className="inline-block h-6 w-20 rounded bg-slate-700 animate-pulse" />
                    ) : (
                      formatPrice(walletSummary?.codLiability || 0)
                    )}
                  </p>
                </div>
              </div>

              {/* Quick Action Withdrawal Button */}
              <div className="relative z-10">
                {netBalance >= 100 ? (
                  <button
                    onClick={() => setWithdrawModalOpen(true)}
                    className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
                  >
                    Request Withdrawal
                  </button>
                ) : (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2 text-xs font-semibold text-red-300">
                    <FiAlertCircle className="text-base flex-shrink-0 mt-0.5" />
                    <div>
                      {netBalance < 0
                        ? `Withdrawals locked. Please clear your COD dues of ${formatPrice(walletSummary?.codLiability || 0)} to restore balance.`
                        : `Minimum payout threshold is ₹100. Current available: ${formatPrice(netBalance)}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* COD Cash Settlement Instructions */}
            {!isLoading && walletSummary && (
              <div className="space-y-3">
                {Number(walletSummary.codLiability || 0) <= 0 ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-4 flex items-center gap-3">
                    <div className="p-2 bg-emerald-500 text-white rounded-xl">
                      <FiCheckCircle className="text-base" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        All Clear!
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium">
                        All COD cash collections are fully settled. No outstanding
                        liabilities.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
                    <button
                      onClick={() => setInstructionsOpen(!instructionsOpen)}
                      className="w-full p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-orange-500/10 text-orange-600 rounded-2xl">
                          <FiInfo className="text-lg" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            How to Settle COD Cash
                          </h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                            Due Amount:{" "}
                            <span className="font-mono text-orange-600 font-black">
                              {formatPrice(walletSummary.codLiability)}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="p-1.5 bg-slate-50 rounded-xl text-slate-500">
                        {instructionsOpen ? (
                          <FiChevronUp className="text-lg" />
                        ) : (
                          <FiChevronDown className="text-lg" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {instructionsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="border-t border-slate-50 overflow-hidden"
                        >
                          <div className="p-5 space-y-5">
                            {/* Dynamic QR Code Section */}
                            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="p-2 bg-white rounded-2xl border border-slate-100 shadow-sm flex-shrink-0">
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                                    `upi://pay?pa=${companyPaymentDetails?.upiId || "Porutkal.pay@upi"}&pn=${encodeURIComponent(
                                      companyPaymentDetails?.accountName ||
                                        "Porutkal Logistics",
                                    )}&am=${walletSummary.codLiability}&cu=INR`,
                                  )}`}
                                  alt="UPI QR Code"
                                  className="w-28 h-28 object-contain"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              </div>
                              <div className="text-center sm:text-left space-y-1">
                                <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                                  Scan & Pay Instantly
                                </h5>
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                  Scan this QR code with any UPI app (GPay, PhonePe,
                                  Paytm) to transfer the exact amount of{" "}
                                  <span className="font-bold text-slate-800 font-mono">
                                    {formatPrice(walletSummary.codLiability)}
                                  </span>{" "}
                                  directly to the platform.
                                </p>
                              </div>
                            </div>

                            {/* UPI ID Transfer */}
                            <div className="space-y-2">
                              <label className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                                Deposit via UPI ID
                              </label>
                              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                                <span className="text-xs font-mono font-bold text-slate-700 flex-1 truncate">
                                  {companyPaymentDetails?.upiId ||
                                    "Porutkal.pay@upi"}
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopy(
                                      companyPaymentDetails?.upiId ||
                                        "Porutkal.pay@upi",
                                      "UPI ID",
                                    )
                                  }
                                  className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-100 rounded-xl shadow-sm transition-all"
                                >
                                  {copiedField === "UPI ID" ? (
                                    <FiCheck className="text-emerald-600 text-sm" />
                                  ) : (
                                    <FiCopy className="text-sm" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Bank Transfer Details */}
                            <div className="space-y-3">
                              <label className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">
                                Deposit via Bank Transfer
                              </label>
                              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider block">
                                      Account Name
                                    </span>
                                    <span className="font-semibold text-slate-800 truncate block">
                                      {companyPaymentDetails?.accountName ||
                                        "Porutkal LOGISTICS PVT LTD"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between min-w-0">
                                    <div className="truncate flex-1 min-w-0">
                                      <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider block">
                                        Bank Name
                                      </span>
                                      <span className="font-semibold text-slate-800 truncate block">
                                        {companyPaymentDetails?.bankName ||
                                          "HDFC Bank"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="border-t border-slate-100 pt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider block">
                                        Account Number
                                      </span>
                                      <span className="font-bold font-mono text-xs text-slate-800 block truncate">
                                        {companyPaymentDetails?.accountNumber ||
                                          "50200081729012"}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleCopy(
                                          companyPaymentDetails?.accountNumber ||
                                            "50200081729012",
                                          "Account Number",
                                        )
                                      }
                                      className="p-1.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-lg shadow-sm transition-all"
                                    >
                                      {copiedField === "Account Number" ? (
                                        <FiCheck className="text-emerald-600 text-xs" />
                                      ) : (
                                        <FiCopy className="text-xs" />
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 border-t border-slate-100/50 pt-2">
                                    <div className="min-w-0 flex-1">
                                      <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider block">
                                        IFSC Code
                                      </span>
                                      <span className="font-bold font-mono text-xs text-slate-800 block truncate">
                                        {companyPaymentDetails?.ifscCode ||
                                          "HDFC0000103"}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleCopy(
                                          companyPaymentDetails?.ifscCode ||
                                            "HDFC0000103",
                                          "IFSC Code",
                                        )
                                      }
                                      className="p-1.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-lg shadow-sm transition-all"
                                    >
                                      {copiedField === "IFSC Code" ? (
                                        <FiCheck className="text-emerald-600 text-xs" />
                                      ) : (
                                        <FiCopy className="text-xs" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Step Instructions */}
                            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[10px] text-amber-700 leading-relaxed font-semibold">
                              <p className="font-black uppercase tracking-wider text-[9px] mb-1">
                                Settlement instructions:
                              </p>
                              <ol className="list-decimal pl-4 space-y-1">
                                <li>
                                  Transfer the exact amount above to the platform
                                  bank or UPI details.
                                </li>
                                <li>
                                  Save the receipt/transaction reference number.
                                </li>
                                <li>
                                  Submit the transaction screenshot/proof to the
                                  Admin for verification.
                                </li>
                              </ol>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Transaction Statement Ledger */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Transaction Statement Ledger
              </h3>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-2xl bg-slate-50 animate-pulse"
                    />
                  ))}
                </div>
              ) : walletTransactions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                  <FiInfo className="text-lg mx-auto mb-1 text-slate-300" />
                  <p>No wallet transaction ledger history found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {walletTransactions.map((tx) => {
                    const config = getTransactionIcon(tx.type);
                    const Icon = config.icon;
                    const isDebit = tx.amount < 0;

                    return (
                      <div
                        key={tx._id}
                        className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}
                          >
                            <Icon className="text-lg" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 capitalize leading-tight truncate">
                              {formatTxType(tx.type)}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                              {tx.notes}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              {new Date(tx.createdAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-xs font-extrabold font-mono ${isDebit ? "text-slate-600" : "text-green-600"}`}
                          >
                            {isDebit ? "-" : "+"}
                            {formatPrice(Math.abs(tx.amount))}
                          </p>
                          <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            Bal: {formatPrice(tx.walletBalanceAfter)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Simple statement pagination */}
              {!isLoading && walletTransactionsPagination.pages > 1 && (
                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 disabled:hover:bg-slate-100 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                  >
                    Previous
                  </button>
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                    Page {currentPage} of {walletTransactionsPagination.pages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(prev + 1, walletTransactionsPagination.pages),
                      )
                    }
                    disabled={currentPage === walletTransactionsPagination.pages}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 disabled:hover:bg-slate-100 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Withdrawal request modal */}
        <AnimatePresence>
          {withdrawModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6 shadow-2xl relative"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                    Request Withdrawal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Enter withdrawal amount (Minimum ₹100)
                  </p>
                </div>

                <form onSubmit={handleWithdrawalSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-bold"
                      required
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Net Available:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {formatPrice(netBalance)}
                    </span>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setWithdrawModalOpen(false)}
                      className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingWithdraw}
                      className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {isSubmittingWithdraw ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Payout Settings slide/modal */}
        <AnimatePresence>
          {settingsOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md space-y-6 shadow-2xl relative"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                    Payout Setup
                  </h3>
                  <p className="text-xs text-slate-500">
                    Set up your target payout account for withdrawals
                  </p>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayoutMethod("upi")}
                      className={`py-2 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                        payoutMethod === "upi"
                          ? "bg-primary-50 border-primary-200 text-primary-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      UPI ID
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayoutMethod("bank")}
                      className={`py-2 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                        payoutMethod === "bank"
                          ? "bg-primary-50 border-primary-200 text-primary-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Bank Transfer
                    </button>
                  </div>

                  {payoutMethod === "upi" ? (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        UPI ID
                      </label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="e.g. driver@ybl"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-bold"
                        required
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Account Holder Name
                        </label>
                        <input
                          type="text"
                          value={bankDetails.accountHolder}
                          onChange={(e) =>
                            setBankDetails({
                              ...bankDetails,
                              accountHolder: e.target.value,
                            })
                          }
                          placeholder="e.g. John Doe"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-semibold"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={bankDetails.accountNumber}
                          onChange={(e) =>
                            setBankDetails({
                              ...bankDetails,
                              accountNumber: e.target.value,
                            })
                          }
                          placeholder="Account Number"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-mono"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          IFSC Code
                        </label>
                        <input
                          type="text"
                          value={bankDetails.ifsc}
                          onChange={(e) =>
                            setBankDetails({
                              ...bankDetails,
                              ifsc: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="IFSC"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-mono"
                          required
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={bankDetails.bankName}
                          onChange={(e) =>
                            setBankDetails({
                              ...bankDetails,
                              bankName: e.target.value,
                            })
                          }
                          placeholder="e.g. HDFC Bank"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-800 font-semibold"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {isSavingSettings ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

export default DeliveryWallet;
export { DeliveryWallet };
