import { Link } from 'react-router-dom';

const PromotionalBannerSection = ({
  title = '',
  subtitle = '',
  banner = '',
  mobileBanner = '',
  ctaText = '',
  ctaLink = '',
  backgroundColor = '',
  gradient = '',
  bannerBgColor = '',
  bannerBgGradient = '',
  textColor = '',
  buttonColor = '',
  overlayOpacity = 0.3
}) => {
  if (!banner && !mobileBanner && !title) return null;

  const isImageBanner = !!banner || !!mobileBanner;
  const isCustomBg = !!backgroundColor || !!gradient;

  const sectionStyle = {
    background: backgroundColor || 'transparent',
    backgroundImage: gradient || 'none'
  };

  const textCardStyle = {
    background: bannerBgColor || 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    backgroundImage: bannerBgGradient || (bannerBgColor ? 'none' : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)')
  };

  const badgeClass = isCustomBg
    ? "inline-flex items-center gap-1.5 px-4 py-1.5 bg-gray-100 border border-gray-200 rounded-full text-xs font-black text-gray-700 tracking-wide shadow-sm uppercase"
    : "inline-flex items-center gap-1.5 px-4 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-xs font-black text-white/95 tracking-wide shadow-sm uppercase animate-pulse";

  const titleClass = isCustomBg
    ? "text-2xl md:text-4xl font-black text-gray-900 tracking-tight leading-tight"
    : "text-2xl md:text-4xl font-black text-white tracking-tight drop-shadow-sm leading-tight";

  const subtitleClass = isCustomBg
    ? "text-xs md:text-base text-gray-500 font-medium leading-relaxed max-w-xl mx-auto"
    : "text-xs md:text-base text-white/85 font-medium leading-relaxed max-w-xl mx-auto";

  const buttonClass = isCustomBg
    ? "inline-flex items-center justify-center font-black py-3 px-8 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-all text-xs md:text-sm active:scale-95 shadow-md"
    : "inline-flex items-center justify-center font-black py-3 px-8 rounded-xl bg-white hover:bg-gray-50 text-gray-900 transition-all text-xs md:text-sm active:scale-95 shadow-lg hover:shadow-xl hover:-translate-y-0.5 duration-300";

  const content = (
    <div 
      style={isImageBanner ? sectionStyle : textCardStyle} 
      className={isImageBanner 
        ? "p-4 md:p-6 rounded-3xl border border-gray-100/40 my-6 shadow-sm overflow-hidden relative group"
        : "rounded-3xl my-6 shadow-lg overflow-hidden relative group border border-gray-100/50"
      }
    >
      {isImageBanner ? (
        <div className="rounded-2xl overflow-hidden shadow-sm relative cursor-pointer border border-gray-150">
          <picture className="w-full h-full pointer-events-none select-none">
            {mobileBanner && <source media="(max-width: 640px)" srcSet={mobileBanner} />}
            <img
              src={banner || mobileBanner}
              alt={title || "Promotional Banner"}
              className="w-full h-60 md:h-96 object-cover group-hover:scale-[1.01] transition-transform duration-500"
            />
          </picture>

          {/* Opacity overlay */}
          <div 
            className="absolute inset-0 z-5"
            style={{ backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})` }}
          />
          
          {/* Overlay text if provided */}
          {title && (
            <div 
              className="absolute inset-y-0 left-0 pl-6 pr-4 md:pl-12 flex flex-col justify-center text-left w-full z-10 pointer-events-none"
              style={{ color: textColor || '#ffffff' }}
            >
              <h3 className="text-base md:text-3xl font-black leading-tight tracking-tight drop-shadow-sm max-w-md">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[10px] md:text-base font-semibold mt-2 max-w-sm line-clamp-2 opacity-90">
                  {subtitle}
                </p>
              )}
              {ctaText && (
                <span 
                  className="inline-block mt-4 font-black py-2.5 px-5 rounded-xl text-[10px] md:text-xs tracking-wide self-start active:scale-95 shadow transition-all pointer-events-auto"
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
      ) : (
        /* Styled text-only promotional card */
        <div className="py-12 px-6 md:py-16 md:px-12 text-center max-w-3xl mx-auto space-y-6 relative z-10 select-none">
          {/* Decorative glowing blobs for default gradient */}
          {!isCustomBg && (
            <>
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
            </>
          )}
          
          <div className={badgeClass}>
            ✨ Featured Campaign
          </div>

          <h3 className={titleClass}>
            {title}
          </h3>
          
          {subtitle && (
            <p className={subtitleClass}>
              {subtitle}
            </p>
          )}

          {ctaLink && (
            <div className="pt-2">
              <Link to={ctaLink} className={buttonClass}>
                {ctaText || 'Explore Now →'}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (ctaLink && !isImageBanner) {
    return content;
  }

  if (ctaLink) {
    return (
      <Link to={ctaLink} className="block">
        {content}
      </Link>
    );
  }

  return content;
};

export default PromotionalBannerSection;
