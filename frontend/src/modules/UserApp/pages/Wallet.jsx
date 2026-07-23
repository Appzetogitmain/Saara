import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiCreditCard,
  FiTrendingUp,
  FiTrendingDown,
  FiFilter,
  FiCalendar,
  FiShoppingBag,
  FiPackage,
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import api from '../../../shared/utils/api';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../shared/utils/helpers';

const Wallet = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [activeType, setActiveType] = useState('all'); // 'all', 'credit', 'debit'
  const [activeTxType, setActiveTxType] = useState(''); // '', 'return_refund', 'cancel_refund', 'wallet_payment', 'admin_adjustment', 'cashback'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', '7days', 'month', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchWalletDetails = async () => {
    try {
      const response = await api.get('/user/wallet');
      const payload = response?.data ?? response;
      setWallet(payload);
    } catch (err) {
      toast.error('Failed to load wallet balance');
    }
  };

  const buildQueryString = () => {
    let query = `?page=${page}&limit=${limit}`;
    
    if (activeType !== 'all') {
      query += `&type=${activeType}`;
    }
    
    if (activeTxType) {
      query += `&transactionType=${activeTxType}`;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (dateFilter === 'today') {
      query += `&startDate=${todayStr}&endDate=${todayStr}`;
    } else if (dateFilter === '7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenStr = sevenDaysAgo.toISOString().split('T')[0];
      query += `&startDate=${sevenStr}&endDate=${todayStr}`;
    } else if (dateFilter === 'month') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const monthStr = thirtyDaysAgo.toISOString().split('T')[0];
      query += `&startDate=${monthStr}&endDate=${todayStr}`;
    } else if (dateFilter === 'custom' && startDate && endDate) {
      query += `&startDate=${startDate}&endDate=${endDate}`;
    }

    return query;
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const queryStr = buildQueryString();
      const response = await api.get(`/user/wallet/transactions${queryStr}`);
      const payload = response?.data ?? response;
      setTransactions(payload?.transactions || []);
      setTotalTransactions(payload?.total || 0);
    } catch (err) {
      toast.error('Failed to load transaction history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletDetails();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [activeType, activeTxType, dateFilter, startDate, endDate, page]);

  const handleDateFilterChange = (val) => {
    setDateFilter(val);
    setPage(1);
    if (val !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleTypeChange = (typeVal) => {
    setActiveType(typeVal);
    setActiveTxType('');
    setPage(1);
  };

  const handleTxTypeChange = (txTypeVal) => {
    setActiveTxType(txTypeVal);
    if (txTypeVal === 'wallet_payment') {
      setActiveType('debit');
    } else if (['return_refund', 'cancel_refund', 'exchange_refund', 'cashback', 'reward'].includes(txTypeVal)) {
      setActiveType('credit');
    } else {
      setActiveType('all');
    }
    setPage(1);
  };

  const totalPages = Math.ceil(totalTransactions / limit) || 1;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="min-h-screen bg-gray-50 pb-20">
          
          {/* Header */}
          <div className="bg-white border-b border-gray-150 px-4 py-3 sticky top-0 z-30 flex items-center gap-3 shadow-sm">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
            >
              <FiArrowLeft className="text-xl text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 flex-1">My Wallet</h1>
            <button 
              onClick={() => { fetchWalletDetails(); fetchTransactions(); }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
              title="Refresh Balance"
            >
              <FiRefreshCw className="text-lg text-gray-600" />
            </button>
          </div>

          <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
            
            {/* Visual Balance Card */}
            {wallet && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white p-6 shadow-xl border border-purple-500/20"
              >
                {/* Background Patterns */}
                <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-10 translate-y-10">
                  <FiCreditCard className="text-[250px]" />
                </div>
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-purple-200 font-medium">Available Balance</span>
                    <h2 className="text-3xl lg:text-4xl font-extrabold mt-1 tracking-tight">
                      {formatPrice(wallet.balance)}
                    </h2>
                  </div>
                  <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold border border-white/20">
                    INR Wallet
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-white/10 text-sm">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-purple-200 block">Cashback Balance</span>
                    <span className="font-semibold text-white mt-0.5 block">{formatPrice(wallet.cashbackBalance || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-purple-200 block">Reward Points</span>
                    <span className="font-semibold text-white mt-0.5 block">{wallet.rewardPoints || 0} pts</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick Metrics Cards */}
            {wallet && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <FiTrendingUp className="text-lg" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Refunded</span>
                    <h4 className="font-extrabold text-gray-900 text-sm mt-0.5">{formatPrice(wallet.totalCredits)}</h4>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                    <FiTrendingDown className="text-lg" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Spent</span>
                    <h4 className="font-extrabold text-gray-900 text-sm mt-0.5">{formatPrice(wallet.totalDebits)}</h4>
                  </div>
                </div>
              </div>
            )}

            {/* Filters Section */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <FiFilter className="text-primary-600 text-base" />
                <h3 className="font-bold text-gray-900 text-sm">Filters & Date Range</h3>
              </div>

              {/* Transaction Category Filter */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'All Transactions', value: '', action: () => { handleTypeChange('all'); } },
                  { label: 'Purchases', value: 'wallet_payment', action: () => { handleTxTypeChange('wallet_payment'); } },
                  { label: 'Order Refunds', value: 'cancel_refund', action: () => { handleTxTypeChange('cancel_refund'); } },
                  { label: 'Return Refunds', value: 'return_refund', action: () => { handleTxTypeChange('return_refund'); } },
                  { label: 'Cashback', value: 'cashback', action: () => { handleTxTypeChange('cashback'); } },
                ].map((item, idx) => {
                  const isActive = (item.value === '' && activeType === 'all' && !activeTxType) || 
                                   (item.value === 'wallet_payment' && activeTxType === 'wallet_payment') ||
                                   (item.value === 'cancel_refund' && activeTxType === 'cancel_refund') ||
                                   (item.value === 'return_refund' && activeTxType === 'return_refund') ||
                                   (item.value === 'cashback' && activeTxType === 'cashback');
                  
                  return (
                    <button
                      key={idx}
                      onClick={item.action}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all focus:outline-none ${
                        isActive
                          ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md shadow-primary-500/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Date Filters */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {[
                  { label: 'All Time', value: 'all' },
                  { label: 'Today', value: 'today' },
                  { label: 'Last 7 Days', value: '7days' },
                  { label: 'Month', value: 'month' },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => handleDateFilterChange(item.value)}
                    className={`py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
                      dateFilter === item.value
                        ? 'border-purple-600 bg-purple-50 text-purple-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => handleDateFilterChange('custom')}
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    dateFilter === 'custom' ? 'text-purple-600' : 'text-gray-500'
                  }`}
                >
                  <FiCalendar />
                  Custom Date Range
                </button>
              </div>

              {/* Custom Date Form */}
              <AnimatePresence>
                {dateFilter === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden grid grid-cols-2 gap-2 pt-2"
                  >
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">From</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">To</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs mt-1"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ledger Transactions list */}
            <div className="space-y-3">
              <h3 className="font-bold text-gray-800 text-sm flex items-center justify-between">
                <span>Transaction History</span>
                <span className="text-xs text-gray-500 font-semibold">{totalTransactions} entries</span>
              </h3>

              {isLoading ? (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center shadow-sm">
                  <p className="text-gray-500 text-xs font-semibold animate-pulse">Loading transaction records...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center shadow-sm space-y-2">
                  <FiShoppingBag className="text-3xl text-gray-300 mx-auto" />
                  <p className="text-gray-500 text-xs font-bold">No transactions match your filters</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transactions.map((txn) => {
                    const isCredit = txn.type === 'credit';
                    
                    // Resolve visuals per category
                    let emoji = '💰';
                    let label = txn.type;
                    let colorClass = isCredit 
                      ? 'bg-green-50 text-green-700 border-green-200' 
                      : 'bg-red-50 text-red-700 border-red-200';
                    
                    if (['return_refund', 'cancel_refund', 'exchange_refund'].includes(txn.transactionType)) {
                      emoji = '🟢';
                      label = 'Refund';
                      colorClass = 'bg-green-50 text-green-700 border-green-200';
                    } else if (txn.transactionType === 'wallet_payment' || txn.transactionType === 'purchase') {
                      emoji = '🔴';
                      label = 'Purchase';
                      colorClass = 'bg-red-50 text-red-700 border-red-200';
                    } else if (txn.transactionType === 'cashback') {
                      emoji = '🎁';
                      label = 'Cashback';
                      colorClass = 'bg-yellow-50 text-yellow-750 border-yellow-250';
                    } else if (txn.transactionType === 'admin_adjustment') {
                      emoji = '⚙️';
                      label = 'Adjustment';
                      colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
                    } else if (txn.transactionType === 'reversal') {
                      emoji = '🔄';
                      label = 'Reversal';
                      colorClass = 'bg-orange-50 text-orange-700 border-orange-200';
                    }

                    return (
                      <motion.div
                        key={txn._id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center gap-4 hover:border-purple-200 transition-colors"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm select-none">{emoji}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${colorClass}`}>
                              {label}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">
                              {new Date(txn.createdAt).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          
                          <p className="text-xs text-gray-700 font-bold leading-tight">{txn.description}</p>
                          
                          {/* Navigation buttons/links */}
                          <div className="flex flex-wrap gap-2 pt-1.5">
                            {txn.orderId && (
                              <button
                                onClick={() => navigate(`/orders/${txn.orderId?.orderId || txn.orderId}`)}
                                className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-700 font-black border border-purple-100 hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors focus:outline-none"
                              >
                                <FiPackage size={10} />
                                View Order
                              </button>
                            )}
                            {txn.returnRequestId && (
                              <button
                                onClick={() => navigate(`/returns/${txn.returnRequestId?._id || txn.returnRequestId}`)}
                                className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-700 font-black border border-purple-100 hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors focus:outline-none"
                              >
                                <FiRefreshCw size={10} />
                                View Return
                              </button>
                            )}
                          </div>
                        </div>

                        <div className={`text-right font-black text-sm ${
                          isCredit ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isCredit ? '+' : '-'}
                          {formatPrice(txn.amount)}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-4">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 border border-gray-250 rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none"
                      >
                        <FiChevronLeft className="text-gray-600" />
                      </button>
                      <span className="text-xs text-gray-500 font-bold">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 border border-gray-250 rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none"
                      >
                        <FiChevronRight className="text-gray-600" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default Wallet;
