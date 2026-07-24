import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiFilter } from 'react-icons/fi';
import { categories } from '../../../../data/categories';
import useSwipeGesture from '../../hooks/useSwipeGesture';

const MobileFilterPanel = ({ isOpen, onClose, filters, onFilterChange, onClearFilters }) => {
  const [dragY, setDragY] = useState(0);
  const panelRef = useRef(null);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflowY = 'hidden';
      setDragY(0);
    } else {
      document.body.style.overflowY = '';
    }
    return () => {
      document.body.style.overflowY = '';
    };
  }, [isOpen]);

  const handleSwipeDown = () => {
    if (dragY > 100) {
      onClose();
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeDown: handleSwipeDown,
    threshold: 100,
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[10000]"
          />

          {/* Filter Panel - Bottom Sheet */}
          <motion.div
            ref={panelRef}
            initial={{ y: '100%' }}
            animate={{ y: dragY > 0 ? dragY : 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[10001] flex flex-col max-h-[90vh]"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={(e) => {
              if (swipeHandlers.swipeState.isSwiping && swipeHandlers.swipeState.offset > 0) {
                setDragY(swipeHandlers.swipeState.offset);
              }
              swipeHandlers.onTouchMove(e);
            }}
            onTouchEnd={(e) => {
              if (dragY > 100) {
                onClose();
              } else {
                setDragY(0);
              }
              swipeHandlers.onTouchEnd(e);
            }}
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FiFilter className="text-xl text-gray-700" />
                <h2 className="text-xl font-bold text-gray-800">Filters</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiX className="text-xl text-gray-600" />
              </button>
            </div>

            {/* Filter Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Category Filter */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3 text-base">Category</h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="category"
                        value={category.name}
                        checked={filters.category === category.name}
                        onChange={(e) => onFilterChange('category', e.target.value)}
                        className="w-5 h-5 text-primary-500"
                      />
                      <span className="text-sm text-gray-700 font-medium">{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-700 mb-3 text-base">Price Range</h3>
                <div className="space-y-3">
                  <input
                    type="number"
                    placeholder="Min Price"
                    value={filters.minPrice}
                    onChange={(e) => onFilterChange('minPrice', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-base"
                  />
                  <input
                    type="number"
                    placeholder="Max Price"
                    value={filters.maxPrice}
                    onChange={(e) => onFilterChange('maxPrice', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-base"
                  />
                </div>
              </div>

              {/* Rating Filter */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-3 text-base">Minimum Rating</h3>
                <div className="space-y-2">
                  {[4, 3, 2, 1].map((rating) => (
                    <label
                      key={rating}
                      className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="minRating"
                        value={rating}
                        checked={filters.minRating === rating.toString()}
                        onChange={(e) => onFilterChange('minRating', e.target.value)}
                        className="w-5 h-5 text-primary-500"
                      />
                      <span className="text-sm text-gray-700 font-medium">{rating}+ Stars</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 p-4 space-y-2">
              <button
                onClick={onClearFilters}
                className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold rounded-xl shadow-md shadow-primary-500/20 active:scale-95 transition-all"
              >
                Apply Filters
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileFilterPanel;

