import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiThumbsUp, FiArrowRight } from "react-icons/fi";
import ProductCard from "../../../../shared/components/ProductCard";
import { getRecommendedProducts } from "../../data/catalogData";

const RecommendedSection = ({ products = null }) => {
  const recommended = useMemo(() => {
    if (Array.isArray(products) && products.length > 0) {
      return products.slice(0, 6);
    }
    return getRecommendedProducts(6);
  }, [products]);

  if (recommended.length === 0) {
    return null;
  }

  return (
    <div className="px-4 md:px-6 py-6 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800/80 rounded-3xl mx-2 shadow-xl my-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary-500/20 text-primary-300 border border-primary-500/30 backdrop-blur-md rounded-xl shadow-sm">
            <FiThumbsUp className="text-primary-300 text-lg" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
              Recommended for You
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Curated just for you</p>
          </div>
        </div>
        <Link
          to="/search"
          className="flex items-center gap-1 text-xs md:text-sm text-primary-400 font-bold hover:text-primary-300 uppercase tracking-wider transition-colors active:scale-95">
          <span>See All</span>
          <FiArrowRight className="text-sm" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {recommended.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={index === 5 ? "xl:hidden" : ""}
            transition={{ delay: index * 0.05 }}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default RecommendedSection;
