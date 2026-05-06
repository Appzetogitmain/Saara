import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMessageCircle, FiChevronRight, FiUser, FiArrowLeft, FiClock, FiEdit, FiPlus, FiImage, FiVideo } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import { getUserChatThreads } from '../services/chatService';
import ChatDrawer from '../../../shared/components/Chat/ChatDrawer';
import { useAuthStore } from '../../../shared/store/authStore';

const UserChats = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();
    const [threads, setThreads] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedThread, setSelectedThread] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        fetchThreads();
    }, [isAuthenticated]);

    const fetchThreads = async () => {
        setIsLoading(true);
        try {
            const data = await getUserChatThreads();
            setThreads(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch threads:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectThread = (thread) => {
        setSelectedThread({
            id: thread._id,
            name: thread.vendorId?.storeName || 'Vendor'
        });
    };

    return (
        <PageTransition>
            <MobileLayout showBottomNav={true} showCartBar={false}>
                <div className="min-h-screen bg-gray-50 pb-24">
                    {/* Header */}
                    <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <FiArrowLeft className="text-xl text-gray-700" />
                            </button>
                            <h1 className="text-xl font-bold text-gray-800">My Chats</h1>
                            <button className="ml-auto p-2 bg-primary-50 text-primary-600 rounded-full hover:bg-primary-100 transition-all">
                                <FiPlus className="text-xl" />
                            </button>
                        </div>
                    </div>

                    <div className="p-4">
                        {isLoading ? (
                            <div className="flex flex-col gap-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : threads.length > 0 ? (
                            <div className="space-y-3">
                                {threads.map((thread) => (
                                    <motion.div
                                        key={thread._id}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleSelectThread(thread)}
                                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center flex-shrink-0">
                                                {thread.vendorId?.logo ? (
                                                    <img src={thread.vendorId.logo} className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    <FiUser className="text-primary-600 text-xl" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="font-bold text-gray-800 truncate">
                                                        {thread.vendorId?.storeName || 'Vendor'}
                                                    </h3>
                                                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">
                                                        {new Date(thread.lastActivity).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-500 truncate italic">
                                                    {thread.lastMessage || 'No messages yet'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            {thread.unreadCount > 0 && (
                                                <div className="w-5 h-5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                                    {thread.unreadCount}
                                                </div>
                                            )}
                                            <FiChevronRight className="text-gray-300 group-hover:text-primary-500 transition-colors" />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <FiMessageCircle className="text-4xl text-gray-300" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-800 mb-1">No Conversations</h3>
                                <p className="text-gray-500 text-sm max-w-[200px] mb-8">
                                    Your chats with sellers will appear here.
                                </p>

                                <div className="grid grid-cols-2 gap-4 w-full max-w-[300px]">
                                    <button className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <FiImage className="text-2xl" />
                                        </div>
                                        <span className="text-xs font-bold text-gray-700">Send Photo</span>
                                    </button>
                                    <button className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                                        <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <FiVideo className="text-2xl" />
                                        </div>
                                        <span className="text-xs font-bold text-gray-700">Send Video</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <ChatDrawer 
                    isOpen={!!selectedThread} 
                    onClose={() => setSelectedThread(null)}
                    threadId={selectedThread?.id}
                    vendorName={selectedThread?.name}
                />
            </MobileLayout>
        </PageTransition>
    );
};

export default UserChats;
