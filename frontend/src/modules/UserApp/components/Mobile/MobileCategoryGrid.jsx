import { Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { categories as fallbackCategories } from "../../../../data/categories";
import LazyImage from "../../../../shared/components/LazyImage";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { FiGrid } from "react-icons/fi";

const normalizeId = (value) => String(value ?? "").trim();

const MobileCategoryGrid = () => {
  const { categories, initialize, getRootCategories } = useCategoryStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const displayCategories = useMemo(() => {
    const roots = getRootCategories().filter((cat) => cat.isActive !== false);
    if (!roots.length) return fallbackCategories;

    return roots.map((cat) => {
      const fallbackCat = fallbackCategories.find(
        (fc) =>
          normalizeId(fc.id) === normalizeId(cat.id) ||
          fc.name?.toLowerCase() === cat.name?.toLowerCase()
      );
      return {
        ...(fallbackCat || {}),
        ...cat,
        image: cat.image || fallbackCat?.image || "",
      };
    });
  }, [categories, getRootCategories]);

  // Color tints for circular category backgrounds
  const tints = [
    'bg-slate-50', // Slate/Gray
    'bg-purple-50/80', // Purple
    'bg-emerald-50/80', // Green
    'bg-sky-50/80', // Blue
    'bg-amber-50/80', // Amber/Yellow
    'bg-rose-50/80', // Rose/Red
    'bg-teal-50/80', // Teal
    'bg-indigo-50/80', // Indigo
  ];

  return (
    <div className="px-4 py-6">
      {/* Header section with Shop by Category and View All */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight">
          Shop by Category
        </h2>
        <Link
          to="/categories"
          className="text-xs lg:text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors uppercase tracking-wider"
        >
          View All &rarr;
        </Link>
      </div>

      {/* Horizontal scrolling circular category list */}
      <div className="flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {displayCategories.map((category, index) => {
          const bgTint = tints[index % tints.length];
          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04 }}
              className="flex-shrink-0"
            >
              <Link
                to={`/category/${category.id}`}
                className="flex flex-col items-center w-20 group"
              >
                <div className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center p-2.5 border border-slate-200/80 shadow-sm group-hover:scale-105 group-hover:border-primary-500/50 group-hover:ring-2 group-hover:ring-primary-500/30 group-hover:shadow-md transition-all duration-300 ${bgTint}`}>
                  <LazyImage
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-contain pointer-events-none select-none"
                    onError={(e) => {
                      e.target.src =
                        "https://via.placeholder.com/80x80?text=" + encodeURIComponent(category.name);
                    }}
                  />
                </div>
                <span className="text-xs md:text-sm font-bold text-gray-800 text-center line-clamp-2 mt-3 group-hover:text-primary-600 transition-colors">
                  {category.name}
                </span>
              </Link>
            </motion.div>
          );
        })}

        {/* Dynamic "More" Category Bubble */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: displayCategories.length * 0.04 }}
          className="flex-shrink-0"
        >
          <Link
            to="/categories"
            className="flex flex-col items-center w-20 group"
          >
            <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center border border-slate-200/80 bg-slate-50 shadow-sm group-hover:scale-105 group-hover:border-primary-500/50 group-hover:ring-2 group-hover:ring-primary-500/30 group-hover:shadow-md transition-all duration-300">
              <FiGrid className="text-2xl text-primary-600 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-xs md:text-sm font-bold text-gray-800 text-center mt-3 group-hover:text-primary-600 transition-colors">
              More
            </span>
          </Link>
        </motion.div>
      </div>
    </div>
  );
};

export default MobileCategoryGrid;
