import React from 'react';
import { FiActivity, FiDownload, FiSearch } from 'react-icons/fi';
import { useAdminSocial } from '../hooks/useAdminSocial';
import AuditLogTable from '../components/AuditLogTable';

const AuditLogs = () => {
    const { logs } = useAdminSocial();

    return (
        <div className="space-y-8 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="lg:hidden">
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3 uppercase">
                        <FiActivity className="text-primary-600" />
                        Audit Trail
                    </h1>
                    <p className="text-gray-500 font-medium tracking-wide">Historical log of all administrative actions performed across the social ecosystem.</p>
                </div>

                <div className="flex items-center gap-2 lg:ml-auto">
                    <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-xs font-black text-gray-600 uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
                        <FiDownload /> Export CSV
                    </button>
                    <div className="relative">
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search actions..."
                            className="bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary-100"
                        />
                    </div>
                </div>
            </div>

            <section className="space-y-6">
                <AuditLogTable logs={logs} />
            </section>
        </div>
    );
};

export default AuditLogs;
