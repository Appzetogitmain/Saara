import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiMail,
  FiPhone,
  FiMapPin,
  FiShoppingBag,
  FiDollarSign,
  FiEdit,
  FiCreditCard,
  FiUser,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useCustomerStore } from '../../../../shared/store/customerStore';
import Badge from '../../../../shared/components/Badge';
import DataTable from '../../components/DataTable';
import { formatPrice } from '../../../../shared/utils/helpers';
import api from '../../../../shared/utils/api';
import { formatDateTime } from '../../utils/adminHelpers';
import { getCustomerOrders } from '../../services/adminService';

import toast from 'react-hot-toast';

const CustomerDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { fetchCustomerById, isLoading } = useCustomerStore();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  const [wallet, setWallet] = useState(null);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletPage, setWalletPage] = useState(1);
  const [walletTotal, setWalletTotal] = useState(0);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState('credit');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('Compensation');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const fetchWalletDetails = async () => {
    try {
      const response = await api.get(`/admin/customers/${id}/wallet`);
      const payload = response?.data ?? response;
      setWallet(payload);
    } catch (err) {
      console.error('Failed to load customer wallet:', err);
    }
  };

  const fetchWalletTxns = async () => {
    try {
      const response = await api.get(`/admin/customers/${id}/wallet/transactions?page=${walletPage}&limit=10`);
      const payload = response?.data ?? response;
      setWalletTransactions(payload?.transactions || []);
      setWalletTotal(payload?.total || 0);
    } catch (err) {
      console.error('Failed to load customer wallet transactions:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'wallet') {
      fetchWalletDetails();
      fetchWalletTxns();
    }
  }, [activeTab, id, walletPage]);

  useEffect(() => {
    const loadCustomer = async () => {
      const data = await fetchCustomerById(id);
      if (data) {
        setCustomer(data);
      } else if (!isLoading) {
        toast.error('Customer not found');
        navigate('/admin/customers');
      }
    };
    loadCustomer();
  }, [id, fetchCustomerById, navigate]);

  useEffect(() => {
    const loadCustomerOrders = async () => {
      if (!customer?.id) return;

      try {
        const firstResponse = await getCustomerOrders(customer.id, { page: 1, limit: 100 });
        const firstOrders = firstResponse?.data?.orders || [];
        const totalPages = Number(firstResponse?.data?.pagination?.pages || 1);

        let customerOrders = [...firstOrders];
        if (totalPages > 1) {
          const pageRequests = [];
          for (let page = 2; page <= totalPages; page += 1) {
            pageRequests.push(getCustomerOrders(customer.id, { page, limit: 100 }));
          }
          const remaining = await Promise.all(pageRequests);
          customerOrders = customerOrders.concat(
            remaining.flatMap((response) => response?.data?.orders || [])
          );
        }

        setOrders(customerOrders);

        const paymentStatusMap = {
          paid: 'completed',
          pending: 'pending',
          failed: 'failed',
          refunded: 'completed',
        };

        const generatedTransactions = customerOrders.flatMap((order) => {
          const orderRef = order.orderId || order._id;
          const createdDate = order.createdAt || new Date().toISOString();
          const baseTransaction = {
            id: `TXN-${orderRef}-PAY`,
            orderId: orderRef,
            amount: Number(order.total) || 0,
            type: 'payment',
            status:
              paymentStatusMap[order.paymentStatus] ||
              (order.status === 'cancelled' ? 'failed' : 'completed'),
            method: order.paymentMethod || 'N/A',
            date: createdDate,
          };

          if (order.paymentStatus === 'refunded') {
            return [
              baseTransaction,
              {
                id: `TXN-${orderRef}-REF`,
                orderId: orderRef,
                amount: Number(order.total) || 0,
                type: 'refund',
                status: 'completed',
                method: 'Original Payment Method',
                date: order.updatedAt || createdDate,
              },
            ];
          }

          return [baseTransaction];
        });

        setTransactions(generatedTransactions);
      } catch (error) {
        setOrders([]);
        setTransactions([]);
      }
    };

    loadCustomerOrders();
  }, [customer]);

  // Set active tab from URL query parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'orders', 'transactions', 'addresses', 'wallet'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Loading customer details...</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      delivered: { variant: 'delivered', label: 'Delivered' },
      shipped: { variant: 'shipped', label: 'Shipped' },
      processing: { variant: 'pending', label: 'Processing' },
      pending: { variant: 'pending', label: 'Pending' },
      cancelled: { variant: 'cancelled', label: 'Cancelled' },
    };
    const config = statusConfig[status] || { variant: 'pending', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTransactionStatusBadge = (status) => {
    if (status === 'completed') {
      return <Badge variant="delivered">Completed</Badge>;
    } else if (status === 'pending') {
      return <Badge variant="pending">Pending</Badge>;
    } else {
      return <Badge variant="cancelled">Failed</Badge>;
    }
  };

  const orderColumns = [
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value) => <span className="font-semibold text-primary-600">{value}</span>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (value) => formatDateTime(value),
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (value) => (
        <span className="text-gray-600">{Array.isArray(value) ? value.length : value || 0}</span>
      ),
    },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => getStatusBadge(value),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/admin/orders/${row.orderId || row._id}`)}
          className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          View
        </button>
      ),
    },
  ];

  const transactionColumns = [
    {
      key: 'id',
      label: 'Transaction ID',
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800">{value}</span>,
    },
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value) => (
        <button
          onClick={() => navigate(`/admin/orders/${value}`)}
          className="text-primary-600 hover:underline font-semibold"
        >
          {value}
        </button>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (value) => (
        <Badge variant={value === 'payment' ? 'delivered' : 'pending'}>
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (value, row) => (
        <span className={row.type === 'refund' ? 'text-red-600' : 'text-green-600'}>
          {row.type === 'refund' ? '-' : '+'}
          {formatPrice(value)}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Payment Method',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => getTransactionStatusBadge(value),
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (value) => formatDateTime(value),
    },
  ];

  const addressColumns = [
    {
      key: 'name',
      label: 'Address Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <span className="font-semibold text-gray-800">{value}</span>
          {row.isDefault && (
            <Badge variant="delivered" className="ml-2 text-xs">
              Default
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      label: 'Address',
      sortable: false,
      render: (value, row) => (
        <div className="max-w-xs">
          <p className="text-gray-800">{value}</p>
          <p className="text-sm text-gray-500">
            {row.city}, {row.state} {row.zipCode}
          </p>
          <p className="text-sm text-gray-500">{row.country}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      sortable: true,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <FiEdit />
          </button>
        </div>
      ),
    },
  ];

  const totalSpent = orders.reduce((sum, order) => {
    if (order.status !== 'cancelled') {
      return sum + (order.total || 0);
    }
    return sum;
  }, 0);

  const totalTransactions = transactions.reduce((sum, txn) => {
    if (txn.type === 'payment' && txn.status === 'completed') {
      return sum + txn.amount;
    } else if (txn.type === 'refund') {
      return sum - txn.amount;
    }
    return sum;
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/customers')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="text-xl text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{customer.name}</h1>
            <p className="text-sm text-gray-600 mt-1">Customer Details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={customer.status === 'active' ? 'success' : 'error'}>
            {customer.status}
          </Badge>
          <button
            onClick={() => navigate(`/admin/customers/view-customers?edit=${customer.id}`)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold text-sm flex items-center gap-2"
          >
            <FiEdit />
            <span className="hidden sm:inline">Edit</span>
          </button>
        </div>
      </div>

      {/* Customer Info Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FiUser className="text-gray-400 text-xl" />
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-semibold text-gray-800">{customer.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FiMail className="text-gray-400 text-xl" />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-semibold text-gray-800">{customer.email}</p>
              </div>
            </div>
            {customer.phone && (
              <div className="flex items-center gap-3">
                <FiPhone className="text-gray-400 text-xl" />
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-semibold text-gray-800">{customer.phone}</p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-gray-800">{orders.length}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Total Spent</p>
              <p className="text-2xl font-bold text-primary-600">{formatPrice(totalSpent)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Last Order</p>
              <p className="text-sm font-semibold text-gray-800">
                {customer.lastOrderDate ? formatDateTime(customer.lastOrderDate) : 'No orders yet'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto scrollbar-hide">
            <button
              onClick={() => {
                setActiveTab('overview');
                navigate(`/admin/customers/${id}?tab=overview`);
              }}
              className={`px-6 py-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overview'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => {
                setActiveTab('orders');
                navigate(`/admin/customers/${id}?tab=orders`);
              }}
              className={`px-6 py-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'orders'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              Orders ({orders.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('transactions');
                navigate(`/admin/customers/${id}?tab=transactions`);
              }}
              className={`px-6 py-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'transactions'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              Transactions ({transactions.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('addresses');
                navigate(`/admin/customers/${id}?tab=addresses`);
              }}
              className={`px-6 py-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'addresses'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              Addresses ({customer.addresses?.length || 0})
            </button>
            <button
              onClick={() => {
                setActiveTab('wallet');
                navigate(`/admin/customers/${id}?tab=wallet`);
              }}
              className={`px-6 py-4 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'wallet'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
            >
              Wallet
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <FiShoppingBag />
                    <span className="text-sm font-semibold">Total Orders</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{orders.length}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <FiDollarSign />
                    <span className="text-sm font-semibold">Total Spent</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{formatPrice(totalSpent)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-2">
                    <FiCreditCard />
                    <span className="text-sm font-semibold">Transactions</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{transactions.length}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-orange-600 mb-2">
                    <FiMapPin />
                    <span className="text-sm font-semibold">Addresses</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {customer.addresses?.length || 0}
                  </p>
                </div>
              </div>

              {/* Recent Orders */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Recent Orders</h3>
                {orders.length > 0 ? (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => (
                      <div
                        key={order.orderId || order._id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                        onClick={() => navigate(`/admin/orders/${order.orderId || order._id}`)}
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{order.orderId || order._id}</p>
                          <p className="text-sm text-gray-500">{formatDateTime(order.createdAt || order.date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-800">{formatPrice(order.total)}</p>
                          {getStatusBadge(order.status)}
                        </div>
                      </div>
                    ))}
                    {orders.length > 5 && (
                      <button
                        onClick={() => setActiveTab('orders')}
                        className="w-full py-2 text-primary-600 hover:text-primary-700 font-semibold"
                      >
                        View All Orders →
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No orders found</p>
                )}
              </div>

              {/* Activity History */}
              {customer.activityHistory && customer.activityHistory.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Activity History</h3>
                  <div className="space-y-2">
                    {customer.activityHistory.slice(0, 10).map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="w-2 h-2 bg-primary-600 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">
                            {activity.description}
                          </p>
                          <p className="text-xs text-gray-500">{formatDateTime(activity.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div>
              {orders.length > 0 ? (
                <DataTable data={orders} columns={orderColumns} pagination={true} itemsPerPage={10} />
              ) : (
                <div className="text-center py-12">
                  <FiShoppingBag className="text-4xl text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-semibold">No orders found</p>
                </div>
              )}
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              {transactions.length > 0 ? (
                <DataTable
                  data={transactions}
                  columns={transactionColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <div className="text-center py-12">
                  <FiCreditCard className="text-4xl text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-semibold">No transactions found</p>
                </div>
              )}
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === 'addresses' && (
            <div>
              {customer.addresses && customer.addresses.length > 0 ? (
                <DataTable
                  data={customer.addresses}
                  columns={addressColumns}
                  pagination={true}
                  itemsPerPage={10}
                />
              ) : (
                <div className="text-center py-12">
                  <FiMapPin className="text-4xl text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 font-semibold">No addresses found</p>
                </div>
              )}
            </div>
          )}

          {/* Wallet Tab */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              
              {/* Wallet Summary Metrics */}
              {wallet ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-5 border border-indigo-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block">Available Balance</span>
                      <p className="text-2xl font-black text-indigo-900 mt-2">{formatPrice(wallet.balance)}</p>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 border border-green-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-green-600 uppercase tracking-wider block">Cashback Balance</span>
                      <p className="text-2xl font-black text-green-900 mt-2">{formatPrice(wallet.cashbackBalance || 0)}</p>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-5 border border-yellow-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-yellow-600 uppercase tracking-wider block">Reward Points</span>
                      <p className="text-2xl font-black text-yellow-900 mt-2">{wallet.rewardPoints || 0} pts</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between gap-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Wallet Status</span>
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          wallet.isLocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {wallet.isLocked ? 'Locked' : 'Active'}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Are you sure you want to ${wallet.isLocked ? 'unlock' : 'lock'} this user's wallet?` + (wallet.isLocked ? '' : ' Locked wallets block customer debits.'))) return;
                          try {
                            const response = await api.patch(`/admin/customers/${id}/wallet/toggle-lock`);
                            const data = response?.data ?? response;
                            setWallet(data);
                            toast.success(`Wallet successfully ${data.isLocked ? 'locked' : 'unlocked'}!`);
                            fetchWalletTxns();
                          } catch (err) {
                            toast.error(err.message || 'Failed to toggle wallet lock status');
                          }
                        }}
                        className={`px-3 py-1 rounded text-xs font-black uppercase transition-all ${
                          wallet.isLocked 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {wallet.isLocked ? 'Unlock' : 'Lock'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 text-center py-8 rounded-xl border border-gray-200">
                  <p className="text-gray-500 text-sm font-semibold">Loading wallet summary details...</p>
                </div>
              )}

              {/* Adjust Balance buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setAdjustmentType('credit');
                    setAdjustmentAmount('');
                    setAdjustmentDescription('');
                    setShowAdjustmentModal(true);
                  }}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all"
                >
                  + Manual Credit (Add Money)
                </button>
                <button
                  onClick={() => {
                    setAdjustmentType('debit');
                    setAdjustmentAmount('');
                    setAdjustmentDescription('');
                    setShowAdjustmentModal(true);
                  }}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all"
                >
                  - Manual Debit (Deduct Money)
                </button>
              </div>

              {/* Wallet Transaction Ledger List */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800">Wallet Transaction Ledger</h3>
                {walletTransactions.length > 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <DataTable
                      data={walletTransactions}
                      columns={[
                        {
                          key: '_id',
                          label: 'Transaction ID',
                          sortable: false,
                          render: (value, row) => <span className="font-semibold text-gray-800" title={value}>{row.reference || value}</span>,
                        },
                        {
                          key: 'type',
                          label: 'Direction',
                          sortable: true,
                          render: (value) => (
                            <Badge variant={value === 'credit' ? 'success' : 'error'}>
                              {value.toUpperCase()}
                            </Badge>
                          ),
                        },
                        {
                          key: 'transactionType',
                          label: 'Type',
                          sortable: true,
                          render: (value) => (
                            <span className="text-xs font-semibold uppercase text-gray-650 bg-gray-100 px-2 py-0.5 rounded">
                              {String(value || '').replace('_', ' ')}
                            </span>
                          ),
                        },
                        {
                          key: 'amount',
                          label: 'Amount',
                          sortable: true,
                          render: (value, row) => (
                            <span className={`font-bold ${row.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                              {row.type === 'credit' ? '+' : '-'}
                              {formatPrice(value)}
                            </span>
                          ),
                        },
                        {
                          key: 'description',
                          label: 'Remarks',
                          sortable: false,
                          render: (value) => <span className="text-xs text-gray-700 font-medium block max-w-xs truncate" title={value}>{value}</span>,
                        },
                        {
                          key: 'status',
                          label: 'Status',
                          sortable: true,
                          render: (value) => (
                            <Badge variant={value === 'completed' ? 'success' : value === 'reversed' ? 'error' : 'pending'}>
                              {value}
                            </Badge>
                          ),
                        },
                        {
                          key: 'createdAt',
                          label: 'Date',
                          sortable: true,
                          render: (value) => formatDateTime(value),
                        },
                      ]}
                      pagination={true}
                      itemsPerPage={10}
                    />
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-xl">
                    <FiCreditCard className="text-4xl text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-semibold">No wallet transaction records found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Wallet Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-100 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-150">
              <h3 className="text-lg font-bold text-gray-800">
                Manual Wallet {adjustmentType === 'credit' ? 'Credit' : 'Debit'}
              </h3>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const amountNum = Number(adjustmentAmount);
                if (!amountNum || amountNum <= 0) {
                  toast.error('Please enter a valid amount greater than 0');
                  return;
                }
                const remark = String(adjustmentDescription).trim();
                if (remark.length < 10) {
                  toast.error('Remarks must be at least 10 characters long');
                  return;
                }

                if (adjustmentType === 'debit') {
                  if (wallet && wallet.balance < amountNum) {
                    toast.error(`Cannot debit ₹${amountNum}. Customer only has ₹${wallet.balance} available.`);
                    return;
                  }
                  if (!window.confirm(`CONFIRM DEBIT: Are you sure you want to manually DEBIT (deduct) ₹${amountNum} from the customer's wallet? This action is permanent.`)) {
                    return;
                  }
                } else {
                  if (!window.confirm(`CONFIRM CREDIT: Are you sure you want to manually CREDIT (add) ₹${amountNum} to the customer's wallet?`)) {
                    return;
                  }
                }

                setIsAdjusting(true);
                try {
                  const endpoint = adjustmentType === 'credit' ? '/admin/wallet/admin-credit' : '/admin/wallet/admin-debit';
                  await api.post(endpoint, {
                    userId: id,
                    amount: amountNum,
                    description: remark,
                    reason: adjustmentReason
                  });
                  toast.success(`Wallet adjusted successfully!`);
                  setAdjustmentAmount('');
                  setAdjustmentDescription('');
                  setAdjustmentReason('Compensation');
                  setShowAdjustmentModal(false);
                  fetchWalletDetails();
                  fetchWalletTxns();
                } catch (err) {
                  toast.error(err.message || 'Failed to adjust wallet balance');
                } finally {
                  setIsAdjusting(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase">Adjustment Reason Category</label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl mt-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                  required
                >
                  <option value="Compensation">Compensation</option>
                  <option value="Promotional Credit">Promotional Credit</option>
                  <option value="Refund Correction">Refund Correction</option>
                  <option value="Fraud Recovery">Fraud Recovery</option>
                  <option value="Manual Refund">Manual Refund</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase">Adjustment Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl mt-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  placeholder="e.g. 500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase">Detailed Remark (Min 10 characters)</label>
                <textarea
                  value={adjustmentDescription}
                  onChange={(e) => setAdjustmentDescription(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl mt-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm h-24 resize-none"
                  placeholder="Provide adjustment reason..."
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="w-1/2 py-2.5 border border-gray-250 rounded-xl text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className={`w-1/2 py-2.5 text-white font-bold rounded-xl text-sm transition-colors ${
                    adjustmentType === 'credit'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:opacity-50`}
                >
                  {isAdjusting ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default CustomerDetailPage;


