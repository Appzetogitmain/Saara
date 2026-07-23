import ScrollableRow from './ScrollableRow';

const RecentlyViewedSection = ({
  products = [],
  title = 'Recently Viewed',
  subtitle = 'Pick up where you left off'
}) => {
  if (!products || products.length === 0) return null;

  return (
    <div className="py-6 my-4 bg-slate-900/90 border border-slate-800/80 rounded-3xl p-5 md:p-7 shadow-xl">
      <div className="mb-4">
        <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">{title}</h2>
        <p className="text-xs text-slate-400 font-semibold mt-0.5">{subtitle}</p>
      </div>
      <ScrollableRow products={products} />
    </div>
  );
};

export default RecentlyViewedSection;
