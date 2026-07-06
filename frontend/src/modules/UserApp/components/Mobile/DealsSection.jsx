import React from 'react';
import { Link } from 'react-router-dom';

const DealsSection = ({ items }) => {
  const defaultDeals = [
    { brand: 'LetsShave', offer: 'Up To 45% OFF', image: 'https://images.unsplash.com/photo-1626015713026-d837d172406f?auto=format&fit=crop&w=400&q=80', link: '/search?q=LetsShave' },
    { brand: 'Dove', offer: 'Up To 35% OFF', image: 'https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=400&q=80', link: '/search?q=Dove' },
    { brand: 'NAKPRO', offer: 'Up To 60% OFF', image: 'https://images.unsplash.com/photo-1579758629938-03607ccdbaba?auto=format&fit=crop&w=400&q=80', link: '/search?q=NAKPRO' },
    { brand: 'ISOPURE', offer: 'Up To 15% OFF', image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=400&q=80', link: '/search?q=ISOPURE' },
    { brand: 'FOGG', offer: 'Flat 15% OFF', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80', link: '/search?q=FOGG' },
    { brand: 'BOULT', offer: 'Up To 60% OFF', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80', link: '/search?q=BOULT' },
    { brand: 'Mamaearth', offer: 'Up To 20% OFF', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80', link: '/search?q=Mamaearth' },
    { brand: 'POLICE', offer: 'Up To 40% OFF', image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=400&q=80', link: '/search?q=POLICE' },
    { brand: 'Durex', offer: 'Up To 20% OFF', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80', link: '/search?q=Durex' },
  ];

  const deals = items && items.length > 0 ? items : defaultDeals;

  return (
    <div className="py-8 bg-gradient-to-r from-[#f8f5ff] to-[#f3efff] border-t border-b border-purple-50">
      <div className="px-4 mb-6 flex justify-between items-center max-w-[1440px] mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl">🔥</span>
          <h2 className="text-lg md:text-2xl font-black text-gray-900 tracking-tight">Trending Deals</h2>
        </div>
        <Link to="/offers" className="text-xs md:text-sm text-primary-600 font-extrabold hover:text-primary-700 transition-colors">
          View All &rarr;
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-4 max-w-[1440px] mx-auto w-full">
        {deals.map((deal, index) => (
          <Link
            key={index}
            to={deal.link || "/search"}
            className="min-w-[160px] w-[160px] md:min-w-[240px] md:w-[240px] flex-shrink-0 flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-gray-100 hover:-translate-y-1 transition-all duration-300 group"
          >
            <div className="w-full h-36 md:h-48 overflow-hidden bg-gray-50 relative select-none">
              <img 
                src={deal.image} 
                alt={deal.brand}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                loading="lazy"
              />
            </div>
            
            <div className="p-3 md:p-4 flex flex-col justify-between text-left flex-1 min-h-[90px] md:min-h-[120px]">
              <div>
                <p className="text-[9px] md:text-[10px] font-black tracking-widest text-gray-400 uppercase">
                  Brand Deal
                </p>
                <p className="text-xs md:text-base font-bold text-gray-800 mt-0.5 leading-tight truncate">
                  {deal.brand}
                </p>
              </div>
              <div className="mt-2">
                <p className="text-xs md:text-sm font-extrabold text-primary-600 leading-tight">
                  {deal.offer}
                </p>
                <div className="flex items-center gap-1 text-[10px] md:text-xs font-black text-primary-600 mt-2 select-none group-hover:text-primary-700 transition-colors">
                  <span>Shop Now</span>
                  <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DealsSection;
