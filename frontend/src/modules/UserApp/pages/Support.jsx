import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiPlus, FiMessageCircle, FiChevronRight, FiClock, FiCheckCircle, FiAlertCircle, FiSend, FiArrowLeft, FiTag, FiPhone, FiMail } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import * as supportService from '../services/supportService';
import toast from 'react-hot-toast';

const Support = () => {
    const navigate = useNavigate();
    const [tickets, setTickets] = useState([]);
    const [ticketTypes, setTicketTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [replyMessage, setReplyMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    // New Ticket Form State
    const [newTicket, setNewTicket] = useState({
        subject: '',
        ticketTypeId: '',
        message: '',
        priority: 'low'
    });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setIsLoading(true);
        try {
            const [ticketsRes, typesRes] = await Promise.all([
                supportService.getUserTickets(),
                supportService.getTicketTypes()
            ]);
            setTickets(ticketsRes.data.tickets);
            setTicketTypes(typesRes.data);
        } catch (error) {
            toast.error('Failed to load support data');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        if (!newTicket.subject || !newTicket.message || !newTicket.ticketTypeId) {
            toast.error('Please fill all required fields');
            return;
        }

        setIsSending(true);
        try {
            await supportService.createTicket(newTicket);
            toast.success('Ticket created successfully');
            setNewTicket({ subject: '', ticketTypeId: '', message: '', priority: 'low' });
            setIsCreating(false);
            fetchInitialData();
        } catch (error) {
            toast.error(error.message || 'Failed to create ticket');
        } finally {
            setIsSending(false);
        }
    };

    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyMessage.trim()) return;

        setIsSending(true);
        try {
            const res = await supportService.addTicketMessage(selectedTicket._id, replyMessage);
            setSelectedTicket(prev => ({
                ...prev,
                messages: [...prev.messages, res.data]
            }));
            setReplyMessage('');
            // Also update in list
            setTickets(prev => prev.map(t => t._id === selectedTicket._id ? { ...t, updatedAt: new Date() } : t));
        } catch (error) {
            toast.error('Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'open': return 'bg-blue-100 text-blue-700';
            case 'in_progress': return 'bg-orange-100 text-orange-700';
            case 'resolved': return 'bg-green-100 text-green-700';
            case 'closed': return 'bg-gray-100 text-gray-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return 'text-red-600';
            case 'medium': return 'text-orange-600';
            case 'low': return 'text-green-600';
            default: return 'text-gray-600';
        }
    };

    return (
        <PageTransition>
            <MobileLayout showBottomNav={true}>
                <div className="min-h-screen bg-gray-50 pb-20">
                    {/* Header */}
                    <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => selectedTicket ? setSelectedTicket(null) : isCreating ? setIsCreating(false) : navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
                                <FiArrowLeft className="text-xl" />
                            </button>
                            <h1 className="text-xl font-bold text-gray-800">
                                Contact Us
                            </h1>
                        </div>

                    </div>

                    <div className="max-w-3xl mx-auto p-4">
                        {isCreating ? (
                            <div className="space-y-4 pt-4">
                                <div className="flex items-center justify-between mb-6 px-2">
                                    <h2 className="text-lg font-bold text-gray-800">Create New Ticket</h2>
                                    <button 
                                        onClick={() => setIsCreating(false)}
                                        className="text-gray-500 hover:text-gray-800"
                                    >
                                        Cancel
                                    </button>
                                </div>
                                <form onSubmit={handleCreateTicket} className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Subject</label>
                                        <input 
                                            type="text" 
                                            value={newTicket.subject}
                                            onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none"
                                            placeholder="What is the issue?"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                                        <select 
                                            value={newTicket.ticketTypeId}
                                            onChange={(e) => setNewTicket({...newTicket, ticketTypeId: e.target.value})}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="">Select Type</option>
                                            {ticketTypes.map(type => (
                                                <option key={type._id} value={type._id}>{type.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
                                        <textarea 
                                            value={newTicket.message}
                                            onChange={(e) => setNewTicket({...newTicket, message: e.target.value})}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none h-32"
                                            placeholder="Describe your issue in detail..."
                                        />
                                    </div>
                                    <button 
                                        type="submit" 
                                        disabled={isSending}
                                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {isSending ? 'Sending...' : 'Submit Ticket'}
                                    </button>
                                </form>
                            </div>
                        ) : selectedTicket ? (
                            <div className="space-y-4 pt-4">
                                <div className="flex items-center justify-between mb-6 px-2">
                                    <h2 className="text-lg font-bold text-gray-800">{selectedTicket.subject}</h2>
                                    <button 
                                        onClick={() => setSelectedTicket(null)}
                                        className="text-gray-500 hover:text-gray-800"
                                    >
                                        Back to Tickets
                                    </button>
                                </div>
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(selectedTicket.status)}`}>
                                            {selectedTicket.status}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {new Date(selectedTicket.updatedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto p-2">
                                        {selectedTicket.messages?.map((msg, idx) => (
                                            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                                                    msg.sender === 'user' 
                                                    ? 'bg-blue-600 text-white' 
                                                    : 'bg-gray-100 text-gray-900'
                                                }`}>
                                                    <p className="text-sm">{msg.message}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <form onSubmit={handleSendReply} className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={replyMessage}
                                            onChange={(e) => setReplyMessage(e.target.value)}
                                            placeholder="Type a reply..."
                                            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none"
                                        />
                                        <button 
                                            type="submit" 
                                            disabled={isSending}
                                            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            <FiSend />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 pt-4">
                                <div className="flex justify-between items-center mb-6 px-2">
                                    <h2 className="text-lg font-bold text-gray-800">Your Tickets</h2>
                                    <button 
                                        onClick={() => setIsCreating(true)}
                                        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700"
                                    >
                                        <FiPlus /> New Ticket
                                    </button>
                                </div>

                                {/* Tickets List */}
                                <div className="space-y-3">
                                    {tickets.length > 0 ? (
                                        tickets.map(ticket => (
                                            <div 
                                                key={ticket._id}
                                                onClick={() => setSelectedTicket(ticket)}
                                                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-blue-200 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-gray-800 text-sm">{ticket.subject}</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(ticket.status)}`}>
                                                            {ticket.status}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(ticket.updatedAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <FiChevronRight className="text-gray-400" />
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 text-gray-500 text-sm">
                                            No tickets found. Create one if you have an issue.
                                        </div>
                                    )}
                                </div>

                                <h2 className="text-lg font-bold text-gray-800 mt-8 mb-6 px-2">Get in Touch</h2>
                                
                                {/* Mobile Phone */}
                                <a href="tel:+919876543210" className="block">
                                    <motion.div 
                                        whileTap={{ scale: 0.98 }}
                                        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <FiPhone className="text-xl" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-800 text-sm">Mobile Phone</h3>
                                            <p className="text-gray-500 text-sm">+91 98765 43210</p>
                                        </div>
                                        <FiChevronRight className="text-gray-400" />
                                    </motion.div>
                                </a>

                                {/* Gmail */}
                                <a href="mailto:support@saara.com" className="block">
                                    <motion.div 
                                        whileTap={{ scale: 0.98 }}
                                        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                                            <FiMail className="text-xl" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-800 text-sm">Gmail</h3>
                                            <p className="text-gray-500 text-sm">support@saara.com</p>
                                        </div>
                                        <FiChevronRight className="text-gray-400" />
                                    </motion.div>
                                </a>

                                {/* Collaboration Request */}
                                <a href="mailto:collab@saara.com?subject=Collaboration Request" className="block">
                                    <motion.div 
                                        whileTap={{ scale: 0.98 }}
                                        className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                            <FiTag className="text-xl" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-800 text-sm">Collaboration Request</h3>
                                            <p className="text-gray-500 text-sm">Partner with us</p>
                                        </div>
                                        <FiChevronRight className="text-gray-400" />
                                    </motion.div>
                                </a>

                                <div className="mt-12 text-center px-6">
                                    <p className="text-sm text-gray-400">Our team typically responds within 24 hours during business days.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </MobileLayout>
        </PageTransition>
    );
};

export default Support;
