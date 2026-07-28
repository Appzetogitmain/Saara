import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiPlus, FiChevronRight, FiChevronDown, FiSend, FiArrowLeft, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../../../shared/components/PageTransition';
import * as supportService from '../services/supportService';
import { getSocket, joinRoom, leaveRoom } from '../../../shared/utils/socket';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import toast from 'react-hot-toast';

const DeliverySupport = () => {
    const navigate = useNavigate();
    const [tickets, setTickets] = useState([]);
    const [ticketTypes, setTicketTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [replyMessage, setReplyMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const queryTicketId = searchParams.get('id');

    useEffect(() => {
        if (queryTicketId && tickets.length > 0) {
            const found = tickets.find(t => t._id === queryTicketId);
            if (found) {
                if (!selectedTicket || JSON.stringify(selectedTicket.messages) !== JSON.stringify(found.messages) || selectedTicket.status !== found.status) {
                    setSelectedTicket(found);
                }
            }
        } else if (!queryTicketId && selectedTicket) {
            setSelectedTicket(null);
        }
    }, [tickets, queryTicketId]);

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
        if (selectedTicket) {
            const messages = selectedTicket.messages || [];
            if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                if (lastMsg.senderType === 'delivery') {
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
        if (selectedTicket?._id) {
            scrollToBottom(true);
        }
    }, [selectedTicket?._id]);

    // Form State
    const [newTicket, setNewTicket] = useState({
        subject: '',
        ticketTypeId: '',
        message: '',
        priority: 'medium'
    });
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const { deliveryBoy } = useDeliveryAuthStore();

    useEffect(() => {
        const token = localStorage.getItem('delivery-token') || localStorage.getItem('token');
        if (!token || !deliveryBoy?.id) return;
        
        const socket = getSocket(token);
        if (!socket) return;

        joinRoom(`delivery_${deliveryBoy.id}`);

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

            // Update the tickets list in real-time
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

            // If we are currently viewing this ticket
            if (selectedTicket && selectedTicket._id === ticketId) {
                setSelectedTicket(prev => {
                    if (!prev || prev._id !== ticketId) return prev;
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
                const senderName = normalizedMsg.senderType === 'admin' ? 'Admin Support' : 'Support';
                toast.success(`New message on Ticket #${String(ticketId).slice(-6).toUpperCase()} from ${senderName}: "${msg.message}"`);
            }
        };

        const handleNotification = (payload) => {
            if (payload.type === 'support_ticket_update' || payload.type === 'new_support_message') {
                fetchTicketsSilently();
            }
        };

        socket.on('new_notification', handleNotification);
        socket.on('new_support_message', handleNewSupportMessage);
        
        return () => {
            socket.off('new_notification', handleNotification);
            socket.off('new_support_message', handleNewSupportMessage);
            leaveRoom(`delivery_${deliveryBoy.id}`);
        };
    }, [deliveryBoy?.id, selectedTicket?._id]);

    useEffect(() => {
        if (!selectedTicket?._id) return;
        
        joinRoom(`ticket_${selectedTicket._id}`);
        
        return () => {
            leaveRoom(`ticket_${selectedTicket._id}`);
        };
    }, [selectedTicket?._id]);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const [ticketsRes, typesRes] = await Promise.all([
                supportService.getDeliverySupportTickets(),
                supportService.getDeliverySupportTicketTypes()
            ]);
            setTickets(ticketsRes?.tickets || ticketsRes?.data || ticketsRes || []);
            setTicketTypes(typesRes?.data || typesRes || []);
        } catch (error) {
            toast.error('Failed to load support data');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTicketsSilently = async () => {
        try {
            const res = await supportService.getDeliverySupportTickets();
            const updatedTickets = res?.tickets || res?.data || res || [];
            setTickets(updatedTickets);
            if (selectedTicket) {
                const refreshed = updatedTickets.find(t => t._id === selectedTicket._id);
                if (refreshed) {
                    setSelectedTicket(refreshed);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        const trimmedSubject = String(newTicket.subject || '').trim();
        const trimmedMessage = String(newTicket.message || '').trim();

        if (!trimmedSubject || !trimmedMessage || !newTicket.ticketTypeId) {
            toast.error('Please fill all required fields');
            return;
        }

        if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
            toast.error('Subject must be between 3 and 100 characters');
            return;
        }

        if (trimmedMessage.length < 3 || trimmedMessage.length > 1000) {
            toast.error('Message must be between 3 and 1000 characters');
            return;
        }

        setIsSending(true);
        try {
            await supportService.createDeliverySupportTicket({
                subject: trimmedSubject,
                message: trimmedMessage,
                ticketTypeId: newTicket.ticketTypeId,
                priority: newTicket.priority
            });
            toast.success('Ticket created successfully');
            setNewTicket({ subject: '', ticketTypeId: '', message: '', priority: 'medium' });
            setIsCreating(false);
            fetchInitialData();
        } catch (error) {
            toast.error(error.message || 'Failed to create ticket');
        } finally {
            setIsSending(false);
        }
    };

    const handleSendReply = async (e) => {
        e?.preventDefault();
        const trimmedReply = String(replyMessage || '').trim();
        if (!trimmedReply) return;

        setIsSending(true);
        try {
            const res = await supportService.replyToDeliverySupportTicket(selectedTicket._id, trimmedReply);
            setSelectedTicket(res?.data || res);
            setReplyMessage('');
            fetchTicketsSilently();
        } catch (error) {
            toast.error('Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendReply(e);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'open': return 'bg-green-100 text-green-700 border-green-200';
            case 'in_progress': return 'bg-yellow-100 text-yellow-750 border-yellow-200';
            case 'resolved': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'closed': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return 'text-purple-650';
            case 'high': return 'text-red-600';
            case 'medium': return 'text-yellow-700';
            case 'low': return 'text-blue-600';
            default: return 'text-gray-600';
        }
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const renderMessagesWithDates = (messages) => {
        const elements = [];

        if (selectedTicket) {
            elements.push(
                <div key="ticket-metadata-header" className="bg-gray-100/70 border border-gray-200 rounded-xl p-3 mb-4 text-center text-xs text-gray-600 space-y-1 mx-2">
                    <p className="font-semibold">Ticket Created: {new Date(selectedTicket.createdAt).toLocaleString()}</p>
                    <p className="text-[10px] uppercase font-bold text-gray-400">
                        Priority: <span className={`font-extrabold ${getPriorityColor(selectedTicket.priority)}`}>{selectedTicket.priority}</span>
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
                    <div key={`sep-${idx}`} className="flex justify-center my-3">
                        <span className="text-[9px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{separatorText}</span>
                    </div>
                );
                lastDateStr = dateStr;
            }
            
            elements.push(
                <div key={idx} className={`flex ${msg.senderType === 'delivery' ? 'justify-end' : 'justify-start'}`}>
                    <div 
                        onDoubleClick={() => copyToClipboard(msg.message)}
                        title="Double-click to copy"
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm cursor-pointer select-none ${
                            msg.senderType === 'delivery' 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-gray-150 text-gray-900 rounded-tl-none'
                        }`}
                    >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className={`text-[9px] mt-1 text-right ${msg.senderType === 'delivery' ? 'text-blue-200' : 'text-gray-400'}`}>
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
            );
        });
        
        return elements;
    };

    return (
        <PageTransition>
            <div className={`min-h-screen bg-gray-50 ${selectedTicket ? 'pb-0' : 'pb-20'}`}>
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button onClick={() => {
                            if (selectedTicket) {
                                setSearchParams({});
                            } else if (isCreating) {
                                setIsCreating(false);
                            } else {
                                navigate(-1);
                            }
                        }} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
                            <FiArrowLeft className="text-xl text-gray-700" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-lg font-bold text-gray-800 truncate leading-tight">
                                {selectedTicket ? selectedTicket.subject : isCreating ? 'Create New Ticket' : 'Support Desk'}
                            </h1>
                            {selectedTicket && (
                                <p className="text-[10px] text-gray-500 font-semibold truncate leading-none mt-0.5">
                                    Ticket #{selectedTicket._id.slice(-6).toUpperCase()} • <span className={`uppercase font-bold ${selectedTicket.status === 'open' ? 'text-green-600' : selectedTicket.status === 'closed' ? 'text-gray-500' : 'text-blue-600'}`}>{selectedTicket.status.replace('_', ' ')}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className={selectedTicket ? "max-w-3xl mx-auto p-0 sm:p-4" : "max-w-3xl mx-auto p-4"}>
                    {isCreating ? (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between mb-2 px-2">
                                <h2 className="text-lg font-bold text-gray-800">Create New Ticket</h2>
                                <button 
                                    onClick={() => setIsCreating(false)}
                                    className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                            <form onSubmit={handleCreateTicket} className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                {/* Subject */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm font-bold text-gray-700">Subject *</label>
                                        <span className="text-[10px] text-gray-400 font-semibold">{newTicket.subject.length} / 100</span>
                                    </div>
                                    <input 
                                        type="text" 
                                        value={newTicket.subject}
                                        maxLength={100}
                                        onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none transition-all text-sm"
                                        placeholder="What is the issue?"
                                        required
                                    />
                                </div>

                                {/* Category and Priority */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                                    {/* Custom Category Dropdown */}
                                    <div className="relative w-full">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Select Category *</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCategoryDropdownOpen(!categoryDropdownOpen);
                                                setPriorityDropdownOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-left transition-all"
                                        >
                                            <span className="truncate">
                                                {newTicket.ticketTypeId ? (
                                                    (() => {
                                                        const selected = ticketTypes.find(t => t._id === newTicket.ticketTypeId);
                                                        return selected ? `${selected.icon || '❓'} ${selected.name}` : 'Select Category';
                                                    })()
                                                ) : (
                                                    <span className="text-gray-400">Select Category</span>
                                                )}
                                            </span>
                                            <FiChevronDown className={`text-gray-400 text-base flex-shrink-0 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        <AnimatePresence>
                                            {categoryDropdownOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                                                >
                                                    {ticketTypes.map(type => (
                                                        <button
                                                            key={type._id}
                                                            type="button"
                                                            onClick={() => {
                                                                setNewTicket({ ...newTicket, ticketTypeId: type._id });
                                                                setCategoryDropdownOpen(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors ${newTicket.ticketTypeId === type._id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'}`}
                                                        >
                                                            <span className="flex-shrink-0">{type.icon || '❓'}</span>
                                                            <span className="truncate">{type.name}</span>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Custom Priority Dropdown */}
                                    <div className="relative w-full">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Priority (optional)</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPriorityDropdownOpen(!priorityDropdownOpen);
                                                setCategoryDropdownOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm uppercase font-semibold focus:outline-none focus:border-blue-500 text-left transition-all"
                                        >
                                            <span>{newTicket.priority || 'MEDIUM'}</span>
                                            <FiChevronDown className={`text-gray-400 text-base flex-shrink-0 transition-transform ${priorityDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        <AnimatePresence>
                                            {priorityDropdownOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                                                >
                                                    {[
                                                        { value: 'low', label: 'LOW' },
                                                        { value: 'medium', label: 'MEDIUM' },
                                                        { value: 'high', label: 'HIGH' },
                                                        { value: 'urgent', label: 'URGENT' }
                                                    ].map(item => (
                                                        <button
                                                            key={item.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setNewTicket({ ...newTicket, priority: item.value });
                                                                setPriorityDropdownOpen(false);
                                                            }}
                                                            className={`w-full text-left px-4 py-2.5 text-sm font-semibold uppercase hover:bg-blue-50 transition-colors ${newTicket.priority === item.value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'}`}
                                                        >
                                                            {item.label}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Message */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-sm font-bold text-gray-700">Description *</label>
                                        <span className="text-[10px] text-gray-400 font-semibold">{newTicket.message.length} / 1000</span>
                                    </div>
                                    <textarea 
                                        value={newTicket.message}
                                        maxLength={1000}
                                        onChange={(e) => setNewTicket({...newTicket, message: e.target.value})}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none h-32 resize-none text-sm"
                                        placeholder="Describe your issue in detail (e.g. order ID, address issue details)..."
                                        required
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={isSending}
                                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-100"
                                >
                                    {isSending ? 'Submitting...' : 'Submit Ticket'}
                                </button>
                            </form>
                        </div>
                    ) : selectedTicket ? (
                        <div className="sm:space-y-4 sm:pt-4">
                            <div className="bg-white rounded-none sm:rounded-2xl shadow-sm sm:border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-60px)] sm:h-[600px]">
                                {/* Chat Messages */}
                                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-55">
                                    {renderMessagesWithDates(selectedTicket.messages)}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Reply form / Disabled closure banner */}
                                {selectedTicket.status === 'closed' ? (
                                    <div className="border-t border-gray-100 p-6 text-center space-y-3 bg-gray-50/80">
                                        <p className="text-sm font-bold text-gray-500">This ticket has been closed. Replies are disabled.</p>
                                        <p className="text-xs text-gray-400">Need further help?</p>
                                        <button
                                            onClick={() => { setSearchParams({}); setIsCreating(true); }}
                                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-colors"
                                        >
                                            Create New Ticket
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSendReply} className="p-3 border-t border-gray-100 bg-white flex gap-2">
                                        <textarea 
                                            value={replyMessage}
                                            onChange={(e) => {
                                                setReplyMessage(e.target.value);
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
                                            className="flex-1 px-4 py-2.5 bg-gray-55 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm disabled:opacity-50 resize-none min-h-[44px] max-h-[120px] overflow-y-auto"
                                        />
                                        <button 
                                            type="submit" 
                                            disabled={isSending || selectedTicket.status === 'closed' || !replyMessage.trim()}
                                            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-blue-150"
                                        >
                                            <FiSend />
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4">
                            <div className="flex justify-between items-center mb-4 px-2">
                                <h2 className="text-lg font-bold text-gray-800">Support Tickets</h2>
                                <button 
                                    onClick={() => setIsCreating(true)}
                                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
                                >
                                    <FiPlus /> New Ticket
                                </button>
                            </div>

                            {/* Tickets List */}
                            <div className="space-y-3">
                                {isLoading ? (
                                    <div className="text-center py-12 text-gray-500 text-sm">
                                        Loading tickets...
                                    </div>
                                ) : tickets.length > 0 ? (
                                    tickets.map(ticket => (
                                        <div 
                                            key={ticket._id}
                                            onClick={() => setSearchParams({ id: ticket._id })}
                                            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow-md transition-all duration-200"
                                        >
                                            <div className="flex-1 min-w-0 pr-4">
                                                <h3 className="font-bold text-gray-800 text-sm truncate">{ticket.subject}</h3>
                                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">#{ticket._id}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getStatusColor(ticket.status)}`}>
                                                        {ticket.status.replace('_', ' ')}
                                                    </span>
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider bg-gray-50 border-gray-250 ${getPriorityColor(ticket.priority)}`}>
                                                        {ticket.priority}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-semibold">
                                                        Last Reply: {getRelativeTime(ticket.updatedAt)}
                                                    </span>
                                                </div>
                                            </div>
                                            <FiChevronRight className="text-gray-400 flex-shrink-0" />
                                        </div>
                                    ))
                                ) : (
                                    <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
                                        <FiAlertCircle className="mx-auto mb-3 text-4xl text-gray-300" />
                                        <p className="text-gray-750 font-bold">No support tickets found.</p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Create your first ticket if you have any delivery or app issues.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
};

export default DeliverySupport;
