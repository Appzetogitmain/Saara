import { Link } from "react-router-dom";
import ScrollableRow from "../../modules/UserApp/components/HomeSections/ScrollableRow";
import ProductCard from "./ProductCard";

// Helper layout radius converters
const getRadiusClass = (borderRadius) => {
  switch (borderRadius) {
    case "none": return "rounded-none";
    case "sm": return "rounded-sm";
    case "md": return "rounded-md";
    case "lg": return "rounded-2xl";
    case "full": return "rounded-[32px]";
    default: return "rounded-2xl";
  }
};

// ─── CMS Primitive Sections ──────────────────────────────────────────────────

const BannerSection = ({ section, theme }) => {
  return (
    <div className={`relative w-full overflow-hidden shadow-sm aspect-[16/9] md:aspect-[21/9] ${getRadiusClass(theme.borderRadius)}`}>
      <img
        src={section.banner?.url || section.bannerUrl || "/placeholder.jpg"}
        alt={section.title || "Banner"}
        className="w-full h-full object-cover"
      />
      {(section.title || section.subtitle) && (
        <div
          className="absolute inset-0 flex flex-col justify-end p-6 md:p-12 text-white"
          style={{
            background: `linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,${section.banner?.metadata?.overlayOpacity || 0.3}) 100%)`
          }}
        >
          {section.title && <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">{section.title}</h2>}
          {section.subtitle && <p className="text-xs md:text-base text-gray-200 mt-2 font-medium max-w-xl">{section.subtitle}</p>}
          {section.ctaText && (
            <a
              href={section.ctaLink || "#"}
              className="mt-4 px-6 py-2.5 text-xs font-bold w-fit shadow-md transition-all active:scale-95"
              style={{
                backgroundColor: theme.primaryColor || "#7c3aed",
                color: "#ffffff",
                borderRadius: theme.borderRadius === "full" ? "9999px" : "12px"
              }}
            >
              {section.ctaText}
            </a>
          )}
        </div>
      )}
    </div>
  );
};

const ProductCarouselSection = ({ section }) => {
  return (
    <div className="space-y-4">
      {(section.title || section.subtitle) && (
        <div className="px-1">
          {section.title && <h3 className="text-lg font-black text-slate-800 tracking-tight">{section.title}</h3>}
          {section.subtitle && <p className="text-xs text-slate-400 font-semibold">{section.subtitle}</p>}
        </div>
      )}
      <ScrollableRow products={section.data || []} />
    </div>
  );
};

const ProductGridSection = ({ section }) => {
  return (
    <div className="space-y-4">
      {(section.title || section.subtitle) && (
        <div className="px-1">
          {section.title && <h3 className="text-lg font-black text-slate-800 tracking-tight">{section.title}</h3>}
          {section.subtitle && <p className="text-xs text-slate-400 font-semibold">{section.subtitle}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {(section.data || []).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

const CategoryGridSection = ({ section, theme }) => {
  return (
    <div className="space-y-4">
      {(section.title || section.subtitle) && (
        <div className="px-1">
          {section.title && <h3 className="text-lg font-black text-slate-800 tracking-tight">{section.title}</h3>}
          {section.subtitle && <p className="text-xs text-slate-400 font-semibold">{section.subtitle}</p>}
        </div>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-4 text-center">
        {(section.data || []).map((cat) => (
          <Link
            key={cat.id}
            to={`/store/${theme.slug || "explore"}/category/${cat.slug || cat.id}`}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-150 bg-gray-50 flex items-center justify-center group-hover:scale-105 transition-transform duration-200 shadow-sm">
              <img
                src={cat.image || "/placeholder.jpg"}
                alt={cat.name}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-bold text-slate-700 group-hover:text-purple-600 transition-colors line-clamp-1">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

const TextBlockSection = ({ section }) => {
  return (
    <div className="text-center py-6 px-4 space-y-2 bg-gray-50 rounded-2xl border border-gray-100 max-w-3xl mx-auto">
      {section.title && <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">{section.title}</h2>}
      {section.subtitle && <p className="text-xs md:text-sm text-slate-500 font-semibold leading-relaxed">{section.subtitle}</p>}
    </div>
  );
};

const SpacerSection = ({ section }) => {
  return <div style={{ height: `${section.displayLimit || 24}px` }} className="w-full" />;
};

const DividerSection = () => {
  return <hr className="border-gray-100 my-6 w-full" />;
};

// ─── COMPONENT REGISTRY ──────────────────────────────────────────────────────

const SECTION_REGISTRY = {
  Banner: { component: BannerSection, supportsBackground: true, supportsCTA: true },
  "Product Carousel": { component: ProductCarouselSection, supportsBackground: false },
  "Product Grid": { component: ProductGridSection, supportsBackground: false },
  Collection: { component: ProductCarouselSection, supportsBackground: false }, // maps collections dynamic rule horizontal list
  "Category Grid": { component: CategoryGridSection, supportsBackground: true },
  "Text Block": { component: TextBlockSection, supportsBackground: true },
  Spacer: { component: SpacerSection },
  Divider: { component: DividerSection }
};

const CmsPageRenderer = ({ sections = [], themeOverrides = {} }) => {
  if (!sections || sections.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 font-bold uppercase tracking-widest text-xs">
        No sections published on this page yet.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 w-full">
      {sections.map((section) => {
        // Device-level visibility check
        const visible = section.visibility !== false;
        if (!visible) return null;

        const reg = SECTION_REGISTRY[section.sectionType];
        if (!reg) return null;

        const Component = reg.component;
        return <Component key={section._id} section={section} theme={themeOverrides} />;
      })}
    </div>
  );
};

export default CmsPageRenderer;
