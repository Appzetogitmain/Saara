import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import LazyImage from "../LazyImage";
import useSwipeGesture from "../../../modules/UserApp/hooks/useSwipeGesture";

const ImageGallery = ({ 
  images, 
  productName = "Product", 
  children,
  externalIndex = 0,
  onIndexChange
}) => {
  const [selectedIndex, setSelectedIndex] = useState(externalIndex);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Sync with external index
  useEffect(() => {
    setSelectedIndex(externalIndex);
  }, [externalIndex]);

  // Ensure images is an array
  const imageArray =
    Array.isArray(images) && images.length > 0
      ? images
      : [images].filter(Boolean);

  if (imageArray.length === 0) {
    return (
      <div className="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
        <p className="text-gray-400">No image available</p>
      </div>
    );
  }

  const updateIndex = (newIndex) => {
    setSelectedIndex(newIndex);
    onIndexChange?.(newIndex);
  };

  const handleNext = () => {
    updateIndex((selectedIndex + 1) % imageArray.length);
  };

  const handlePrevious = () => {
    updateIndex((selectedIndex - 1 + imageArray.length) % imageArray.length);
  };

  // Swipe gestures for image navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrevious,
    threshold: 50,
  });

  return (
    <>
      <div className="w-full flex flex-col">
        {/* Main Image */}
        <div
          className="relative w-full aspect-[3/4] lg:aspect-[3/4] bg-white rounded-3xl p-2 lg:p-4 border border-slate-200/80 shadow-sm overflow-hidden"
          data-gallery>
          <motion.div
            key={selectedIndex}
            className="w-full h-full cursor-default"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={swipeHandlers.onTouchMove}
            onTouchEnd={swipeHandlers.onTouchEnd}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}>
            <LazyImage
              src={imageArray[selectedIndex]}
              alt={`${productName} - Image ${selectedIndex + 1}`}
              className="w-full h-full object-cover mix-blend-multiply"
              onError={(e) => {
                e.target.src =
                  "https://via.placeholder.com/500x500?text=Product+Image";
              }}
            />
          </motion.div>
        </div>

        {/* Action Buttons / Badge Area (Injected via children) */}
        {children}
      </div>

      {/* Lightbox Modal (Simplified/Hidden) */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[9999] flex items-center justify-center p-4"
            onClick={() => setIsLightboxOpen(false)}>
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-4 right-4 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white z-10">
              <FiX className="text-2xl" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-7xl max-h-[90vh] w-full">
              <img
                src={imageArray[selectedIndex]}
                alt={`${productName} - Full view`}
                className="w-full h-full object-contain max-h-[90vh] rounded-lg"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ImageGallery;
