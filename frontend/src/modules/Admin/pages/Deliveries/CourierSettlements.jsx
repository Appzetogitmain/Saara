import React, { useState, useEffect } from "react";
import { FiCheckCircle, FiClock, FiSearch } from "react-icons/fi";
import api from "../../../../shared/utils/api";
import { toast } from "react-hot-toast";

const CourierSettlements = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [providerFilter, setProviderFilter] = useState("Shiprocket");

  const fetchPendingShipments = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/courier-remittances/pending?providerId=${providerFilter}`);
      const payload = res.data?.data ?? res.data;
      setShipments(Array.isArray(payload) ? payload : []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load pending shipments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingShipments();
  }, [providerFilter]);

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === shipments.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(shipments.map(s => s._id)));
  };

  const totalAmountSelected = shipments
    .filter(s => selectedIds.has(s._id))
    .reduce((sum, s) => sum + s.orderTotal, 0);

  const handleSettle = async () => {
    if (selectedIds.size === 0) return;

    if (!window.confirm(`Are you sure you want to mark ${selectedIds.size} shipments (₹${totalAmountSelected}) as remitted?`)) {
      return;
    }

    try {
      await api.post("/admin/courier-remittances/settle", {
        shipmentIds: Array.from(selectedIds),
        amountReceived: totalAmountSelected,
        providerId: providerFilter
      });
      toast.success("Shipments marked as settled successfully.");
      setSelectedIds(new Set());
      fetchPendingShipments();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to settle shipments.");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courier COD Settlements</h1>
          <p className="text-gray-500 text-sm mt-1">Manage pending COD remittances from third-party couriers.</p>
        </div>
        <div className="flex gap-4 items-center">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="border-gray-300 rounded-lg shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="Shiprocket">Shiprocket</option>
              <option value="Delhivery">Delhivery</option>
            </select>
          <button
            onClick={handleSettle}
            disabled={selectedIds.size === 0}
            className={`px-4 py-2 rounded-lg font-medium text-white shadow-sm flex items-center gap-2 ${
              selectedIds.size > 0 ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            <FiCheckCircle />
            Settle Selected (₹{totalAmountSelected.toFixed(2)})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={shipments.length > 0 && selectedIds.size === shipments.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Shipment #</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Delivered At</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase">COD Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    Loading pending shipments...
                  </td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    No pending COD shipments found for {providerFilter}.
                  </td>
                </tr>
              ) : (
                shipments.map((s) => (
                  <tr
                    key={s._id}
                    className={`hover:bg-gray-50 transition-colors ${selectedIds.has(s._id) ? "bg-blue-50/50" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s._id)}
                        onChange={() => toggleSelect(s._id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{s.shipmentNumber}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{s.vendorId}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(s.deliveredAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">₹{s.orderTotal.toFixed(2)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CourierSettlements;
