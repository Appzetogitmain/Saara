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
                        <div className="space-y-4 pt-4">
                            <h2 className="text-lg font-bold text-gray-800 mb-6 px-2">Get in Touch</h2>
                            
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
                    </div>v>
                </div>
            </MobileLayout>
        </PageTransition>
    );
};

export default Support;
