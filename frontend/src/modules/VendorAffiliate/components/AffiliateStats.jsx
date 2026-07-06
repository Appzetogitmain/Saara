import React from 'react';
import { FiTrendingUp, FiDollarSign, FiUsers, FiClock } from 'react-icons/fi';
import { formatPrice } from '../../../shared/utils/helpers';

const AffiliateStats = ({ stats }) => {
    const statCards = [
        { 
            label: 'Total Affiliate Orders', 
            value: stats.totalOrders, 
            icon: FiTrendingUp, 
            color: 'text-blue-600',
            bg: 'bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100'
        },
        { 
            label: 'Total Revenue', 
            value: formatPrice(stats.totalRevenue), 
            icon: FiDollarSign, 
            color: 'text-green-600',
            bg: 'bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100'
        },
        { 
            label: 'Active Creators', 
            value: stats.activeCreators, 
            icon: FiUsers, 
            color: 'text-indigo-600',
            bg: 'bg-gradient-to-br from-indigo-50 to-violet-50/30 border-indigo-100'
        },
        { 
            label: 'Pending Payouts', 
            value: formatPrice(stats.pendingCommissions), 
            icon: FiClock, 
            color: 'text-yellow-600',
            bg: 'bg-gradient-to-br from-yellow-50 to-amber-50/30 border-yellow-100'
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {statCards.map((stat, i) => (
                <div 
                    key={i} 
                    className={`${stat.bg} rounded-3xl p-6 shadow-sm border hover:shadow-md transition-all duration-300`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
                        <div className={`p-2 bg-white rounded-xl shadow-sm ${stat.color}`}>
                            <stat.icon className="text-base" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-slate-800 font-mono leading-tight">
                        {stat.value}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default AffiliateStats;
