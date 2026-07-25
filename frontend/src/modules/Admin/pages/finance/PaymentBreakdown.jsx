import { useState, useMemo, useEffect } from "react";
import { FiLoader } from "react-icons/fi";
import { motion } from "framer-motion";
import PaymentBreakdownPieChart from "../../components/Analytics/PaymentBreakdownPieChart";
import { formatPrice } from '../../../../shared/utils/helpers';
import { getSalesReport } from "../../services/adminService";

const PaymentBreakdown = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const allOrders = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await getSalesReport({ page, limit: 200, status: 'all' });
          const payload = response || {};
          const fetchedOrders = payload.orders || (Array.isArray(response) ? response : []);
          allOrders.push(...fetchedOrders);
          totalPages = payload.pages || 1;
          page += 1;
        }

        if (mounted) setOrders(allOrders);
      } catch (err) {
        console.error("Failed to fetch payment breakdown orders:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const paymentBreakdown = useMemo(() => {
    const breakdown = {
      card: { count: 0, total: 0 },
      cash: { count: 0, total: 0 },
      cod: { count: 0, total: 0 },
      bank: { count: 0, total: 0 },
      wallet: { count: 0, total: 0 },
      upi: { count: 0, total: 0 },
    };

    orders.forEach((order) => {
      const method = String(order.paymentMethod || "cod").toLowerCase();
      const normalizedMethod = breakdown[method] ? method : "cod";
      breakdown[normalizedMethod].count += 1;
      breakdown[normalizedMethod].total += Number(order.total) || 0;
    });

    return breakdown;
  }, [orders]);

  const totalAmount = Object.values(paymentBreakdown).reduce(
    (sum, method) => sum + method.total,
    0
  );

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <FiLoader className="animate-spin text-3xl text-primary-600" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Payment Breakdown
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Analyze payment methods and distribution
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          Total Payments: {formatPrice(totalAmount)}
        </h3>
        <PaymentBreakdownPieChart paymentData={paymentBreakdown} />
      </div>
    </motion.div>
  );
};

export default PaymentBreakdown;
