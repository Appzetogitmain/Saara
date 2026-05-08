import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    ChevronLeft, Phone, Video, Info, Camera, Mic, 
    Image as ImageIcon, Smile, Plus, Play, MoreVertical 
} from 'lucide-react';
import { motion } from 'framer-motion';

const CreatorChat = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [message, setMessage] = useState('');
    const scrollRef = useRef(null);

    const messages = [
        // Empty by default to show the profile intro like in Image 2
    ];

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const username = id || 'dialtick';

    return (
        <div className="flex flex-col h-screen bg-white text-gray-900 font-sans overflow-hidden">
            {/* Header */}
            <header className="z-10 flex items-center justify-between px-3 py-3 bg-white border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft size={28} className="text-gray-800" />
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
                                {username}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6 pr-2">
                    <button className="text-gray-800 hover:opacity-70 transition-opacity">
                        <Phone size={24} />
                    </button>
                    <button className="text-gray-800 hover:opacity-70 transition-opacity">
                        <Video size={28} />
                    </button>
                </div>
            </header>

            {/* Messages & Profile Intro Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 z-10 no-scrollbar"
            >
                {/* Profile Intro Section - As seen in Image 2 */}
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-[#fff5f0] border border-gray-100 mb-4 flex items-center justify-center shadow-sm">
                        <img 
                            src="https://api.dicebear.com/7.x/shapes/svg?seed=dialtick" 
                            alt="large avatar" 
                            className="w-16 h-16 object-contain" 
                        />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">{username}</h2>
                    <p className="text-sm text-gray-500 font-medium">9 followers · 0 posts</p>
                    <p className="text-sm text-gray-500 mt-2">You've followed this Instagram account since 2026</p>
                    <p className="text-sm text-gray-500">You both follow crmtick</p>
                    <button className="mt-4 px-4 py-1.5 bg-gray-100 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors">
                        View Profile
                    </button>
                </div>

                {messages.map((msg, idx) => (
                    <div key={msg.id} className="flex flex-col">
                        <div className={`flex items-end gap-2 ${msg.sender === 'me' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`px-4 py-2.5 rounded-[22px] text-[15px] shadow-sm ${
                                msg.sender === 'me' 
                                ? 'bg-purple-600 text-white rounded-br-md' 
                                : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Input */}
            <footer className="z-10 p-3 bg-white border-t border-gray-100">
                <div className="flex items-center gap-3">
                    <button className="h-11 w-11 min-w-[44px] bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all active:scale-95 shadow-md">
                        <Camera size={24} className="text-white" />
                    </button>
                    
                    <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-[28px] p-1.5 px-4">
                        <input 
                            type="text" 
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Message..."
                            className="flex-1 bg-transparent border-none outline-none text-[15px] py-2 text-gray-900 placeholder:text-gray-400"
                        />

                        <div className="flex items-center gap-4 pr-1">
                            {!message ? (
                                <>
                                    <Mic size={22} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                    <ImageIcon size={22} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                    <Smile size={22} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                    <Plus size={22} className="text-gray-600 hover:text-gray-900 cursor-pointer transition-colors" />
                                </>
                            ) : (
                                <button className="text-blue-600 font-bold text-sm px-2 transition-all">Send</button>
                            )}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default CreatorChat;
