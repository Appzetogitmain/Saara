import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiCheckCircle,
  FiFileText,
} from "react-icons/fi";
import { motion } from "framer-motion";
import ExportButton from "../../Admin/components/ExportButton";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorEarnings } from "../services/vendorService";

const Earnings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendor } = useVendorAuthStore();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes("/commission-history")) return "commission";
    if (path.includes("/settlement-history")) return "settlement";
    return "overview";
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [commissions, setCommissions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchEarnings = async () => {
      setIsLoading(true);
      try {
        const res = await getVendorEarnings();
        const data = res?.data ?? res;
        setCommissions(data?.commissions ?? []);
        setSettlements(data?.settlements ?? []);
        setEarningsSummary(data?.summary ?? null);
      } catch {
        // errors handled by api.js toast
      } finally {
        setIsLoading(false);
      }
    };

    fetchEarnings();
  }, [vendorId]);

  const filteredCommissions = useMemo(() => {
    if (selectedStatus === "all") return commissions;
    return commissions.filter(
      (c) => (c.effectiveStatus || c.status) === selectedStatus
    );
  }, [commissions, selectedStatus]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view earnings</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 font-medium">Loading earnings data...</p>
      </div>
    );
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "overview") {
      navigate("/vendor/earnings");
    } else if (tab === "commission") {
      navigate("/vendor/earnings/commission-history");
    } else if (tab === "settlement") {
      navigate("/vendor/earnings/settlement-history");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-6xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Earnings
          </h1>
          <p className="text-sm text-gray-600">
            View your earnings and commission history
          </p>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 bg-slate-50/50 px-4">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1">
            <button
              onClick={() => handleTabChange("overview")}
              className={`flex items-center gap-2 px-5 py-4 border-b-2 transition-all whitespace-nowrap text-sm font-bold ${activeTab === "overview"
                ? "border-primary-600 text-primary-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
              <FiDollarSign />
              <span>Overview</span>
            </button>
            <button
              onClick={() => handleTabChange("commission")}
              className={`flex items-center gap-2 px-5 py-4 border-b-2 transition-all whitespace-nowrap text-sm font-bold ${activeTab === "commission"
                ? "border-primary-600 text-primary-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
              <FiFileText />
              <span>Commission History</span>
            </button>
            <button
              onClick={() => handleTabChange("settlement")}
              className={`flex items-center gap-2 px-5 py-4 border-b-2 transition-all whitespace-nowrap text-sm font-bold ${activeTab === "settlement"
                ? "border-primary-600 text-primary-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
              <FiCheckCircle />
              <span>Settlement History</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* Earnings Summary Cards - Show on Overview tab */}
          {activeTab === "overview" && (
            <div className="mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50/30 rounded-3xl p-6 shadow-sm border border-green-100 hover:shadow-md hover:border-green-200/80 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-green-700 font-bold uppercase tracking-wider">
                      Total Earnings
                    </p>
                    <div className="p-2 bg-green-500/10 rounded-xl text-green-600">
                      <FiDollarSign className="text-base" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-green-800 font-mono">
                    {earningsSummary
                      ? formatPrice(earningsSummary.totalEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-[10px] text-green-600 mt-2 font-bold uppercase tracking-wider">All time</p>
                </div>

                <div className="bg-gradient-to-br from-yellow-50 to-amber-50/30 rounded-3xl p-6 shadow-sm border border-yellow-100 hover:shadow-md hover:border-yellow-200/80 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-yellow-700 font-bold uppercase tracking-wider">
                      Pending
                    </p>
                    <div className="p-2 bg-yellow-500/10 rounded-xl text-yellow-600">
                      <FiClock className="text-base" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-yellow-800 font-mono">
                    {earningsSummary
                      ? formatPrice(earningsSummary.pendingEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-[10px] text-yellow-600 mt-2 font-bold uppercase tracking-wider">
                    Awaiting settlement
                  </p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50/30 rounded-3xl p-6 shadow-sm border border-blue-100 hover:shadow-md hover:border-blue-200/80 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">Paid</p>
                    <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600">
                      <FiCheckCircle className="text-base" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-blue-800 font-mono">
                    {earningsSummary
                      ? formatPrice(earningsSummary.paidEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-[10px] text-blue-600 mt-2 font-bold uppercase tracking-wider">Settled</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-indigo-50/30 rounded-3xl p-6 shadow-sm border border-purple-100 hover:shadow-md hover:border-purple-200/80 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-purple-700 font-bold uppercase tracking-wider">
                      Total Orders
                    </p>
                    <div className="p-2 bg-purple-500/10 rounded-xl text-purple-600">
                      <FiTrendingUp className="text-base" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-purple-800 font-mono">
                    {earningsSummary ? earningsSummary.totalOrders : 0}
                  </p>
                  <p className="text-[10px] text-purple-600 mt-2 font-bold uppercase tracking-wider">With earnings</p>
                </div>
              </div>
            </div>
          )}

          {/* Commission History Section */}
          {(activeTab === "overview" || activeTab === "commission") && (
            <div className={activeTab === "overview" ? "mb-8" : ""}>
              <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-1">
                      Commission History
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold">
                      View all your commission records
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex-1 sm:flex-initial">
                      <AnimatedSelect
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        options={[
                          { value: "all", label: "All Status" },
                          { value: "pending", label: "Pending" },
                          { value: "paid", label: "Paid" },
                          { value: "cancelled", label: "Cancelled" },
                        ]}
                        className="min-w-[130px] w-full"
                      />
                    </div>
                    <ExportButton
                      data={filteredCommissions}
                      headers={[
                        {
                          label: "Order",
                          accessor: (row) =>
                            row.orderDisplayId ||
                            (typeof row.orderId === "object"
                              ? row.orderId?.orderId || row.orderId?._id
                              : row.orderId),
                        },
                        {
                          label: "Date",
                          accessor: (row) =>
                            new Date(row.createdAt).toLocaleDateString(),
                        },
                        {
                          label: "Subtotal",
                          accessor: (row) => formatPrice(row.subtotal),
                        },
                        {
                          label: "Commission",
                          accessor: (row) => formatPrice(row.commission),
                        },
                        {
                          label: "Your Earnings",
                          accessor: (row) => formatPrice(row.vendorEarnings),
                        },
                        { label: "Status", accessor: (row) => row.status },
                      ]}
                      filename="vendor-commissions"
                    />
                  </div>
                </div>

                {filteredCommissions.length > 0 ? (
                  <div className="space-y-4">
                    {filteredCommissions.map((commission) => {
                      const displayId = commission.orderDisplayId ||
                        (typeof commission.orderId === "object"
                          ? commission.orderId?.orderId || commission.orderId?._id
                          : commission.orderId);

                      const status = (commission.effectiveStatus || commission.status) ?? "pending";

                      const statusConfig = {
                        paid: {
                          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
                          bar: "bg-emerald-500",
                          label: "Paid",
                        },
                        pending: {
                          bg: "bg-amber-50 text-amber-700 border-amber-200",
                          bar: "bg-amber-500",
                          label: "Pending",
                        },
                        cancelled: {
                          bg: "bg-rose-50 text-rose-700 border-rose-200",
                          bar: "bg-rose-500",
                          label: "Cancelled",
                        },
                      };

                      const currentStatus = statusConfig[status.toLowerCase()] || statusConfig.pending;

                      return (
                        <div
                          key={commission._id ?? commission.id}
                          className="bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 pl-6 group">
                          {/* Accent status indicator bar on left */}
                          <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${currentStatus.bar}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md truncate max-w-[200px] md:max-w-none" title={displayId}>
                                {displayId}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${currentStatus.bg}`}>
                                {currentStatus.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Date</p>
                                <p className="font-bold text-slate-700">
                                  {new Date(commission.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Subtotal</p>
                                <p className="font-extrabold text-slate-800 font-mono">
                                  {formatPrice(commission.subtotal)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Commission</p>
                                <p className="font-extrabold text-rose-500 font-mono">
                                  -{formatPrice(commission.commission)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Your Earnings</p>
                                <p className="font-black text-emerald-500 font-mono">
                                  {formatPrice(commission.vendorEarnings)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end border-t border-slate-50 md:border-t-0 pt-3 md:pt-0">
                            <button
                              onClick={() =>
                                navigate(
                                  `/vendor/orders/${commission.orderRef || commission.orderId}`
                                )
                              }
                              className="w-full md:w-auto px-4 py-2 bg-slate-50 hover:bg-primary-600 hover:text-white border border-gray-100 text-slate-700 hover:border-transparent rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                              View Order
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FiFileText className="text-4xl text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2">
                      No commission records found
                    </p>
                    <p className="text-sm text-gray-400">
                      {selectedStatus !== "all"
                        ? "Try selecting a different status"
                        : "Commissions will appear here once you receive orders"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settlement History Section */}
          {(activeTab === "overview" || activeTab === "settlement") &&
            settlements.length > 0 && (
              <div>
                <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 mb-1">
                        Settlement History
                      </h2>
                      <p className="text-xs text-slate-400 font-semibold">
                        View your payment settlements
                      </p>
                    </div>
                    <ExportButton
                      data={settlements}
                      headers={[
                        {
                          label: "Settlement ID",
                          accessor: (row) => row._id || row.id,
                        },
                        {
                          label: "Date",
                          accessor: (row) =>
                            new Date(row.createdAt).toLocaleDateString(),
                        },
                        {
                          label: "Amount",
                          accessor: (row) => formatPrice(row.amount),
                        },
                        {
                          label: "Payment Method",
                          accessor: (row) => row.paymentMethod,
                        },
                        {
                          label: "Transaction ID",
                          accessor: (row) => row.transactionId || "N/A",
                        },
                      ]}
                      filename="vendor-settlements"
                    />
                  </div>

                  <div className="space-y-4">
                    {settlements.map((settlement) => {
                      const isFailed = settlement.status === "failed";
                      return (
                        <div
                          key={settlement._id || settlement.id}
                          className="bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 pl-6 group">
                          {/* Accent status indicator bar on left */}
                          <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${isFailed ? "bg-rose-500" : "bg-emerald-500"}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md truncate max-w-[200px]" title={settlement._id || settlement.id}>
                                {settlement._id || settlement.id}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                isFailed
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}>
                                {String(settlement.status || "completed").toUpperCase()}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Date Paid</p>
                                <p className="font-bold text-slate-700">
                                  {new Date(settlement.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Amount</p>
                                <p className="font-black text-emerald-500 font-mono">
                                  {formatPrice(settlement.amount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Payment Method</p>
                                <p className="font-bold text-slate-700 capitalize">
                                  {settlement.paymentMethod?.replace("_", " ") || "N/A"}
                                </p>
                              </div>
                              {settlement.transactionId && (
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Transaction ID</p>
                                  <p className="font-bold text-slate-600 font-mono text-xs truncate max-w-[150px]" title={settlement.transactionId}>
                                    {settlement.transactionId}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          {activeTab === "settlement" && settlements.length === 0 && (
            <div className="text-center py-12">
              <FiCheckCircle className="text-4xl text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No settlement records found</p>
              <p className="text-sm text-gray-400">
                Settlements will appear here once your commissions are paid
              </p>
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
};

export default Earnings;
