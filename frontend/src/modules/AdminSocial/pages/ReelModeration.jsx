import React from 'react';
import { FiMonitor, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { useAdminSocial } from '../hooks/useAdminSocial';
import ReelTable from '../components/ReelTable';
import ReportedReelCard from '../components/ReportedReelCard';

const ReelModeration = () => {
    const { reels, reportedReels, updateReelStatus } = useAdminSocial();

    return (
        <div className="space-y-8 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 lg:hidden">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3 uppercase">
                        <FiMonitor className="text-primary-600" />
                        Reel Moderation
                    </h1>
                    <p className="text-gray-500 font-medium">Monitor and manage community video content for safety and compliance.</p>
                </div>
            </div>

            {/* High Priority Flagged Reels */}
            {reportedReels.length > 0 && (
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-red-500 p-2 rounded-xl text-white shadow-lg">
                            <FiAlertTriangle />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Needs Immediate Attention</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {reportedReels.slice(0, 4).map(reel => (
                            <ReportedReelCard key={reel.reelId} reel={reel} onUpdateStatus={updateReelStatus} />
                        ))}
                    </div>
                </section>
            )}

            {/* General Content Management */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-500 p-2 rounded-xl text-white shadow-lg">
                            <FiCheckCircle />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">All Community Content</h2>
                    </div>
                    <div className="flex gap-2">
                        <span className="px-4 py-1.5 bg-white border border-gray-100 rounded-full text-[10px] font-black uppercase text-gray-400">Total: {reels.length}</span>
                    </div>
                </div>
                <ReelTable reels={reels} onUpdateStatus={updateReelStatus} />
            </section>
        </div>
    );
};

export default ReelModeration;
