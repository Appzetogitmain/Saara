import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash2, FiChevronUp, FiChevronDown, FiAlertCircle, FiSearch } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable';
import ConfirmModal from '../../components/ConfirmModal';
import AnimatedSelect from '../../components/AnimatedSelect';
import {
  getAllTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  reorderTicketTypes
} from '../../services/adminService';

const TicketTypes = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');
  const [ticketTypes, setTicketTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, isSystem: false });

  // Form errors state
  const [formErrors, setFormErrors] = useState({});

  const fetchTicketTypes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getAllTicketTypes();
      // Sort by sortOrder
      const sorted = (response?.data || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setTicketTypes(sorted);
    } catch (err) {
      setTicketTypes([]);
      toast.error('Failed to load support categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTicketTypes();
  }, [fetchTicketTypes]);

  const handleSave = async (typeData) => {
    // Client-side validations
    const errors = {};
    const name = String(typeData.name || '').trim();
    const description = String(typeData.description || '').trim();
    const portals = typeData.portals || [];

    if (!name || name.length < 3 || name.length > 50) {
      errors.name = 'Name must be between 3 and 50 characters';
    }

    if (description.length > 200) {
      errors.description = 'Description must not exceed 200 characters';
    }

    if (portals.length === 0) {
      errors.portals = 'At least one portal must be selected';
    }

    // Check duplicate name
    const isDuplicate = ticketTypes.some(
      (type) =>
        type.name.toLowerCase() === name.toLowerCase() &&
        type.id !== editingType?.id &&
        type._id !== editingType?.id
    );
    if (isDuplicate) {
      errors.name = 'A category with this name already exists';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    try {
      if (editingType && editingType.id) {
        await updateTicketType(editingType.id, typeData);
        toast.success('Support category updated successfully');
      } else {
        await createTicketType(typeData);
        toast.success('Support category created successfully');
      }
      await fetchTicketTypes();
      setEditingType(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    }
  };

  const handleDelete = async () => {
    if (deleteModal.isSystem) {
      toast.error('System categories cannot be deleted');
      setDeleteModal({ isOpen: false, id: null, isSystem: false });
      return;
    }
    try {
      await deleteTicketType(deleteModal.id);
      toast.success('Support category deleted successfully');
      await fetchTicketTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category. Try disabling it instead.');
    } finally {
      setDeleteModal({ isOpen: false, id: null, isSystem: false });
    }
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const items = [...ticketTypes];
    const temp = items[index];
    items[index] = items[index - 1];
    items[index - 1] = temp;
    
    // Optimistic UI update
    setTicketTypes(items);
    
    try {
      const orderedIds = items.map(item => item.id || item._id);
      await reorderTicketTypes(orderedIds);
    } catch {
      toast.error('Failed to update category order');
      fetchTicketTypes();
    }
  };

  const handleMoveDown = async (index) => {
    if (index === ticketTypes.length - 1) return;
    const items = [...ticketTypes];
    const temp = items[index];
    items[index] = items[index + 1];
    items[index + 1] = temp;
    
    // Optimistic UI update
    setTicketTypes(items);
    
    try {
      const orderedIds = items.map(item => item.id || item._id);
      await reorderTicketTypes(orderedIds);
    } catch {
      toast.error('Failed to update category order');
      fetchTicketTypes();
    }
  };

  // Filter categories by search (including matching by icon search like 💳)
  const filteredCategories = ticketTypes.filter((type) => {
    const q = searchQuery.toLowerCase();
    return (
      type.name.toLowerCase().includes(q) ||
      (type.description || '').toLowerCase().includes(q) ||
      (type.icon || '').includes(q)
    );
  });

  const columns = [
    {
      key: 'sortOrder',
      label: 'Order',
      sortable: false,
      render: (_, row, index) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleMoveUp(index)}
            disabled={index === 0}
            className="p-1 hover:bg-gray-150 rounded text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move Up"
          >
            <FiChevronUp className="text-lg" />
          </button>
          <button
            onClick={() => handleMoveDown(index)}
            disabled={index === ticketTypes.length - 1}
            className="p-1 hover:bg-gray-150 rounded text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move Down"
          >
            <FiChevronDown className="text-lg" />
          </button>
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Category Name',
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <span className="text-xl" title="Category Icon">{row.icon || '❓'}</span>
          <span>{value}</span>
          {row.isSystem && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-bold border border-purple-200">
              System
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'portals',
      label: 'Visible In',
      sortable: false,
      render: (portals) => {
        const list = Array.isArray(portals) ? portals : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {list.includes('customer') && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 uppercase tracking-wider">Customer</span>
            )}
            {list.includes('vendor') && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-wider">Vendor</span>
            )}
            {list.includes('delivery') && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">Delivery</span>
            )}
            {list.length === 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-400 border border-gray-250 uppercase tracking-wider">None</span>
            )}
          </div>
        );
      }
    },
    {
      key: 'description',
      label: 'Description',
      sortable: false,
      render: (value) => <p className="text-sm text-gray-650 truncate max-w-xs" title={value}>{value || '-'}</p>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wider ${
          value === 'active' 
            ? 'bg-green-50 text-green-750 border-green-200' 
            : 'bg-gray-50 text-gray-700 border-gray-200'
        }`}>
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingType({
                id: row.id || row._id,
                name: row.name,
                description: row.description || '',
                portals: row.portals || [],
                icon: row.icon || '❓',
                status: row.status || 'active',
                isSystem: row.isSystem
              });
              setFormErrors({});
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row.id || row._id, isSystem: row.isSystem })}
            className={`p-2 rounded-lg transition-colors ${
              row.isSystem 
                ? 'text-gray-300 cursor-not-allowed' 
                : 'text-red-650 hover:bg-red-50'
            }`}
            disabled={row.isSystem}
            title={row.isSystem ? 'System category cannot be deleted' : 'Delete'}
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
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:bg-transparent lg:p-0 lg:border-0 lg:shadow-none">
        <div className="lg:hidden">
          <h1 className="text-2xl font-bold text-gray-800">Support Categories</h1>
          <p className="text-sm text-gray-500 mt-1">Manage portal-specific categories and sort orders dynamically</p>
        </div>
        <button
          onClick={() => {
            setEditingType({ name: '', description: '', portals: ['customer'], icon: '❓', status: 'active', isSystem: false });
            setFormErrors({});
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all font-semibold text-sm shadow-md shadow-primary-200 lg:ml-auto"
        >
          <FiPlus className="text-lg" />
          <span>Add Category</span>
        </button>
      </div>

      {/* Main categories table card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-150 space-y-6">
        {/* Search filter row */}
        <div className="relative max-w-sm">
          <FiSearch className="absolute left-3.5 top-3.5 text-gray-400 text-lg" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search category, description, icon..."
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredCategories.length > 0 ? (
          <DataTable
            data={filteredCategories}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        ) : (
          <div className="text-center py-16 border border-dashed border-gray-250 rounded-2xl">
            <FiAlertCircle className="mx-auto mb-3 text-4xl text-gray-300" />
            <h3 className="font-bold text-gray-700 text-base">
              {searchQuery ? 'No support categories match your search.' : 'No Support Categories Found'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {searchQuery ? 'Try clearing or checking your search query.' : 'Create your first support category to get started.'}
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingType !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setEditingType(null)}
              className="fixed inset-0 bg-black/40 z-[999]"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[1000] flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full pointer-events-auto border border-gray-100 flex flex-col max-h-[90vh] overflow-y-auto"
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">
                  {editingType.id ? 'Edit Support Category' : 'Add Support Category'}
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSave(editingType);
                  }}
                  className="space-y-4"
                >
                  {/* Real-time Preview Box */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-150">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Real-time Preview</p>
                    <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm w-fit">
                      <span className="text-2xl">{editingType.icon || '❓'}</span>
                      <span className="font-bold text-gray-800 text-sm">{editingType.name || 'Untitled Category'}</span>
                    </div>
                  </div>

                  {/* Icon Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Category Icon / Emoji</label>
                    <input
                      type="text"
                      value={editingType.icon || ''}
                      onChange={(e) => setEditingType({ ...editingType, icon: e.target.value })}
                      placeholder="e.g. 🛒, 💳, 🚚, FaBug"
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    />
                  </div>

                  {/* Name Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Category Name *</label>
                    <input
                      type="text"
                      value={editingType.name || ''}
                      onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                      placeholder="e.g. Order Issue"
                      required
                      disabled={editingType.isSystem}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    {editingType.isSystem && (
                      <span className="text-[10px] text-purple-650 mt-1 block">System categories cannot be renamed</span>
                    )}
                    {formErrors.name && (
                      <span className="text-xs text-red-500 mt-1 flex items-center gap-1"><FiAlertCircle /> {formErrors.name}</span>
                    )}
                  </div>

                  {/* Description Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
                    <textarea
                      value={editingType.description || ''}
                      onChange={(e) => setEditingType({ ...editingType, description: e.target.value })}
                      placeholder="Brief details about what issues belong to this category..."
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                      <span>Max 200 characters</span>
                      <span>{(editingType.description || '').length} / 200</span>
                    </div>
                    {formErrors.description && (
                      <span className="text-xs text-red-500 mt-1 flex items-center gap-1"><FiAlertCircle /> {formErrors.description}</span>
                    )}
                  </div>

                  {/* Portals Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">Visible In Portals *</label>
                    <div className="flex items-center gap-4 bg-gray-50 p-3.5 rounded-xl border border-gray-150">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingType.portals?.includes('customer')}
                          disabled={editingType.isSystem}
                          onChange={(e) => {
                            const list = [...(editingType.portals || [])];
                            if (e.target.checked) {
                              list.push('customer');
                            } else {
                              const index = list.indexOf('customer');
                              if (index > -1) list.splice(index, 1);
                            }
                            setEditingType({ ...editingType, portals: list });
                          }}
                          className="w-4 h-4 text-primary-650 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span>Customer</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingType.portals?.includes('vendor')}
                          disabled={editingType.isSystem}
                          onChange={(e) => {
                            const list = [...(editingType.portals || [])];
                            if (e.target.checked) {
                              list.push('vendor');
                            } else {
                              const index = list.indexOf('vendor');
                              if (index > -1) list.splice(index, 1);
                            }
                            setEditingType({ ...editingType, portals: list });
                          }}
                          className="w-4 h-4 text-primary-650 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span>Vendor</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingType.portals?.includes('delivery')}
                          disabled={editingType.isSystem}
                          onChange={(e) => {
                            const list = [...(editingType.portals || [])];
                            if (e.target.checked) {
                              list.push('delivery');
                            } else {
                              const index = list.indexOf('delivery');
                              if (index > -1) list.splice(index, 1);
                            }
                            setEditingType({ ...editingType, portals: list });
                          }}
                          className="w-4 h-4 text-primary-650 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span>Delivery</span>
                      </label>
                    </div>
                    {formErrors.portals && (
                      <span className="text-xs text-red-500 mt-1 flex items-center gap-1"><FiAlertCircle /> {formErrors.portals}</span>
                    )}
                  </div>

                  {/* Status Field */}
                  <AnimatedSelect
                    name="status"
                    label="Status"
                    value={editingType.status || 'active'}
                    onChange={(e) => setEditingType({ ...editingType, status: e.target.value })}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                    required
                  />

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-bold text-sm shadow-md"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingType(null)}
                      className="flex-1 px-4 py-2.5 bg-gray-150 text-gray-800 rounded-xl hover:bg-gray-250 transition-colors font-bold text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null, isSystem: false })}
        onConfirm={handleDelete}
        title="Delete Support Category?"
        message="Are you sure you want to delete this support category? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default TicketTypes;
