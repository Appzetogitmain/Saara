import React from 'react';
import { FiUsers, FiAward, FiSettings, FiCheckCircle, FiMinusCircle } from 'react-icons/fi';
import { useVendorAffiliate } from '../hooks/useVendorAffiliate';
import AffiliateStats from '../components/AffiliateStats';
import { formatPrice } from '../../../shared/utils/helpers';

const AffiliateDashboard = () => {
    const { products, stats, toggleAffiliate, updateCommission } = useVendorAffiliate();

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 lg:hidden">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                            <FiAward className="text-primary-600" />
                            AFFILIATE PROGRAM
                        </h1>
                        <p className="text-gray-500 font-medium">Manage how creators promote your products and track performance.</p>
                    </div>
                </div>

                {/* OverView Stats */}
                <AffiliateStats stats={stats} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Top Creators */}
                    <div className="lg:col-span-1 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                            <h2 className="font-black text-gray-800 flex items-center gap-2 uppercase tracking-wide">
                                <FiUsers className="text-primary-500" />
                                Top Creators
                            </h2>
                            <span className="text-xs font-bold text-primary-600">This Month</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {products[0].topCreators.map((creator, i) => (
                                <div key={i} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-black">
                                            {creator.name[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 leading-tight">{creator.name}</p>
                                            <p className="text-xs text-gray-400 font-medium">{creator.sales} sales generated</p>
                                        </div>
                                    </div>
                                    <p className="font-black text-green-600">{formatPrice(creator.earnings)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Product-wise Settings */}
                    <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex items-center gap-2">
                            <FiSettings className="text-gray-400" />
                            <h2 className="font-black text-gray-800 uppercase tracking-wide">Product Controls</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Affiliate</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Commission (%)</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Sales</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {products.map((product) => (
                                        <tr key={product.productId} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-800">{product.productName}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">ID: ...{product.productId.slice(-6)}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button 
                                                    onClick={() => toggleAffiliate(product.productId)}
                                                    className={`w-12 h-6 rounded-full transition-all relative ${product.affiliateEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                                                >
                                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${product.affiliateEnabled ? 'left-7' : 'left-1'}`} />
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number"
                                                        value={product.commissionPercentage}
                                                        onChange={(e) => updateCommission(product.productId, e.target.value)}
                                                        className="w-16 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-sm font-black text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                                    />
                                                    <span className="text-xs font-bold text-gray-400">%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-gray-800">{product.totalAffiliateSales}</span>
                                                    <span className="text-[10px] font-bold text-green-600">{formatPrice(product.totalRevenueFromAffiliate)}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
        </div>
    );
};

export default AffiliateDashboard;
