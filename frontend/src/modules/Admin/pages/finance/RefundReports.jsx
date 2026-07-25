import { useState, useMemo, useEffect } from "react";
import { FiRefreshCw, FiDollarSign, FiLoader } from "react-icons/fi";
import { motion } from "framer-motion";
import RefundTrendsChart from "../../components/Analytics/RefundTrendsChart";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
import ExportButton from "../../components/ExportButton";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from '../../../../shared/utils/helpers';
import { getAllReturnRequests } from "../../services/adminService";

const RefundReports = () => {
  const [refunds, setRefunds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let mounted = true;

    const fetchRefunds = async () => {
      setIsLoading(true);
      try {
        const allReturns = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await getAllReturnRequests({ page, limit: 200 });
          const payload = response || {};
          const list = payload.returnRequests || (Array.isArray(response) ? response : []);
          allReturns.push(...list);
          totalPages = payload.pagination?.pages || payload.pages || 1;
          page += 1;
        }

        const normalizedRefunds = allReturns.map((request) => {
          const requestStatus = request.status || "pending";
          const refundStatus = request.refundStatus || "pending";
          const status =
            refundStatus === "processed" || requestStatus === "completed"
              ? "completed"
              : refundStatus === "failed" || requestStatus === "rejected"
                ? "rejected"
                : "pending";

          return {
            id: request._id || request.id,
            orderId: request.orderId?.orderId || request.orderId || request.orderRefId || "N/A",
            customerName: request.userId?.name || request.orderId?.shippingAddress?.name || "Customer",
            amount: Number(request.refundAmount) || 0,
            reason: request.returnReason || request.reason || "N/A",
            requestStatus,
            refundStatus,
            status,
            requestedDate: request.createdAt || request.requestDate,
            processedDate:
              status === "completed" || status === "rejected"
                ? request.updatedAt || null
                : null,
          };
        });

        if (mounted) setRefunds(normalizedRefunds);
      } catch (err) {
        console.error("Failed fetching refund reports:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchRefunds();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredRefunds = refunds.filter(
    (refund) => statusFilter === "all" || refund.status === statusFilter
  );

  const totalRefunds = filteredRefunds.reduce(
    (sum, refund) => sum + refund.amount,
    0
  );
  const completedRefunds = filteredRefunds.filter(
    (r) => r.status === "completed"
  ).length;
  const pendingRefunds = filteredRefunds.filter(
    (r) => r.status === "pending"
  ).length;

  const columns = [
    {
      key: "id",
      label: "Refund ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-gray-800">{String(value).slice(-8).toUpperCase()}</span>
      ),
    },
    {
      key: "orderId",
      label: "Order ID",
      sortable: true,
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (value) => (
        <span className="font-bold text-red-600">{formatPrice(value)}</span>
      ),
    },
    {
      key: "reason",
      label: "Reason",
      sortable: false,
      render: (value) => (
        <p className="text-sm text-gray-600 max-w-xs truncate">{value}</p>
      ),
    },
    {
      key: "requestStatus",
      label: "Return Status",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "completed" || value === "delivered_to_vendor" ? "success" : value === "rejected" ? "error" : "warning"}>
          {value}
        </Badge>
      ),
    },
    {
      key: "refundStatus",
      label: "Refund Status",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "processed" || value === "completed" ? "success" : value === "failed" ? "error" : "warning"}>
          {value}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Summary",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "completed" ? "success" : "warning"}>
          {value}
        </Badge>
      ),
    },
    {
      key: "requestedDate",
      label: "Requested",
      sortable: true,
      render: (value) => new Date(value).toLocaleString(),
    },
    {
      key: "processedDate",
      label: "Processed",
      sortable: true,
      render: (value) =>
        value ? (
          new Date(value).toLocaleString()
        ) : (
          <span className="text-gray-400">Pending</span>
        ),
    },
  ];

  return (
    isLoading && refunds.length === 0 ? (
      <div className="flex items-center justify-center min-h-[320px]">
        <FiLoader className="animate-spin text-3xl text-primary-600" />
      </div>
    ) : (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Refund Reports
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Track refund requests and processing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Refunds</p>
            <FiDollarSign className="text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {formatPrice(totalRefunds)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Completed</p>
            <FiRefreshCw className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {completedRefunds}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Pending</p>
            <FiRefreshCw className="text-yellow-600" />
          </div>
          <p className="text-2xl font-bold text-yellow-600">{pendingRefunds}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "completed", label: "Completed" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
            ]}
            className="min-w-[140px]"
          />
          <ExportButton
            data={filteredRefunds}
            headers={[
              { label: "Refund ID", accessor: (row) => row.id },
              { label: "Order ID", accessor: (row) => row.orderId },
              { label: "Customer", accessor: (row) => row.customerName },
              {
                label: "Amount",
                accessor: (row) => formatPrice(row.amount),
              },
              { label: "Reason", accessor: (row) => row.reason },
              { label: "Status", accessor: (row) => row.status },
            ]}
            filename="refund-report"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <RefundTrendsChart refundData={filteredRefunds} period="month" />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={filteredRefunds}
          columns={columns}
          pagination={true}
          itemsPerPage={10}
        />
      </div>
    </motion.div>
    )
  );
};

export default RefundReports;
