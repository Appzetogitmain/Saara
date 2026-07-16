import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiEye,
  FiX,
  FiSend,
  FiArrowLeft,
  FiAlertCircle,
  FiChevronRight,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DataTable from "../../Admin/components/DataTable";
import Badge from "../../../shared/components/Badge";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import {
  getVendorSupportTickets,
  getVendorSupportTicketTypes,
  createVendorSupportTicket,
  replyToVendorSupportTicket,
} from "../services/vendorService";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import { useVendorAuthStore } from "../store/vendorAuthStore";

const SupportTickets = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getVendorSupportTickets();
      setTickets(response?.data || []);
    } catch (err) {
      setTickets([]);
      toast.error("Failed to load tickets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTicketTypes = useCallback(async () => {
    try {
      const res = await getVendorSupportTicketTypes();
      setTicketTypes(res?.data || []);
    } catch (err) {
      setTicketTypes([]);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchTicketTypes();
  }, [fetchTickets, fetchTicketTypes]);

  const { vendor } = useVendorAuthStore();

  useEffect(() => {
    const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
    if (!token || !vendor?.id) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`vendor_${vendor.id}`);

    const handleNewSupportMessage = (msg) => {
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

      // Update tickets list and current ticket messages in real-time
      setTickets(prev => prev.map(t => {
        if (t._id === ticketId) {
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
      }));

      // Background notification toast (only if not viewing the ticket)
      if (String(id) !== String(ticketId)) {
        const senderName = normalizedMsg.senderType === 'admin' ? 'Admin Support' : 'Support';
        toast.success(`New message on Ticket #${String(ticketId).slice(-6).toUpperCase()} from ${senderName}: "${normalizedMsg.message}"`);
      }
    };

    socket.on('new_support_message', handleNewSupportMessage);

    return () => {
      socket.off('new_support_message', handleNewSupportMessage);
      leaveRoom(`vendor_${vendor.id}`);
    };
  }, [vendor?.id, id]);

  const handleSave = async (ticketData) => {
    const trimmedSubject = String(ticketData.subject || '').trim();
    const trimmedDesc = String(ticketData.description || '').trim();

    if (!trimmedSubject || !trimmedDesc || !ticketData.ticketTypeId) {
        toast.error("Please fill all required fields.");
        return;
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
        toast.error("Subject must be between 3 and 100 characters.");
        return;
    }

    if (trimmedDesc.length < 3 || trimmedDesc.length > 1000) {
        toast.error("Description must be between 3 and 1000 characters.");
        return;
    }

    try {
        await createVendorSupportTicket({
            subject: trimmedSubject,
            message: trimmedDesc,
            priority: ticketData.priority || "medium",
            ticketTypeId: ticketData.ticketTypeId
        });
        setShowForm(false);
        toast.success("Ticket created successfully");
        fetchTickets();
    } catch (err) {
        toast.error(err.response?.data?.message || "Failed to create ticket");
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      open: "success", // maps to Green
      in_progress: "pending", // maps to Yellow/Orange
      resolved: "info", // maps to Blue
      closed: "cancelled", // maps to Gray/Red
    };
    return statusMap[status] || "default";
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: "bg-blue-50 text-blue-700 border border-blue-200",
      medium: "bg-yellow-50 text-yellow-750 border border-yellow-250",
      high: "bg-red-50 text-red-700 border border-red-200",
      urgent: "bg-purple-50 text-purple-700 border border-purple-200",
    };
    return colors[priority] || "bg-gray-50 text-gray-700 border border-gray-250";
  };

  const getRelativeTime = (dateStr) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
  };

  // Filter tickets client-side
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket._id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "_id",
      label: "Ticket ID",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-gray-800 text-xs font-mono">
          #{value}
        </span>
      ),
    },
    {
      key: "ticketTypeId",
      label: "Category",
      sortable: true,
      render: (val) => (
        <span className="text-xs font-semibold text-gray-750">
          {val ? `${val.icon || '❓'} ${val.name}` : '❓ Other'}
        </span>
      )
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      render: (value) => <span className="font-medium text-xs text-gray-800">{value}</span>
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(
            value
          )}`}>
          {value}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge variant={getStatusVariant(value)}>{value.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: "updatedAt",
      label: "Last Updated",
      sortable: true,
      render: (value) => (
        <span className="text-xs text-gray-500 font-semibold">
          {getRelativeTime(value)}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <button
          onClick={() => navigate(`/vendor/support-tickets/${row._id}`)}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="View Ticket"
        >
          <FiEye />
        </button>
      ),
    },
  ];

  if (id) {
    const ticket = tickets.find(t => t._id === id);
    if (ticket) {
        return (
            <TicketDetail
              ticket={ticket}
              navigate={navigate}
              getStatusVariant={getStatusVariant}
              getPriorityColor={getPriorityColor}
              onReply={fetchTickets}
            />
        );
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:bg-transparent lg:p-0 lg:border-0 lg:shadow-none">
        <div className="lg:hidden">
          <h1 className="text-2xl font-bold text-gray-800 mb-1 flex items-center gap-2">
            <FiMessageSquare className="text-primary-600" />
            Support Desk
          </h1>
          <p className="text-sm text-gray-500">
            Create and manage support tickets with platform admin
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-bold text-sm shadow-md shadow-primary-100 lg:ml-auto">
          <FiPlus className="text-lg" />
          <span>Create Ticket</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="relative flex-1 w-full sm:min-w-[200px]">
            <FiSearch className="absolute left-3.5 top-3.5 text-gray-400 text-lg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets by ID, subject..."
              className="w-full pl-11 pr-4 py-2.5 bg-gray-55 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All Status" },
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In Progress" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ]}
            className="w-full sm:w-auto min-w-[140px]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-150">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredTickets.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <DataTable
                data={filteredTickets}
                columns={columns}
                pagination={true}
                itemsPerPage={10}
              />
            </div>
            
            {/* Mobile List View */}
            <div className="block md:hidden space-y-4">
              {filteredTickets.map(ticket => (
                <div 
                  key={ticket._id}
                  onClick={() => navigate(`/vendor/support-tickets/${ticket._id}`)}
                  className="bg-white p-4 rounded-xl border border-gray-150 flex items-center justify-between cursor-pointer hover:border-primary-100 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-gray-800 truncate">{ticket.subject}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono">#{ticket._id.slice(-6).toUpperCase()}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                        ticket.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' :
                        ticket.status === 'closed' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                        ticket.priority === 'high' || ticket.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' :
                        ticket.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className="text-[10px] text-gray-500 font-semibold">{getRelativeTime(ticket.updatedAt)}</span>
                    </div>
                  </div>
                  <FiChevronRight className="text-gray-400 text-lg flex-shrink-0" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16 border border-dashed border-gray-250 rounded-2xl">
            <FiAlertCircle className="mx-auto mb-3 text-4xl text-gray-300" />
            <h3 className="font-bold text-gray-700 text-base">No support tickets found.</h3>
            <p className="text-sm text-gray-500 mt-1">Create your first ticket if you have any store issues.</p>
          </div>
        )}
      </div>

      {showForm && (
        <TicketForm 
          onSave={handleSave} 
          onClose={() => setShowForm(false)} 
          ticketTypes={ticketTypes}
        />
      )}
    </motion.div>
  );
};

const TicketDetail = ({
  ticket,
  navigate,
  getStatusVariant,
  getPriorityColor,
  onReply
}) => {
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    joinRoom(`ticket_${ticket._id}`);
    return () => {
      leaveRoom(`ticket_${ticket._id}`);
    };
  }, [ticket._id]);

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

  useEffect(() => {
    if (ticket) {
      const messages = ticket.messages || [];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderType === 'vendor') {
          scrollToBottom(true);
        } else {
          scrollToBottom(false);
        }
      } else {
        scrollToBottom(true);
      }
    }
  }, [ticket.messages]);

  useEffect(() => {
    if (ticket?._id) {
      scrollToBottom(true);
    }
  }, [ticket?._id]);

  const handleSendReply = async (e) => {
    e?.preventDefault();
    const trimmedReply = String(reply || '').trim();
    if (!trimmedReply) return;

    setIsSending(true);
    try {
        await replyToVendorSupportTicket(ticket._id, trimmedReply);
        setReply("");
        toast.success("Reply sent");
        onReply();
    } catch (err) {
        toast.error("Failed to send reply");
    } finally {
        setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const renderMessagesWithDates = (messages) => {
    const elements = [];

    if (ticket) {
      elements.push(
        <div key="ticket-metadata-mobile" className="block lg:hidden bg-gray-100/70 border border-gray-200 rounded-xl p-3 mb-4 text-center text-xs text-gray-600 space-y-1 mx-2">
            <p className="font-semibold">Ticket Created: {new Date(ticket.createdAt).toLocaleString()}</p>
            <p className="text-[10px] uppercase font-bold text-gray-400">
                Status: <span className="text-gray-800 mr-3">{ticket.status.replace('_', ' ')}</span>
                Priority: <span className={`font-extrabold ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span>
            </p>
        </div>
      );
    }

    if (!messages || messages.length === 0) return elements.length > 0 ? elements : null;
    let lastDateStr = null;
    
    messages.forEach((msg, idx) => {
        const date = new Date(msg.createdAt);
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        
        const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        
        let separatorText = dateStr;
        if (dateStr === todayStr) separatorText = 'Today';
        else if (dateStr === yesterdayStr) separatorText = 'Yesterday';
        
        if (dateStr !== lastDateStr) {
            elements.push(
                <div key={`sep-${idx}`} className="flex justify-center my-3 animate-fadeIn">
                    <span className="text-[9px] bg-gray-250 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{separatorText}</span>
                </div>
            );
            lastDateStr = dateStr;
        }
        
        elements.push(
            <div key={idx} className={`flex ${msg.senderType === 'vendor' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                <div 
                    onDoubleClick={() => copyToClipboard(msg.message)}
                    title="Double-click to copy"
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm cursor-pointer select-none ${
                        msg.senderType === 'vendor' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-gray-150 text-gray-850 rounded-tl-none'
                    }`}
                >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    <p className={`text-[9px] mt-1 text-right ${msg.senderType === 'vendor' ? 'text-blue-200' : 'text-gray-400'}`}>
                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>
        );
    });
    
    return elements;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex items-center gap-3 mb-4 px-3 lg:px-0 pt-2 lg:pt-0">
        <button
          onClick={() => navigate("/vendor/support-tickets")}
          className="p-2 hover:bg-gray-150 rounded-xl transition-colors">
          <FiArrowLeft className="text-xl text-gray-650" />
        </button>
        <div className="lg:hidden">
          <h1 className="text-xl font-bold text-gray-800">
            Ticket Details
          </h1>
          <p className="text-xs text-gray-500 font-semibold font-mono mt-1">
            #{ticket._id}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              {/* Messages Area */}
              <div className="bg-white rounded-none sm:rounded-2xl shadow-sm border-x-0 sm:border-x border-y-0 sm:border-y border-gray-150 overflow-hidden flex flex-col h-[calc(100vh-170px)] sm:h-[600px]">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                      <h2 className="font-bold text-gray-850 text-sm truncate">{ticket.subject}</h2>
                  </div>
                  
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-55">
                      {renderMessagesWithDates(ticket.messages)}
                      <div ref={messagesEndRef} />
                  </div>

                  {ticket.status === 'closed' ? (
                      <div className="border-t border-gray-100 p-6 text-center space-y-3 bg-gray-50/80">
                          <p className="text-sm font-bold text-gray-500">This ticket has been closed. Replies are disabled.</p>
                          <p className="text-xs text-gray-400">Need further help?</p>
                          <button
                              onClick={() => navigate("/vendor/support-tickets")}
                              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-colors"
                          >
                              Create New Ticket
                          </button>
                      </div>
                  ) : (
                      <form onSubmit={handleSendReply} className="p-3 border-t border-gray-100 bg-white">
                          <div className="flex gap-2">
                              <textarea 
                                value={reply}
                                onChange={(e) => {
                                    setReply(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.target.style.height = 'auto';
                                    }
                                    handleKeyDown(e);
                                }}
                                placeholder="Type a reply..."
                                rows="1"
                                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none min-h-[44px] max-h-[120px] overflow-y-auto"
                              />
                              <button 
                                type="submit"
                                disabled={isSending || !reply.trim()}
                                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-blue-150"
                              >
                                  <FiSend />
                              </button>
                          </div>
                      </form>
                  )}
              </div>
          </div>

          <div className="hidden lg:block space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-150">
                  <h3 className="font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100 text-sm">Ticket Info</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
                          <div className="mt-1">
                            <Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge>
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Priority</label>
                          <div className={`mt-1 inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority}
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created At</label>
                          <p className="text-xs text-gray-650 mt-1 font-semibold">{new Date(ticket.createdAt).toLocaleString()}</p>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </motion.div>
  );
};

const TicketForm = ({ onSave, onClose, ticketTypes = [] }) => {
  const [formData, setFormData] = useState({
    subject: "",
    ticketTypeId: ticketTypes[0]?._id || "",
    priority: "medium",
    description: "",
  });

  useEffect(() => {
    if (ticketTypes.length > 0 && !formData.ticketTypeId) {
      setFormData(prev => ({ ...prev, ticketTypeId: ticketTypes[0]._id }));
    }
  }, [ticketTypes]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 shadow-2xl flex flex-col"
      >
        <h3 className="text-lg font-bold mb-4 border-b border-gray-100 pb-2 text-gray-800">Create Support Ticket</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700">Subject *</label>
                <span className="text-[10px] text-gray-400 font-semibold">{formData.subject.length} / 100</span>
            </div>
            <input
              type="text"
              value={formData.subject}
              maxLength={100}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              placeholder="e.g. Settlement issue for June orders"
              required
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Select Category *</label>
              <select
                value={formData.ticketTypeId}
                onChange={(e) =>
                  setFormData({ ...formData, ticketTypeId: e.target.value })
                }
                required
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white">
                <option value="">Select Category</option>
                {ticketTypes.map(type => (
                  <option key={type._id} value={type._id}>{type.icon || '❓'} {type.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Priority (optional)
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value })
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white uppercase font-semibold">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700">Description *</label>
                <span className="text-[10px] text-gray-400 font-semibold">{formData.description.length} / 1000</span>
            </div>
            <textarea
              value={formData.description}
              maxLength={1000}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe your issue in detail..."
              required
              rows="5"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 text-gray-750 rounded-xl font-bold hover:bg-gray-200 transition-colors text-sm">
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors text-sm shadow-md shadow-primary-200">
              Create Ticket
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default SupportTickets;
