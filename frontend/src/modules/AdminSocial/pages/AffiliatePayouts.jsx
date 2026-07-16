import React from 'react';
import { FiDollarSign, FiPieChart, FiTrendingUp } from 'react-icons/fi';
import { useAdminSocial } from '../hooks/useAdminSocial';
import PayoutTable from '../components/PayoutTable';
import { formatPrice } from '../../../shared/utils/helpers';

const AffiliatePayouts = () => {
    const { payouts, updatePayoutStatus } = useAdminSocial();
    const pendingPayouts = payouts.filter(p => p.status === 'pending');
    const totalPendingAmount = pendingPayouts.reduce((acc, curr) => acc + curr.amount, 0);

    return (
        <div className="space-y-8 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="lg:hidden">
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3 uppercase">
                        <FiDollarSign className="text-primary-600" />
                        Affiliate Payouts
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">Financial oversight and commission approvals for marketplace creators.</p>
                </div>

                <div className="flex items-center gap-4 lg:ml-auto">
                    <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 pr-12">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                            <FiPieChart size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending Volume</p>
                            <p className="text-2xl font-black text-gray-900 leading-none mt-1">{formatPrice(totalPendingAmount)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <section className="space-y-6">
                <PayoutTable 
                    payouts={pendingPayouts} 
                    onUpdateStatus={updatePayoutStatus} 
                />
            </section>

            {/* History Summary section */}
            <section className="bg-gray-50/50 rounded-3xl p-8 border border-dashed border-gray-200">
                <div className="flex flex-col items-center text-center max-w-md mx-auto py-8">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md mb-6">
                        <FiTrendingUp className="text-primary-500 text-2xl" />
                    </div>
                    <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Financial Accuracy</h3>
                    <p className="text-gray-400 font-medium text-sm mt-2">
                        All approvals are logged in the audit trail. Please ensure creator identities match the requesting wallet.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default AffiliatePayouts;
