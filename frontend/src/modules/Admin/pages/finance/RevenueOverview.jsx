import { useState, useEffect, useMemo } from "react";
import { FiDollarSign, FiTrendingUp, FiCalendar } from "react-icons/fi";
import { motion } from "framer-motion";
import RevenueComparisonChart from "../../components/Analytics/RevenueComparisonChart";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from '../../../../shared/utils/helpers';
import { useAnalyticsStore } from "../../../../shared/store/analyticsStore";

const getRangeForPeriod = (period) => {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let startDate = new Date(endDate);

  if (period === 'week') {
    startDate.setDate(endDate.getDate() - 6);
  } else if (period === 'month') {
    startDate.setDate(endDate.getDate() - 29);
  } else {
    startDate.setFullYear(endDate.getFullYear() - 1);
    startDate.setDate(endDate.getDate() + 1);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

const RevenueOverview = () => {
  const [period, setPeriod] = useState("month");
  const [isPageLoading, setIsPageLoading] = useState(false);
  const { financialSummary, fetchFinancialSummary } = useAnalyticsStore();

  useEffect(() => {
    const periodMap = {
      week: 'daily',
      month: 'daily',
      year: 'monthly'
    };
    const range = getRangeForPeriod(period);
    let mounted = true;

    const run = async () => {
      setIsPageLoading(true);
      try {
        await fetchFinancialSummary(periodMap[period] || 'monthly', range);
      } finally {
        if (mounted) setIsPageLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [period, fetchFinancialSummary]);

  const chartData = useMemo(() => {
    const list = Array.isArray(financialSummary) ? financialSummary : [];
    return list.map(item => ({
      ...item,
      date: item._id, // Map _id to date for the chart
    }));
  }, [financialSummary]);

  const stats = useMemo(() => {
    const list = Array.isArray(financialSummary) ? financialSummary : [];
    const revenue = list.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const orders = list.reduce((sum, item) => sum + (item.orders || 0), 0);
    const aov = orders > 0 ? revenue / orders : 0;
    return { revenue, orders, aov };
  }, [financialSummary]);

  if (isPageLoading && (!Array.isArray(financialSummary) || financialSummary.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
          Revenue Overview
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Track revenue and sales performance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <FiDollarSign className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(stats.revenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Orders</p>
            <FiCalendar className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.orders}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Average Order Value</p>
            <FiTrendingUp className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(stats.aov)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Revenue Chart</h3>
          <AnimatedSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: "week", label: "Last 7 Days" },
              { value: "month", label: "Last 30 Days" },
              { value: "year", label: "Last Year" },
            ]}
            className="min-w-[140px]"
          />
        </div>
        <RevenueComparisonChart data={chartData} period={period} />
      </div>
    </motion.div>
  );
};

export default RevenueOverview;
