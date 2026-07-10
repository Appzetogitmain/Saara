import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FiSearch, FiEye, FiMessageSquare, FiSend, FiX, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import DataTable from '../../components/DataTable';
import Badge from '../../../../shared/components/Badge';
import AnimatedSelect from '../../components/AnimatedSelect';
import ConfirmModal from '../../components/ConfirmModal';
import { useSupportStore } from '../../../../shared/store/supportStore';
import { getAllTicketTypes } from '../../services/adminService';
import { getSocket, joinRoom, leaveRoom } from '../../../../shared/utils/socket';
import { formatDateTime } from '../../utils/adminHelpers';

const Tickets = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith('/app');
  const { tickets, isLoading, fetchTickets, addReply, pagination } = useSupportStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [categoriesList, setCategoriesList] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Close Confirmation Modal State
  const [confirmCloseModal, setConfirmCloseModal] = useState({ isOpen: false, pendingStatus: null });

  // Fetch categories list on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await getAllTicketTypes();
        setCategoriesList(res?.data || []);
      } catch {}
    };
    loadCategories();
  }, []);

  useEffect(() => {
    fetchTickets({
      search: searchQuery,
      status: statusFilter === 'all' ? undefined : statusFilter,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      dateRange: dateFilter === 'all' ? undefined : dateFilter
    });
  }, [searchQuery, statusFilter, sourceFilter, priorityFilter, categoryFilter, dateFilter, fetchTickets]);

  useEffect(() => {
    const token = localStorage.getItem('admin-token') || localStorage.getItem('token');
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom('admin_room');

    const scrollToBottom = (force = false) => {
      const container = chatContainerRef.current;
      if (!container) return;

      if (force) {
        container.scrollTop = container.scrollHeight;
      } else {
        const threshold = 150; // pixels from bottom
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
        if (isNearBottom) {
          container.scrollTop = container.scrollHeight;
        }
      }
    };

    const handleNewMessage = (msg) => {
      const ticketId = msg.ticketId;
      if (!ticketId) return;

      // Normalize message fields
      const rawDate = msg.createdAt;
      const parsedDate = new Date(rawDate);
      const isValidDate = rawDate && !isNaN(parsedDate.getTime());

      const normalizedMsg = {
        ...msg,
        _id: msg._id || `temp-${Date.now()}-${Math.random()}`,
        createdAt: isValidDate ? rawDate : new Date().toISOString()
      };

      // Update tickets inside the store
      useSupportStore.setState(prev => ({
        tickets: prev.tickets.map(t => {
          const id = t.id || t._id;
          if (String(id) === String(ticketId)) {
            const messages = t.messages || [];
            const exists = messages.some(m => m._id === normalizedMsg._id);
            const merged = exists ? messages : [...messages, normalizedMsg];
            const sorted = [...merged].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            return {
              ...t,
              status: normalizedMsg.status || t.status,
              updatedAt: normalizedMsg.updatedAt || t.updatedAt,
              messages: sorted
            };
          }
          return t;
        })
      }));

      // Also update selectedTicket if it is active
      const activeId = selectedTicket?.id || selectedTicket?._id;
      if (selectedTicket && String(activeId) === String(ticketId)) {
        setSelectedTicket(prev => {
          if (!prev) return prev;
          const messages = prev.messages || [];
          const exists = messages.some(m => m._id === normalizedMsg._id);
          if (exists) return prev;
          const sorted = [...messages, normalizedMsg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          return {
            ...prev,
            status: normalizedMsg.status || prev.status,
            updatedAt: normalizedMsg.updatedAt || prev.updatedAt,
            messages: sorted
          };
        });
      } else {
        // Background notification toast (only if not viewing the ticket)
        toast.success(`New message on Ticket #${String(ticketId).slice(-6).toUpperCase()}: "${normalizedMsg.message}"`);
      }
    };

    socket.on('new_support_message', handleNewMessage);

    return () => {
      socket.off('new_support_message', handleNewMessage);
      leaveRoom('admin_room');
    };
  }, [selectedTicket?.id, selectedTicket?._id]);

  useEffect(() => {
    if (selectedTicket) {
      const messages = selectedTicket.messages || [];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderType === 'admin') {
          scrollToBottom(true);
        } else {
          scrollToBottom(false);
        }
      } else {
        scrollToBottom(true);
      }
    }
  }, [selectedTicket?.messages]);

  useEffect(() => {
    const activeId = selectedTicket?.id || selectedTicket?._id;
    if (activeId) {
      scrollToBottom(true);
    }
  }, [selectedTicket?.id, selectedTicket?._id]);

  useEffect(() => {
    const activeId = selectedTicket?.id || selectedTicket?._id;
    if (!activeId) return;

    joinRoom(`ticket_${activeId}`);

    return () => {
      leaveRoom(`ticket_${activeId}`);
    };
  }, [selectedTicket?.id, selectedTicket?._id]);

  const handleViewTicket = async (ticketRow) => {
    setSelectedTicket(ticketRow);
    const updated = await useSupportStore.getState().fetchTicketById(ticketRow.id);
    if (updated) setSelectedTicket(updated);
  };

  const handleReply = async () => {
    const message = replyMessage.trim();
    if (!message) return;
    const success = await addReply(selectedTicket.id, message);
    if (success) {
      setReplyMessage('');
      const updated = await useSupportStore.getState().fetchTicketById(selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
  };

  const handleUpdateStatus = async (status, priority) => {
    setIsUpdating(true);
    try {
      const payload = {};
      if (status) payload.status = status;
      if (priority) payload.priority = priority;

      const success = await useSupportStore.getState().updateTicketStatus(selectedTicket.id, payload);
      if (success) {
        const updated = await useSupportStore.getState().fetchTicketById(selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusSelectChange = (statusVal) => {
    if (statusVal === 'closed') {
      setConfirmCloseModal({ isOpen: true, pendingStatus: 'closed' });
    } else {
      handleUpdateStatus(statusVal, undefined);
    }
  };

  const handleConfirmCloseTicket = () => {
    handleUpdateStatus('closed', undefined);
    setConfirmCloseModal({ isOpen: false, pendingStatus: null });
  };

  const getStatusColor = (status) => {
    const colors = {
      open: 'success', // maps to bg-success-500 text-white (Green)
      in_progress: 'pending', // maps to bg-yellow-500 text-white (Yellow/Orange)
      resolved: 'info', // maps to bg-primary-500 text-white (Blue)
      closed: 'cancelled', // maps to bg-discount-500 text-white (Gray/Red)
    };
    return colors[status] || 'default';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'bg-blue-50 text-blue-700 border-blue-200',
      medium: 'bg-yellow-50 text-yellow-750 border-yellow-250',
      high: 'bg-red-50 text-red-700 border-red-200',
      urgent: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return colors[priority] || 'bg-gray-50 text-gray-700 border-gray-250';
  };

  const columns = [
    {
      key: 'id',
      label: 'Ticket ID',
      sortable: true,
      render: (value) => <span className="font-semibold text-gray-800 text-xs font-mono">{value}</span>,
    },
    {
      key: 'customer',
      label: 'Requester',
      sortable: false,
      render: (_, row) => (
        <div>
          <p className="font-semibold text-sm text-gray-800">{row.customer?.name || 'Anonymous'}</p>
          <p className="text-xs text-gray-500">{row.customer?.email || 'N/A'}</p>
        </div>
      )
    },
    {
      key: 'raisedBy',
      label: 'Raised By',
      sortable: true,
      render: (value) => {
        if (value === 'customer') {
          return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Customer
          </span>;
        }
        if (value === 'vendor') {
          return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            Vendor
          </span>;
        }
        if (value === 'delivery') {
          return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Delivery Partner
          </span>;
        }
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-200">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Unknown
        </span>;
      }
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (value) => <span className="text-xs font-semibold text-gray-700">{value}</span>
    },
    {
      key: 'subject',
      label: 'Subject',
      sortable: false,
      render: (value) => <p className="text-xs text-gray-850 max-w-xs truncate font-medium">{value}</p>,
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      render: (value) => (
        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getPriorityColor(value)}`}>
          {value}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (value) => <Badge variant={getStatusColor(value)}>{value?.replace('_', ' ') || 'unknown'}</Badge>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (value) => formatDateTime(value),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_, row) => (
        <button
          onClick={() => handleViewTicket(row)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="View Ticket"
        >
          <FiEye />
        </button>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Support Desk</h1>
          <p className="text-sm text-gray-500 mt-1">Review, resolve, and manage incoming support tickets</p>
        </div>
      </div>

      {/* Advanced Filters Block */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-150 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Search box */}
          <div className="relative col-span-1 sm:col-span-2">
            <FiSearch className="absolute left-3.5 top-3.5 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, email, name, subject..."
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Portal Filter */}
          <AnimatedSelect
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Portals' },
              { value: 'customer', label: 'Customers 🟢' },
              { value: 'vendor', label: 'Vendors 🟠' },
              { value: 'delivery', label: 'Delivery 🔵' },
            ]}
          />

          {/* Status Filter */}
          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
            ]}
          />

          {/* Priority Filter */}
          <AnimatedSelect
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Priorities' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />

          {/* Category Filter */}
          <AnimatedSelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Categories' },
              ...categoriesList.map(cat => ({ value: cat.id || cat._id, label: `${cat.icon || '❓'} ${cat.name}` }))
            ]}
          />

          {/* Date Filter */}
          <AnimatedSelect
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Any Time' },
              { value: 'today', label: 'Today' },
              { value: 'last_7_days', label: 'Last 7 Days' },
              { value: 'last_30_days', label: 'Last 30 Days' },
            ]}
          />
        </div>
      </div>

      {/* Tickets List Area */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-150">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : tickets.length > 0 ? (
          <DataTable
            data={tickets}
            columns={columns}
            pagination={true}
            itemsPerPage={pagination.limit}
          />
        ) : (
          <div className="text-center py-16 border border-dashed border-gray-250 rounded-2xl">
            <FiAlertCircle className="mx-auto mb-3 text-4xl text-gray-300" />
            <h3 className="font-bold text-gray-700 text-base">No support tickets match your search.</h3>
            <p className="text-sm text-gray-550 mt-1">Try clearing filters or checking your search parameters.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTicket && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedTicket(null)}
              className="fixed inset-0 bg-black/40 z-[999]"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`fixed inset-0 z-[1000] flex ${isAppRoute ? 'items-start pt-[10px]' : 'items-end'} sm:items-center justify-center p-4 pointer-events-none`}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col border border-gray-100"
              >
                <div className="flex items-center justify-between mb-4 flex-shrink-0 border-b border-gray-100 pb-2.5">
                  <h3 className="text-base font-bold text-gray-800 truncate pr-4">Ticket Details</h3>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                  >
                    <FiX size={20} />
                  </button>
                </div>

                <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-6 pr-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-5 rounded-xl border border-gray-150">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Ticket ID</p>
                      <p className="font-semibold text-gray-800 text-xs font-mono">{selectedTicket.id || selectedTicket._id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Created On</p>
                      <p className="font-semibold text-gray-800 text-xs">{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Raised By</p>
                      <div>
                        {selectedTicket.raisedBy === 'customer' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 uppercase">
                            Customer
                          </span>
                        )}
                        {selectedTicket.raisedBy === 'vendor' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200 uppercase">
                            Vendor
                          </span>
                        )}
                        {selectedTicket.raisedBy === 'delivery' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                            Delivery Boy
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Requester Name</p>
                      <p className="font-semibold text-gray-800 text-xs">{selectedTicket.customer?.name || 'Anonymous'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Email</p>
                      <p className="font-semibold text-gray-800 text-xs truncate" title={selectedTicket.customer?.email}>{selectedTicket.customer?.email || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Phone</p>
                      <p className="font-semibold text-gray-800 text-xs">{selectedTicket.customer?.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 font-bold">Category</p>
                      <p className="font-semibold text-gray-800 text-xs">{selectedTicket.category}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1 font-bold">Priority</p>
                      <select
                        value={selectedTicket.priority}
                        onChange={(e) => handleUpdateStatus(undefined, e.target.value)}
                        disabled={isUpdating}
                        className={`text-[10px] font-bold rounded px-2 py-0.5 border focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer uppercase ${getPriorityColor(selectedTicket.priority)}`}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1 font-bold">Status</p>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleStatusSelectChange(e.target.value)}
                        disabled={isUpdating}
                        className="text-[10px] font-bold bg-white border border-gray-200 rounded px-2 py-0.5 focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer uppercase text-gray-850"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    {/* Closed metadata auditing */}
                    {selectedTicket.status === 'closed' && (
                      <>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5 font-bold">Closed By</p>
                          <p className="font-semibold text-gray-800 text-xs uppercase">{selectedTicket.closedBy || 'Admin'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5 font-bold">Closed On</p>
                          <p className="font-semibold text-gray-800 text-xs">{selectedTicket.closedAt ? new Date(selectedTicket.closedAt).toLocaleString() : new Date(selectedTicket.updatedAt).toLocaleString()}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Message History */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <FiMessageSquare /> Conversation
                    </h4>
                    <div className="space-y-3">
                      {selectedTicket.messages?.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.senderType === 'admin' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.senderType === 'admin'
                              ? 'bg-primary-650 text-white rounded-br-none'
                              : 'bg-gray-100 text-gray-800 rounded-bl-none'
                            }`}>
                            {msg.message}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1">
                            {msg.senderType === 'admin' ? 'Admin' : (selectedTicket.userId ? 'Customer' : (selectedTicket.vendorId ? 'Vendor' : 'Delivery Partner'))} | {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                      {(!selectedTicket.messages || selectedTicket.messages.length === 0) && (
                        <p className="text-center text-gray-455 text-xs py-4 font-semibold">No messages yet</p>
                      )}
                    </div>
                  </div>
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Section */}
                {selectedTicket.status !== 'closed' && (
                  <div className="mt-6 pt-4 border-t border-gray-100 flex-shrink-0">
                    <div className="relative flex gap-2">
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none h-20"
                      />
                      <button
                        onClick={handleReply}
                        disabled={!replyMessage.trim() || isLoading}
                        className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-primary-100"
                        title="Send Message"
                      >
                        <FiSend />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation modal before closing ticket */}
      <ConfirmModal
        isOpen={confirmCloseModal.isOpen}
        onClose={() => setConfirmCloseModal({ isOpen: false, pendingStatus: null })}
        onConfirm={handleConfirmCloseTicket}
        title="Close this ticket?"
        message="The requester will no longer be able to reply to this ticket. Are you sure you want to close it?"
        confirmText="Close Ticket"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default Tickets;
