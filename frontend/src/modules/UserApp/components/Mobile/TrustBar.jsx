import React from 'react';
import { FiTruck, FiShield, FiRotateCcw, FiPhoneCall } from 'react-icons/fi';

const TrustBar = () => {
  const trustItems = [
    { 
      title: 'Free Delivery', 
      sub: 'On orders above ₹499', 
      icon: FiTruck,
      bg: 'bg-indigo-50',
      color: 'text-indigo-600'
    },
    { 
      title: 'Secure Payment', 
      sub: '100% secure payments', 
      icon: FiShield,
      bg: 'bg-indigo-50',
      color: 'text-indigo-600'
    },
    { 
      title: 'Easy Returns', 
      sub: 'Within 7 days', 
      icon: FiRotateCcw,
      bg: 'bg-indigo-50',
      color: 'text-indigo-600'
    },
    { 
      title: '24/7 Support', 
      sub: "We're here to help", 
      icon: FiPhoneCall,
      bg: 'bg-indigo-50',
      color: 'text-indigo-600'
    },
  ];

  return (
    <div className="py-6 px-4">
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-gray-100 shadow-sm grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
        {trustItems.map((item, index) => (
          <div key={index} className="flex items-center gap-2.5 md:gap-4 px-1 last:border-r-0 lg:border-r border-gray-100/80">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0 ${item.bg}`}>
              <item.icon className={`text-lg md:text-xl lg:text-2xl ${item.color}`} />
            </div>
            <div className="text-left">
              <p className="text-xs md:text-sm lg:text-base font-black text-gray-800 leading-tight">
                {item.title}
              </p>
              <p className="text-[10px] md:text-xs text-gray-500 font-semibold mt-0.5 leading-tight">
                {item.sub}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrustBar;
