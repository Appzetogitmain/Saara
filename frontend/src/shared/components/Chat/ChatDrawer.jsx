import { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiUser, FiImage, FiVideo, FiPlus, FiPaperclip } from 'react-icons/fi';
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

        // Simulate file upload/send
        toast.success(`Sending ${isImage ? 'image' : 'video'}...`);
        
        // In a real app, you'd upload the file and send the URL in a message
        const mockMessage = {
            id: Date.now().toString(),
            sender: 'customer',
            message: `[${isImage ? 'Image' : 'Video'} Attachment: ${file.name}]`,
            time: new Date(),
            type: isImage ? 'image' : 'video',
            url: URL.createObjectURL(file)
        };
        
        setMessages(prev => [...prev, mockMessage]);
        e.target.value = ''; // Reset input
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
            setIsSending(true); // Wait, should be false
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
                        className="fixed inset-0 bg-black/50 z-[60]"
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 h-[80vh] bg-white rounded-t-3xl z-[70] flex flex-col shadow-2xl"
                    >
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-primary-50 rounded-t-3xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                                    <FiUser className="text-primary-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{vendorName || 'Vendor'}</h3>
                                    <p className="text-xs text-gray-500">Online</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <FiX className="text-2xl text-gray-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>
                            ) : messages.length > 0 ? (
                                messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${msg.sender === 'customer' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}>
                                            {msg.type === 'image' ? (
                                                <div className="mb-2 rounded-lg overflow-hidden">
                                                    <img src={msg.url} alt="attachment" className="w-full h-auto max-h-60 object-cover" />
                                                </div>
                                            ) : msg.type === 'video' ? (
                                                <div className="mb-2 rounded-lg overflow-hidden">
                                                    <video src={msg.url} controls className="w-full h-auto max-h-60" />
                                                </div>
                                            ) : null}
                                            <p className="text-sm">{msg.message}</p>
                                            <p className={`text-[10px] mt-1 ${msg.sender === 'customer' ? 'text-primary-100' : 'text-gray-400'}`}>
                                                {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                    <p className="text-gray-500">No messages yet. Start a conversation!</p>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 border-t border-gray-100 pb-8">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileChange}
                                accept="image/*,video/*"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-12 h-12 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:text-primary-600 transition-colors"
                                >
                                    <FiPaperclip className="text-xl" />
                                </button>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim() || isSending}
                                    className="w-12 h-12 bg-primary-600 text-white rounded-xl flex items-center justify-center disabled:opacity-50 shadow-lg"
                                >
                                    <FiSend className="text-xl" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ChatDrawer;
