import { Link } from 'react-router-dom';
import ScrollableRow from './ScrollableRow';

const SeasonalCollectionSection = ({
  data = [],
  title = 'Seasonal Collection',
  subtitle = 'Handpicked picks for this season.',
  banner = '',
  mobileBanner = '',
  ctaText = 'Explore Season Collection',
  ctaLink = '',
  categories = [],
  backgroundColor = '',
  gradient = '',
  bannerTitle = '',
  bannerSubtitle = '',
  textColor = '',
  buttonColor = '',
  overlayOpacity = 0.3
}) => {
  if ((!data || data.length === 0) && (!categories || categories.length === 0)) return null;

  const sectionStyle = {
    background: backgroundColor || 'transparent',
    backgroundImage: gradient || 'none'
  };

  return (
    <div style={sectionStyle} className="py-8 px-4 md:px-6 rounded-3xl border border-gray-100/40 my-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
          <p className="text-xs md:text-sm text-gray-500 font-semibold mt-1">{subtitle}</p>
        </div>

        {ctaLink && (
          <Link
            to={ctaLink}
            className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors bg-primary-50 hover:bg-primary-100/80 px-4 py-2 rounded-xl shrink-0 self-start md:self-center"
          >
            {ctaText || 'Shop Collection →'}
          </Link>
        )}
      </div>

      {/* Main Campaign Banner */}
      {(banner || mobileBanner) && (
        <div className="mb-6 rounded-2xl overflow-hidden shadow-sm relative group cursor-pointer border border-gray-150">
          <picture className="w-full h-full pointer-events-none select-none">
            {mobileBanner && <source media="(max-width: 640px)" srcSet={mobileBanner} />}
            <img
              src={banner || mobileBanner}
              alt="Seasonal Campaign Banner"
              className="w-full h-48 md:h-72 object-cover group-hover:scale-[1.01] transition-transform duration-500"
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

      {/* Categories Spotlight chips (if any) */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-6">
          {categories.map((cat) => (
            <Link
              key={cat._id || cat.id}
              to={`/category/${cat._id || cat.id}`}
              className="px-4 py-1.5 bg-white border border-gray-150 hover:border-primary-500 text-xs font-bold text-gray-700 hover:text-primary-600 rounded-full shadow-sm transition-all"
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      {/* Product List */}
      <ScrollableRow products={data} />
    </div>
  );
};

export default SeasonalCollectionSection;
