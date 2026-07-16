import ScrollableRow from './ScrollableRow';

const RecentlyViewedSection = ({
  products = [],
  title = 'Recently Viewed',
  subtitle = 'Pick up where you left off'
}) => {
  if (!products || products.length === 0) return null;

  return (
    <div className="py-6 my-4 bg-gray-50/50 border border-gray-100/60 rounded-3xl p-4 md:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h2>
        <p className="text-xs text-gray-400 font-semibold mt-0.5">{subtitle}</p>
      </div>
      <ScrollableRow products={products} />
    </div>
  );
};

export default RecentlyViewedSection;
