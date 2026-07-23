import React from 'react';
import { motion } from 'framer-motion';

const EmptyState = ({ 
    icon: Icon, 
    title, 
    description, 
    actionButton,
    className = ""
}) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}
        >
            {Icon && (
                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-6 text-primary-500">
                    <Icon size={40} strokeWidth={1.5} />
                </div>
            )}
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
            {description && (
                <p className="text-gray-500 max-w-sm mb-6 leading-relaxed">
                    {description}
                </p>
            )}
            {actionButton && (
                <div className="mt-2">
                    {actionButton}
                </div>
            )}
        </motion.div>
    );
};

export default EmptyState;
