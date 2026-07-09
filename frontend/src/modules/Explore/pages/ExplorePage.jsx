import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiEye } from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import MobileLayout from '../../UserApp/components/Layout/MobileLayout';

const ExplorePage = () => {
    const navigate = useNavigate();
    const fashionVideos = [
        { id: 1, views: '551K', image: 'https://picsum.photos/seed/fashion1/400/600', tall: true },
        { id: 2, views: '1.9M', image: 'https://picsum.photos/seed/fashion2/400/600', tall: true },
        { id: 3, views: '8.2M', image: 'https://picsum.photos/seed/fashion3/400/300', tall: false },
        { id: 4, views: '957K', image: 'https://picsum.photos/seed/fashion4/400/600', tall: true },
        { id: 5, views: '5M', image: 'https://picsum.photos/seed/fashion5/400/600', tall: true },
        { id: 6, views: '2.7M', image: 'https://picsum.photos/seed/fashion6/400/300', tall: false },
        { id: 7, views: '57.8K', image: 'https://picsum.photos/seed/fashion7/400/300', tall: false },
        { id: 8, views: '1.2M', image: 'https://picsum.photos/seed/fashion8/400/300', tall: false },
        { id: 9, views: '898K', image: 'https://picsum.photos/seed/fashion9/400/600', tall: true },
        { id: 10, views: '2.1M', image: 'https://picsum.photos/seed/fashion10/400/600', tall: true },
        { id: 11, views: '4.5M', image: 'https://picsum.photos/seed/fashion11/400/600', tall: true },
        { id: 12, views: '110K', image: 'https://picsum.photos/seed/fashion12/400/300', tall: false },
        { id: 13, views: '3.4M', image: 'https://picsum.photos/seed/fashion13/400/600', tall: true },
        { id: 14, views: '6.7M', image: 'https://picsum.photos/seed/fashion14/400/600', tall: true },
        { id: 15, views: '920K', image: 'https://picsum.photos/seed/fashion15/400/300', tall: false },
    ];

    return (
        <PageTransition>
            <MobileLayout showBottomNav={true} showCartBar={false} showHeader={false}>
                <div className="min-h-[calc(100vh-56px)] bg-black pb-0 font-sans">
                    {/* Light Header with Search */}
                    <div className="sticky top-0 z-40 bg-white px-4 pt-4 pb-2 border-b border-gray-50">
                        <div className="relative group">
                            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="text"
                                placeholder="Search"
                                className="w-full bg-white text-black border border-gray-300 rounded-xl pl-12 pr-4 py-2 text-[15px] focus:outline-none transition-all placeholder:text-gray-400 focus:border-gray-400"
                            />
                        </div>
                    </div>

                    {/* Instagram Style Grid */}
                    <div className="grid grid-cols-3 gap-0.5">
                        {fashionVideos.map((video, index) => (
                            <div 
                                key={video.id} 
                                onClick={() => navigate('/reels', { state: { initialIndex: index } })}
                                className={`relative group cursor-pointer overflow-hidden bg-white/5 ${
                                    index % 10 === 2 || index % 10 === 5 ? 'row-span-2' : ''
                                }`}
                            >
                                <img 
                                    src={video.image} 
                                    alt="fashion" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                />
                                {/* Views Overlay */}
                                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-[11px] font-bold drop-shadow-md">
                                    <FiEye size={12} strokeWidth={3} />
                                    <span>{video.views}</span>
                                </div>
                                {/* Subtle Inner Shadow */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                            </div>
                        ))}
                    </div>
                </div>
            </MobileLayout>
        </PageTransition>
    );
};

export default ExplorePage;
