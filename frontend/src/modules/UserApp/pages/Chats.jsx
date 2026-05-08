import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FiArrowLeft, FiPlus, FiPhone, FiVideo, 
    FiCamera, FiMic, FiImage, FiSmile 
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import { getUserChatThreads } from '../services/chatService';
import { useAuthStore } from '../../../shared/store/authStore';
import { toast } from 'react-hot-toast';

const UserChats = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();
    const [threads, setThreads] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const scrollRef = useRef(null);
    const handleFeatureSoon = () => toast('Feature coming soon');

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

    const handleSend = () => {
        if (!newMessage.trim()) return;
        setMessages([...messages, { id: Date.now(), text: newMessage, sender: 'me' }]);
        setNewMessage('');
    };

    return (
        <PageTransition>
            <div className="flex flex-col h-screen bg-white text-gray-900 font-sans overflow-hidden">
                    {/* Header - Instagram Style */}
                    <header className="z-10 flex items-center justify-between px-3 py-3 bg-white border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                <FiArrowLeft size={28} className="text-gray-800" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                                    <img 
                                        src="https://api.dicebear.com/7.x/shapes/svg?seed=dialtick" 
                                        alt="avatar" 
                                        className="h-full w-full object-cover p-1.5" 
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-[16px] leading-tight tracking-tight">
                                        dialtick
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-6 pr-2">
                            <button onClick={handleFeatureSoon} className="text-gray-800 hover:opacity-70 transition-opacity">
                                <FiPhone size={22} />
                            </button>
                            <button onClick={handleFeatureSoon} className="text-gray-800 hover:opacity-70 transition-opacity">
                                <FiVideo size={24} />
                            </button>
                        </div>
                    </header>

                    {/* Chat Content */}
                    <div 
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-4 space-y-6 z-10 no-scrollbar pb-24"
                    >
                        {threads.length === 0 && messages.length === 0 ? (
                            /* Profile Intro Section - Matching Image 2 */
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#fff5f0] border border-gray-100 mb-4 flex items-center justify-center shadow-sm">
                                    <img 
                                        src="https://api.dicebear.com/7.x/shapes/svg?seed=dialtick" 
                                        alt="large avatar" 
                                        className="w-16 h-16 object-contain" 
                                    />
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-1">dialtick</h2>
                                <p className="text-sm text-gray-500 font-medium">9 followers · 0 posts</p>
                                <p className="text-sm text-gray-500 mt-2">You've followed this Instagram account since 2026</p>
                                <p className="text-sm text-gray-500">You both follow crmtick</p>
                                <button className="mt-4 px-4 py-1.5 bg-gray-100 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors">
                                    View Profile
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] px-4 py-2.5 rounded-[22px] ${
                                            msg.sender === 'me' 
                                            ? 'bg-primary-600 text-white rounded-br-md' 
                                            : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
                                        }`}>
                                            <p className="text-[15px]">{msg.text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer Input - Instagram Style */}
                    <footer className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-100 z-20">
                        <div className="flex items-center gap-3">
                            <button onClick={handleFeatureSoon} className="h-11 w-11 min-w-[44px] bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all active:scale-95 shadow-md">
                                <FiCamera size={24} className="text-white" />
                            </button>
                            
                            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-[28px] p-1.5 px-4">
                                <input 
                                    type="text" 
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Message..."
                                    className="flex-1 bg-transparent border-none outline-none text-[15px] py-2 text-gray-900 placeholder:text-gray-400"
                                />

                                <div className="flex items-center gap-2 pr-1">
                                    {!newMessage.trim() ? (
                                        <>
                                            <FiMic onClick={handleFeatureSoon} size={20} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                            <FiImage onClick={handleFeatureSoon} size={20} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                            <FiSmile onClick={handleFeatureSoon} size={20} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                            <FiPlus onClick={handleFeatureSoon} size={20} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                        </>
                                    ) : (
                                        <button 
                                            onClick={handleSend}
                                            className="text-blue-600 font-bold text-sm px-2 transition-all"
                                        >
                                            Send
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </footer>
                </div>
        </PageTransition>
    );
};

export default UserChats;
