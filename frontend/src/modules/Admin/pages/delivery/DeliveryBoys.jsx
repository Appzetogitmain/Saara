import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiMapPin, FiPhone, FiFileText, FiEye, FiMail, FiTruck, FiUser, FiX } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../components/DataTable';
import Badge from '../../../../shared/components/Badge';
import ConfirmModal from '../../components/ConfirmModal';
import AnimatedSelect from '../../components/AnimatedSelect';
import Pagination from '../../components/Pagination';
import { useDeliveryStore } from '../../../../shared/store/deliveryStore';

const DeliveryBoys = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');
  const {
    deliveryBoys,
    fetchDeliveryBoys,
    addDeliveryBoy,
    updateStatus,
    updateApplicationStatus,
    updateDeliveryBoyDetail,
    removeDeliveryBoy,
    pagination
  } = useDeliveryStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [applicationFilter, setApplicationFilter] = useState('all');
  const [editingBoy, setEditingBoy] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Lock root document & body scroll when modal is active
  useEffect(() => {
    if (editingBoy !== null || deleteModal.isOpen) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [editingBoy, deleteModal.isOpen]);

  useEffect(() => {
    const params = {
      search: searchQuery,
      status: statusFilter === 'all' ? undefined : statusFilter,
      applicationStatus: applicationFilter === 'all' ? undefined : applicationFilter,
      page: currentPage,
      limit: itemsPerPage
    };
    fetchDeliveryBoys(params);
  }, [searchQuery, statusFilter, applicationFilter, currentPage, fetchDeliveryBoys]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, applicationFilter]);

  const handleSave = async (boyData) => {
    const currentApplicationStatus =
      (editingBoy && editingBoy.applicationStatus) || boyData.applicationStatus || 'approved';
    const payload = {
      ...boyData,
      isActive: currentApplicationStatus === 'approved' && boyData.status === 'active',
    };
    if (editingBoy && editingBoy.id) {
      const success = await updateDeliveryBoyDetail(editingBoy.id, payload);
      if (success) {
        setEditingBoy(null);
      }
    } else {
      const success = await addDeliveryBoy(payload);
      if (success) {
        setEditingBoy(null);
      }
    }
  };

  const handleDelete = async () => {
    const success = await removeDeliveryBoy(deleteModal.id);
    if (success) {
      setDeleteModal({ isOpen: false, id: null });
    }
  };

  const handleApplicationAction = async (row, nextStatus) => {
    const reason =
      nextStatus === 'rejected'
        ? (window.prompt('Enter rejection reason (required):') || '').trim()
        : '';

    if (nextStatus === 'rejected' && !reason) return;

    const success = await updateApplicationStatus(row.id, nextStatus, reason);
    if (success && editingBoy && String(editingBoy.id) === String(row.id)) {
      setEditingBoy({
        ...editingBoy,
        applicationStatus: nextStatus,
      });
    }
  };

  const renderApplicationBadge = (value) => {
    if (value === 'approved') return <Badge variant="success">approved</Badge>;
    if (value === 'rejected') return <Badge variant="error">rejected</Badge>;
    return <Badge variant="warning">pending</Badge>;
  };

  const columns = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800">{value}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-semibold text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Mobile No',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <FiPhone className="text-gray-500 text-sm" />
          <span className="text-gray-800">{value}</span>
        </div>
      ),
    },
    {
      key: 'address',
      label: 'Address',
      sortable: true,
      render: (value) => (
        <div className="flex items-start gap-2 max-w-xs">
          <FiMapPin className="text-gray-500 text-sm mt-0.5 flex-shrink-0" />
          <span className="text-gray-800 text-sm break-words">{value || 'N/A'}</span>
        </div>
      ),
    },
    {
      key: 'vehicleType',
      label: 'Vehicle',
      sortable: true,
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-800">{value}</p>
          <p className="text-xs text-gray-500">{row.vehicleNumber}</p>
        </div>
      ),
    },
    {
      key: 'totalDeliveries',
      label: 'Deliveries',
      sortable: true,
      render: (value) => <span className="text-gray-800">{value}</span>,
    },
    {
      key: 'rating',
      label: 'Rating',
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800">{Number(value || 0)} star</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => <Badge variant={value === 'active' ? 'success' : 'error'}>{value}</Badge>,
    },
    {
      key: 'applicationStatus',
      label: 'Application',
      sortable: true,
      render: (value) => renderApplicationBadge(value),
    },
    {
      key: 'documents',
      label: 'Documents',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.documentUrls?.drivingLicense && (
            <a
              href={row.documentUrls.drivingLicense}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
            >
              License
            </a>
          )}
          {row.documentUrls?.aadharCard && (
            <a
              href={row.documentUrls.aadharCard}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
            >
              Aadhar
            </a>
          )}
          {!row.documentUrls?.drivingLicense && !row.documentUrls?.aadharCard && (
            <span className="text-xs text-gray-500">N/A</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.applicationStatus === 'pending' && (
            <>
              <button
                onClick={() => handleApplicationAction(row, 'approved')}
                className="px-3 py-1 rounded-lg text-xs font-bold transition-all bg-green-50 text-green-600 hover:bg-green-100"
              >
                Approve
              </button>
              <button
                onClick={() => handleApplicationAction(row, 'rejected')}
                className="px-3 py-1 rounded-lg text-xs font-bold transition-all bg-red-50 text-red-600 hover:bg-red-100"
              >
                Reject
              </button>
            </>
          )}
          <button
            onClick={() => updateStatus(row.id, !row.isActive)}
            disabled={row.applicationStatus !== 'approved'}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${row.isActive
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-green-50 text-green-600 hover:bg-green-100'
              } ${row.applicationStatus !== 'approved' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => setEditingBoy(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Profile & Documents"
          >
            <FiEye className="text-base" />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row.id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Delivery Boys</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage delivery personnel</p>
        </div>
        <button
          onClick={() =>
            setEditingBoy({
              name: '',
              phone: '',
              email: '',
              password: '',
              address: '',
              vehicleType: 'Bike',
              vehicleNumber: '',
              status: 'active',
              totalDeliveries: 0,
              rating: 0,
            })
          }
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiPlus />
          <span>Add Delivery Boy</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email, or address..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            className="min-w-[140px]"
          />

          <AnimatedSelect
            value={applicationFilter}
            onChange={(e) => setApplicationFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Applications' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            className="min-w-[160px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={deliveryBoys}
          columns={columns}
          pagination={false}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={pagination.pages}
          totalItems={pagination.total}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          className="mt-6"
        />
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {editingBoy !== null && (
              <div className="fixed inset-0 z-[999999] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto max-h-screen overscroll-contain">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-3xl shadow-2xl p-6 sm:p-7 max-w-lg w-full max-h-[90vh] overflow-y-auto relative border border-slate-100 space-y-6"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                        <FiUser className="text-xl" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {editingBoy.id ? 'Delivery Partner Profile' : 'Add Delivery Partner'}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {editingBoy.id ? 'View partner details and verify application' : 'Register a new delivery partner manually'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingBoy(null)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                    >
                      <FiX className="text-lg" />
                    </button>
                  </div>

                  {editingBoy.id ? (
                    /* Read-Only Profile View for Existing Drivers */
                    <div className="space-y-5">
                      {/* Application & Verification Status Card */}
                      <div className="rounded-2xl border border-gray-100 bg-slate-50/70 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Application Status
                          </span>
                          <div className="flex items-center gap-2">
                            {renderApplicationBadge(editingBoy.applicationStatus)}
                            {editingBoy.applicationStatus === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApplicationAction(editingBoy, 'approved')}
                                  className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplicationAction(editingBoy, 'rejected')}
                                  className="px-3 py-1 text-xs font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-all"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Uploaded Documents */}
                        <div className="pt-2 border-t border-gray-200/60 flex items-center gap-4">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                            Uploaded Verification Documents:
                          </span>
                          <div className="flex items-center gap-3">
                            {editingBoy.documentUrls?.drivingLicense ? (
                              <a
                                href={editingBoy.documentUrls.drivingLicense}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs text-primary-600 hover:text-primary-700 font-bold shadow-sm transition-all"
                              >
                                <FiFileText className="text-sm" />
                                License
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">License N/A</span>
                            )}
                            {editingBoy.documentUrls?.aadharCard ? (
                              <a
                                href={editingBoy.documentUrls.aadharCard}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs text-primary-600 hover:text-primary-700 font-bold shadow-sm transition-all"
                              >
                                <FiFileText className="text-sm" />
                                Aadhar
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">Aadhar N/A</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Verified Personal Credentials Grid (Read-Only) */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                          Verified Partner Info (Read-Only)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Full Name
                            </span>
                            <span className="text-sm font-bold text-gray-800 block truncate">
                              {editingBoy.name || 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Mobile Number
                            </span>
                            <span className="text-sm font-bold text-gray-800 block truncate">
                              {editingBoy.phone || 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 sm:col-span-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Email Address
                            </span>
                            <span className="text-sm font-bold text-gray-800 block truncate">
                              {editingBoy.email || 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 sm:col-span-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Registered Address
                            </span>
                            <span className="text-sm font-bold text-gray-800 block leading-snug">
                              {editingBoy.address || 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Vehicle Type
                            </span>
                            <span className="text-sm font-bold text-gray-800 block truncate">
                              {editingBoy.vehicleType || 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                              Vehicle Number
                            </span>
                            <span className="text-sm font-mono font-extrabold text-gray-800 block truncate">
                              {editingBoy.vehicleNumber || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Account Management Action */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.target);
                          handleSave({
                            ...editingBoy,
                            status: formData.get('status'),
                          });
                        }}
                        className="space-y-4 pt-2 border-t border-gray-100"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                            Account Active Status
                          </label>
                          <AnimatedSelect
                            name="status"
                            value={editingBoy.status || 'active'}
                            onChange={(e) => setEditingBoy({ ...editingBoy, status: e.target.value })}
                            options={[
                              { value: 'active', label: 'Active (Can receive orders)' },
                              { value: 'inactive', label: 'Inactive (Deactivated)' },
                            ]}
                            required
                          />
                        </div>

                        <div className="flex gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingBoy(null)}
                            className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                          >
                            Close
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
                          >
                            Update Account Status
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    /* Editable Form for Manual New Driver Creation */
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        handleSave({
                          name: formData.get('name'),
                          phone: formData.get('phone'),
                          email: formData.get('email'),
                          password: formData.get('password'),
                          address: formData.get('address'),
                          vehicleType: formData.get('vehicleType'),
                          vehicleNumber: formData.get('vehicleNumber'),
                          status: formData.get('status'),
                          totalDeliveries: parseInt(formData.get('totalDeliveries') || '0'),
                          rating: parseFloat(formData.get('rating') || '0'),
                        });
                      }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          name="name"
                          defaultValue={editingBoy.name || ''}
                          placeholder="Name"
                          required
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Phone Number *
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          defaultValue={editingBoy.phone || ''}
                          placeholder="Phone"
                          required
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          name="email"
                          defaultValue={editingBoy.email || ''}
                          placeholder="Email"
                          required
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Temporary Password *
                        </label>
                        <input
                          type="password"
                          name="password"
                          defaultValue={editingBoy.password || ''}
                          placeholder="Minimum 6 characters"
                          required
                          minLength={6}
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Address *
                        </label>
                        <input
                          type="text"
                          name="address"
                          defaultValue={editingBoy.address || ''}
                          placeholder="Address (City, State)"
                          required
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-semibold"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                            Vehicle Type *
                          </label>
                          <AnimatedSelect
                            name="vehicleType"
                            value={editingBoy.vehicleType || 'Bike'}
                            onChange={(e) => setEditingBoy({ ...editingBoy, vehicleType: e.target.value })}
                            options={[
                              { value: 'Bike', label: 'Bike' },
                              { value: 'Car', label: 'Car' },
                              { value: 'Scooter', label: 'Scooter' },
                            ]}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                            Vehicle Number *
                          </label>
                          <input
                            type="text"
                            name="vehicleNumber"
                            defaultValue={editingBoy.vehicleNumber || ''}
                            placeholder="e.g. DL-01-AB-1234"
                            required
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 font-mono text-sm uppercase font-bold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block mb-1">
                          Status *
                        </label>
                        <AnimatedSelect
                          name="status"
                          value={editingBoy.status || 'active'}
                          onChange={(e) => setEditingBoy({ ...editingBoy, status: e.target.value })}
                          options={[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' },
                          ]}
                          required
                        />
                      </div>

                      <div className="flex gap-3 pt-3">
                        <button
                          type="button"
                          onClick={() => setEditingBoy(null)}
                          className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg transition-all"
                        >
                          Create Partner
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Delivery Boy?"
        message="Are you sure you want to delete this delivery boy? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default DeliveryBoys;
