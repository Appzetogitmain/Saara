import { useState, useEffect, useRef } from 'react';
import { 
    FiX, FiSend, FiUser, FiImage, FiVideo, 
    FiPlus, FiPaperclip, FiPhone, FiChevronLeft,
    FiCamera, FiMic, FiSmile
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserChatMessages, sendUserChatMessage } from '../../../modules/UserApp/services/chatService';
import { getSocket, joinRoom } from '../../utils/socket';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

const ChatDrawer = ({ isOpen, onClose, threadId, vendorName }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const { user } = useAuthStore();
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (isOpen && threadId) {
            fetchMessages();
        }
    }, [isOpen, threadId]);

    useEffect(() => {
        if (!isOpen || !threadId) return;

        const token = localStorage.getItem('token');
        if (!token) return;

        const socket = getSocket(token);
        if (!socket) return;

        joinRoom(`chat_${threadId}`);

        const handleNewMessage = (msg) => {
            setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        };

        socket.on('new_message', handleNewMessage);

        return () => {
            socket.off('new_message', handleNewMessage);
        };
    }, [isOpen, threadId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchMessages = async () => {
        setIsLoading(true);
        try {
            const data = await getUserChatMessages(threadId);
            setMessages(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
            toast.error('Please select an image or video file');
            return;
        }

        toast.success(`Sending ${isImage ? 'image' : 'video'}...`);
        
        const mockMessage = {
            id: Date.now().toString(),
            sender: 'customer',
            message: `[${isImage ? 'Image' : 'Video'} Attachment: ${file.name}]`,
            time: new Date(),
            type: isImage ? 'image' : 'video',
            url: URL.createObjectURL(file)
        };
        
        setMessages(prev => [...prev, mockMessage]);
        e.target.value = ''; 
    };

    const handleSend = async () => {
        const msg = newMessage.trim();
        if (!msg || isSending) return;

        setIsSending(true);
        try {
            const created = await sendUserChatMessage(threadId, msg);
            setMessages((prev) => [...prev, created]);
            setNewMessage('');
        } catch (err) {
            toast.error('Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-[60]"
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-0 bg-white z-[70] flex flex-col shadow-2xl"
                    >
                        {/* Header - Instagram Style */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                    <FiChevronLeft className="text-2xl text-gray-800" />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                                        <FiUser className="text-gray-400 text-lg" />
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="font-bold text-gray-900 leading-tight">{vendorName || 'Vendor'}</h3>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 pr-1">
                                <button className="text-gray-800"><FiPhone size={22} /></button>
                                <button className="text-gray-800"><FiVideo size={24} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                            {/* Profile Intro Section */}
                            <div className="flex flex-col items-center justify-center py-10 text-center border-b border-gray-50 mb-6">
                                <div className="w-20 h-20 bg-[#fff5f0] rounded-full flex items-center justify-center border border-gray-100 mb-3 shadow-sm">
                                    <FiUser className="text-4xl text-gray-300" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">{vendorName || 'Vendor'}</h3>
                                <p className="text-xs text-gray-500 font-medium">9 followers · 0 posts</p>
                                <p className="text-xs text-gray-400 mt-2">You've followed this account since 2026</p>
                                <p className="text-xs text-gray-400">You both follow crmtick</p>
                                <button className="mt-4 px-4 py-1.5 bg-gray-100 rounded-lg text-xs font-bold text-gray-700">
                                    View Profile
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>
                            ) : messages.length > 0 ? (
                                messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] px-4 py-2.5 rounded-[22px] ${msg.sender === 'customer' ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                                            {msg.type === 'image' ? (
                                                <div className="mb-2 rounded-lg overflow-hidden">
                                                    <img src={msg.url} alt="attachment" className="w-full h-auto max-h-60 object-cover" />
                                                </div>
                                            ) : msg.type === 'video' ? (
                                                <div className="mb-2 rounded-lg overflow-hidden">
                                                    <video src={msg.url} controls className="w-full h-auto max-h-60" />
                                                </div>
                                            ) : null}
                                            <p className="text-[15px]">{msg.message}</p>
                                            <p className={`text-[10px] mt-1 ${msg.sender === 'customer' ? 'text-primary-100' : 'text-gray-400'}`}>
                                                {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : null}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Footer - Instagram Style */}
                        <div className="p-3 bg-white border-t border-gray-100 pb-8">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileChange}
                                accept="image/*,video/*"
                            />
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all"
                                >
                                    <FiCamera className="text-xl" />
                                </button>
                                
                                <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-[28px] p-1 px-4">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                        placeholder="Message..."
                                        className="flex-1 bg-transparent border-none outline-none py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400"
                                    />
                                    <div className="flex items-center gap-4 pr-1">
                                        {!newMessage.trim() ? (
                                            <>
                                                <FiMic className="text-gray-600 text-lg cursor-pointer hover:text-gray-900" />
                                                <FiImage className="text-gray-600 text-lg cursor-pointer hover:text-gray-900" />
                                                <FiSmile className="text-gray-600 text-lg cursor-pointer hover:text-gray-900" />
                                                <FiPlus className="text-gray-600 text-lg cursor-pointer hover:text-gray-900" />
                                            </>
                                        ) : (
                                            <button 
                                                onClick={handleSend}
                                                className="text-blue-600 font-bold text-sm px-1"
                                            >
                                                Send
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ChatDrawer;

