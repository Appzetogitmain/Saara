import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import LazyImage from '../../../../shared/components/LazyImage';

const getButtonStyleClasses = (style = "primary", isDarkBg = false) => {
  const base = "inline-flex items-center justify-center gap-1.5 font-bold py-2 px-5 rounded-xl transition-all duration-300 shadow-md cursor-pointer select-none text-xs active:scale-95 mt-3 self-start";
  if (isDarkBg) {
    switch (style) {
      case "secondary":
        return `${base} bg-gray-800 text-white hover:bg-gray-700 border border-gray-700 hover:scale-[1.02]`;
      case "outline":
        return `${base} bg-transparent text-white border-2 border-white hover:bg-white/10 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-white text-gray-900 hover:bg-gray-100 hover:scale-[1.02]`;
    }
  } else {
    switch (style) {
      case "secondary":
        return `${base} bg-gray-100 hover:bg-gray-200 text-gray-800 hover:scale-[1.02]`;
      case "outline":
        return `${base} bg-transparent border-2 border-primary-600 text-primary-600 hover:bg-primary-50 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-primary-600 hover:bg-primary-700 text-white hover:scale-[1.02]`;
    }
  }
};

const CategoryInFocus = ({ banner, items }) => {
  const defaultItems = [
    { name: 'Conditioner', image: 'https://images.pexels.com/photos/4465124/pexels-photo-4465124.jpeg?auto=compress&cs=tinysrgb&w=200' },
    { name: 'Foundation', image: 'https://images.pexels.com/photos/3373736/pexels-photo-3373736.jpeg?auto=compress&cs=tinysrgb&w=200' },
    { name: 'Blush', image: 'https://images.pexels.com/photos/2533266/pexels-photo-2533266.jpeg?auto=compress&cs=tinysrgb&w=200' },
    { name: 'Lipsticks', image: 'https://images.pexels.com/photos/2533261/pexels-photo-2533261.jpeg?auto=compress&cs=tinysrgb&w=200' },
    { name: 'Mascara', image: 'https://images.pexels.com/photos/3373746/pexels-photo-3373746.jpeg?auto=compress&cs=tinysrgb&w=200' },
  ];

  const focusItems = items && items.length > 0 ? items : defaultItems;
  const displayBanner = banner || {
    title: "BEST OF GLOBAL BEAUTY",
    subtitle: "Up To 30% Off",
    description: "Complimentary Gifts On Select Brands",
    image: "https://images.pexels.com/photos/3738339/pexels-photo-3738339.jpeg?auto=compress&cs=tinysrgb&w=1200",
    link: "/search?q=beauty"
  };

  const handleBannerClick = (e) => {
    const target = String(displayBanner.link || "").trim();
    if (!target) {
      e.preventDefault();
      return;
    }

    if (displayBanner.openInNewTab || /^https?:\/\//i.test(target)) {
      e.preventDefault();
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="py-6 bg-white">
      <div className="px-4 mb-4">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Category In Focus</h2>
      </div>

      {/* Main Banner */}
      <div className="px-4 mb-6">
        <Link to={displayBanner.link || "#"} onClick={handleBannerClick}>
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="relative rounded-2xl overflow-hidden h-48 sm:h-72 md:h-80 lg:h-96 w-full shadow-lg">
            <picture className="w-full h-full object-cover">
              {displayBanner.mobileImage && <source media="(max-width: 640px)" srcSet={displayBanner.mobileImage} />}
              <img 
                src={displayBanner.image} 
                alt={displayBanner.altText || displayBanner.title}
                className="w-full h-full object-cover"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/20 to-transparent p-5 flex flex-col justify-end">
              <div className="max-w-[70%]">
                <h3 className="text-white text-lg font-black leading-tight uppercase mb-1">
                  {displayBanner.title}
                </h3>
                {displayBanner.subtitle && (
                  <div className="bg-white/20 backdrop-blur-md rounded-lg px-2 py-1 w-fit mb-2">
                    <p className="text-white text-lg font-black">{displayBanner.subtitle}</p>
                  </div>
                )}
                {displayBanner.description && (
                  <p className="text-white/80 text-[10px] font-medium leading-tight">
                    {displayBanner.description}
                  </p>
                )}
                {displayBanner.showButton !== false && (
                  <span className={getButtonStyleClasses(displayBanner.buttonStyle, false)}>
                    {displayBanner.buttonText || "Shop Now"} &rarr;
                  </span>
                )}
              </div>
              {/* Mock Global Store Logo (only shown on fallback) */}
              {!banner && (
                <div className="absolute top-4 right-4 text-right">
                  <p className="text-white text-[8px] font-bold tracking-widest opacity-80">NYKAA</p>
                  <p className="text-white text-xs font-black tracking-tighter">GLOBAL</p>
                  <p className="text-white text-[8px] font-bold opacity-80">STORE</p>
                </div>
              )}
            </div>
          </motion.div>
        </Link>
      </div>

      {/* Circular Sub-categories */}
      <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 scrollbar-hide px-4 justify-start sm:justify-center">
        {focusItems.map((item, index) => {
          const itemLink = item.link || `/search?q=${encodeURIComponent(item.name)}`;
          const handleItemClick = (e) => {
            if (item.openInNewTab || /^https?:\/\//i.test(itemLink)) {
              e.preventDefault();
              window.open(itemLink, "_blank", "noopener,noreferrer");
            }
          };

          return (
            <Link 
              key={index}
              to={itemLink}
              onClick={handleItemClick}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-[72px]">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="w-16 h-16 rounded-full overflow-hidden relative shadow-md border-2 border-white ring-1 ring-blue-100">
                {/* Sky blue background as in screenshot */}
                <div className="absolute inset-0 bg-gradient-to-b from-blue-300 to-blue-400 opacity-60" />
                <img 
                  src={item.image} 
                  alt={item.altText || item.name}
                  className="w-full h-full object-cover relative z-10 p-1 rounded-full"
                />
              </motion.div>
              <span className="text-[10px] font-bold text-gray-700 text-center leading-tight">
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryInFocus;
