import ScrollableRow from './ScrollableRow';

const BestSellersSection = ({
  products = [],
  title = 'Best Sellers',
  subtitle = 'Our most popular products based on sales volume.'
}) => {
  if (!products || products.length === 0) return null;

  return (
    <div className="py-6 my-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">{title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">{subtitle}</p>
      </div>
      <ScrollableRow products={products} />
    </div>
  );
};

export default BestSellersSection;
