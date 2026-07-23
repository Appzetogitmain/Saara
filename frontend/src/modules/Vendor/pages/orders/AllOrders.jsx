import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiEye,
  FiShoppingBag,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import DataTable from "../../../Admin/components/DataTable";
import ExportButton from "../../../Admin/components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice } from '../../../../shared/utils/helpers';
import EmptyState from '../../../../shared/components/EmptyState';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getAllVendorOrders, updateVendorOrderStatus } from '../../services/vendorService';
import { getSocket, joinRoom, leaveRoom } from '../../../../shared/utils/socket';
import toast from 'react-hot-toast';

const AllOrders = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const vendorId = vendor?.id;

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getAllVendorOrders({ limit: 100 });
      setOrders(data?.orders ?? []);
    } catch {
      // errors handled by api.js toast
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!vendorId) return;
    fetchOrders(true);
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`vendor_${vendorId}`);

    const handleOrderUpdate = (updatedOrder) => {
      fetchOrders(false);
    };

    socket.on('order_updated', handleOrderUpdate);

    return () => {
      socket.off('order_updated', handleOrderUpdate);
      leaveRoom(`vendor_${vendorId}`);
    };
  }, [vendorId]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((order) =>
        order.orderId?.toLowerCase().includes(q) ||
        order._id?.toLowerCase().includes(q)
      );
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter((order) => {
        const vendorItem = order.vendorItems?.find(
          (vi) => vi.vendorId?.toString() === vendorId?.toString()
        );
        const status = (vendorItem?.status ?? order.status ?? '').toLowerCase();
        return status === selectedStatus.toLowerCase();
      });
    }

    return filtered;
  }, [orders, searchQuery, selectedStatus, vendorId]);

  // Get per-vendor earnings (Net Payout)
  const getVendorEarningsAmount = (order) => {
    const vendorItem = order.vendorItems?.find(
      (vi) => vi.vendorId?.toString() === vendorId?.toString()
    );
    if (order.commissionDetails?.vendorEarnings !== undefined) {
      return order.commissionDetails.vendorEarnings;
    }
    if (!vendorItem) return 0;
    const effectiveSub = vendorItem.subtotal - (vendorItem.discount || 0);
    const comm = order.commissionDetails?.commission !== undefined
      ? order.commissionDetails.commission
      : parseFloat((effectiveSub * 0.1).toFixed(2));
    return parseFloat((effectiveSub - comm).toFixed(2));
  };

  const getOrderStatus = (order) => {
    const vendorItem = order.vendorItems?.find(
      (vi) => vi.vendorId?.toString() === vendorId?.toString()
    );
    return vendorItem?.status ?? order.status ?? 'pending';
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateVendorOrderStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => {
          if ((o.orderId ?? o._id) !== orderId) return o;
          return {
            ...o,
            vendorItems: o.vendorItems?.map((vi) =>
              vi.vendorId?.toString() === vendorId?.toString()
                ? { ...vi, status: newStatus }
                : vi
            ),
            status: newStatus,
          };
        })
      );
      toast.success('Order status updated');
    } catch {
      // errors handled by api.js toast
    }
  };

  const columns = [
    {
      key: 'orderId',
      label: 'Order ID',
      sortable: true,
      render: (value, row) => (
        <span className="font-semibold text-gray-800">
          {value ?? row._id}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      sortable: false,
      render: (_, row) => {
        const vendorItem = row.vendorItems?.find(
          (vi) => vi.vendorId?.toString() === vendorId?.toString()
        );
        const count = vendorItem?.items?.length ?? row.vendorItems?.length ?? 0;
        return (
          <span className="text-sm text-gray-700">{count} item(s)</span>
        );
      },
    },
    {
      key: 'totalAmount',
      label: 'Amount',
      sortable: true,
      render: (_, row) => (
        <span className="font-semibold text-gray-800">
          {formatPrice(getVendorEarningsAmount(row))}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (_, row) => {
        const status = getOrderStatus(row);
        return (
          <Badge
            variant={
              status === 'delivered'
                ? 'success'
                : status === 'pending'
                  ? 'warning'
                  : status === 'cancelled' || status === 'canceled'
                    ? 'error'
                    : 'info'
            }>
            {status?.toUpperCase() || 'N/A'}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => navigate(`/vendor/orders/${row.orderId ?? row._id}`)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <FiEye />
        </button>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view orders</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            All Orders
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View and manage all your orders
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Filters */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'pending', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'ready_for_pickup', label: 'Ready for Pickup' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              className="w-full sm:w-auto min-w-[140px]"
            />

            <div className="w-full sm:w-auto">
              <ExportButton
                data={filteredOrders}
                headers={[
                  { label: 'Order ID', accessor: (row) => row.orderId ?? row._id },
                  { label: 'Date', accessor: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—' },
                  { label: 'Amount', accessor: (row) => formatPrice(getVendorEarningsAmount(row)) },
                  { label: 'Status', accessor: (row) => getOrderStatus(row) },
                ]}
                filename="vendor-orders"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center py-12 text-gray-400">Loading orders...</p>
        ) : filteredOrders.length > 0 ? (
          <DataTable
            data={filteredOrders}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
            onRowClick={(row) => navigate(`/vendor/orders/${row.orderId ?? row._id}`)}
          />
        ) : (
          <EmptyState
            icon={FiShoppingBag}
            title="No orders found"
            description={searchQuery || selectedStatus !== 'all'
              ? 'Try adjusting your filters'
              : 'Orders containing your products will appear here'}
            className="my-6"
          />
        )}
      </div>
    </motion.div>
  );
};

export default AllOrders;
