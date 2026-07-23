import React from 'react';
import { Link } from 'react-router-dom';

const getButtonStyleClasses = (style = "primary") => {
  const base = "inline-flex items-center justify-center gap-1 font-bold py-1.5 px-3.5 rounded-xl transition-all duration-300 shadow-sm cursor-pointer select-none text-[10px] active:scale-95 mt-2 self-start whitespace-nowrap";
  switch (style) {
    case "secondary":
      return `${base} bg-slate-700 hover:bg-slate-600 text-white hover:scale-[1.02]`;
    case "outline":
      return `${base} bg-transparent border border-primary-400 text-primary-400 hover:bg-primary-500/10 hover:scale-[1.02]`;
    case "primary":
    default:
      return `${base} bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-sm shadow-primary-500/20 hover:scale-[1.02]`;
  }
};

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

  const handleDealClick = (deal, e) => {
    const target = String(deal.link || "/search").trim();
    if (deal.openInNewTab || /^https?:\/\//i.test(target)) {
      e.preventDefault();
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="py-8 bg-slate-900/90 border-y border-slate-800/80 shadow-xl my-4 rounded-3xl p-4 md:p-8">
      <div className="px-2 mb-6 flex justify-between items-center max-w-[1440px] mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-xl md:text-2xl">🔥</span>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Trending Deals</h2>
        </div>
        <Link to="/offers" className="text-xs md:text-sm text-primary-400 font-bold uppercase tracking-wider hover:text-primary-300 transition-colors">
          View All &rarr;
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2 max-w-[1440px] mx-auto w-full">
        {deals.map((deal, index) => (
          <Link
            key={index}
            to={deal.link || "/search"}
            onClick={(e) => handleDealClick(deal, e)}
            className="min-w-[160px] w-[160px] md:min-w-[240px] md:w-[240px] flex-shrink-0 flex flex-col bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:border-primary-500/50 hover:-translate-y-1 transition-all duration-300 group"
          >
            <div className="w-full h-36 md:h-48 overflow-hidden bg-slate-900/40 relative select-none">
              <picture className="w-full h-full object-cover">
                {deal.mobileImage && <source media="(max-width: 640px)" srcSet={deal.mobileImage} />}
                <img 
                  src={deal.image} 
                  alt={deal.altText || deal.brand || "Deal Logo"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                  loading="lazy"
                />
              </picture>
            </div>
            
            <div className="p-3 md:p-4 flex flex-col justify-between text-left flex-1 min-h-[90px] md:min-h-[120px]">
              <div>
                <p className="text-[9px] md:text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">
                  Brand Deal
                </p>
                <p className="text-xs md:text-base font-bold text-white mt-0.5 leading-tight truncate group-hover:text-primary-400 transition-colors">
                  {deal.brand}
                </p>
              </div>
              <div className="mt-2 flex flex-col justify-between flex-1">
                <p className="text-xs md:text-sm font-extrabold text-emerald-400 leading-tight">
                  {deal.offer}
                </p>
                {deal.showButton !== false && (
                  <span className={getButtonStyleClasses(deal.buttonStyle)}>
                    {deal.buttonText || "Shop Now"}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default DealsSection;
