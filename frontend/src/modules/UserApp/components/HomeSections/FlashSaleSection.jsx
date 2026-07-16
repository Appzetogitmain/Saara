import { useState, useEffect } from 'react';
import { FiClock } from 'react-icons/fi';
import ScrollableRow from './ScrollableRow';
import { Link } from 'react-router-dom';

const FlashSaleSection = ({
  data = [],
  title = 'Super Flash Sale',
  subtitle = 'Limited time offers. Grab them before they are gone!',
  banner = '',
  mobileBanner = '',
  countdownDate = null,
  ctaText = 'Shop All Flash Deals',
  ctaLink = '/search?flashSale=true',
  backgroundColor = '',
  gradient = '',
  layout = 'horizontal',
  bannerTitle = '',
  bannerSubtitle = '',
  textColor = '',
  buttonColor = '',
  overlayOpacity = 0.3
}) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!countdownDate) return;

    const calculateTimeLeft = () => {
      const difference = +new Date(countdownDate) - +new Date();
      if (difference <= 0) return null;

      return {
        hours: Math.floor(difference / (1000 * 60 * 60)),
        minutes: Math.floor((difference / 1000 / 65) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (!remaining) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [countdownDate]);

  if (!data || data.length === 0) return null;

  // Don't show if countdown has expired
  if (countdownDate && !timeLeft) return null;

  const sectionStyle = {
    background: backgroundColor || 'transparent',
    backgroundImage: gradient || 'none'
  };

  return (
    <div style={sectionStyle} className="py-8 px-4 md:px-6 rounded-3xl border border-gray-100/40 my-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center flex-wrap gap-3">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
            {timeLeft && (
              <div className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold font-mono shadow-sm animate-pulse shrink-0">
                <FiClock className="text-sm shrink-0" />
                <span>Ends In:</span>
                <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
                <span>:</span>
                <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
                <span>:</span>
                <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
              </div>
            )}
          </div>
          <p className="text-xs md:text-sm text-gray-500 font-semibold mt-1">{subtitle}</p>
        </div>

        {ctaLink && (
          <Link
            to={ctaLink}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors bg-primary-50 hover:bg-primary-100/80 px-4 py-2 rounded-xl shrink-0 self-start md:self-center"
          >
            {ctaText || 'View All Deals →'}
          </Link>
        )}
      </div>

      {/* Render optional Promotional Banner above product list */}
      {(banner || mobileBanner) && (
        <div className="mb-6 rounded-2xl overflow-hidden shadow-sm relative group cursor-pointer border border-gray-150">
          <picture className="w-full h-full pointer-events-none select-none">
            {mobileBanner && <source media="(max-width: 640px)" srcSet={mobileBanner} />}
            <img
              src={banner || mobileBanner}
              alt="Flash Sale Promo Banner"
              className="w-full h-44 md:h-64 object-cover group-hover:scale-[1.01] transition-transform duration-500"
            />
          </picture>

          {/* Opacity overlay */}
          <div 
            className="absolute inset-0 z-5"
            style={{ backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})` }}
          />

          {/* Overlay text if provided */}
          {bannerTitle && (
            <div 
              className="absolute inset-y-0 left-0 pl-6 pr-4 md:pl-12 flex flex-col justify-center text-left w-full z-10 pointer-events-none"
              style={{ color: textColor || '#ffffff' }}
            >
              <h3 className="text-base md:text-2xl font-black leading-tight tracking-tight drop-shadow-sm max-w-sm">
                {bannerTitle}
              </h3>
              {bannerSubtitle && (
                <p className="text-[10px] md:text-sm font-semibold mt-1 max-w-xs line-clamp-2 opacity-90">
                  {bannerSubtitle}
                </p>
              )}
              {ctaText && (
                <span 
                  className="inline-block mt-3 font-black py-1.5 px-4 rounded-xl text-[10px] md:text-xs tracking-wide self-start active:scale-95 shadow transition-all pointer-events-auto"
                  style={{ 
                    backgroundColor: buttonColor || '#ffffff',
                    color: '#111827'
                  }}
                >
                  {ctaText}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Product List */}
      <ScrollableRow products={data} />
    </div>
  );
};

export default FlashSaleSection;
