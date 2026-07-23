import { useRef, useState } from 'react';
import ProductCard from '../../../../shared/components/ProductCard';

const ScrollableRow = ({ products = [] }) => {
  const rowRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const dragDistance = useRef(0);

  const handleMouseDown = (e) => {
    const el = rowRef.current;
    if (!el) return;
    setIsDragging(true);
    // pageX is the mouse coordinates relative to document
    startX.current = e.pageX - el.offsetLeft;
    scrollLeftStart.current = el.scrollLeft;
    dragDistance.current = 0;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const el = rowRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Drag speed multiplier
    dragDistance.current = Math.abs(x - startX.current);
    el.scrollLeft = scrollLeftStart.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Block product clicks if drag action took place
  const handleClickCapture = (e) => {
    if (dragDistance.current > 10) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (!products || products.length === 0) return null;

  return (
    <div className="relative group/row">
      {/* Scrollable Container with drag-to-scroll and custom grabbing cursors */}
      <div
        ref={rowRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onClickCapture={handleClickCapture}
        className={`flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2 md:mx-0 md:px-0 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${isDragging ? '' : 'scroll-smooth'}`}
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="min-w-[170px] w-[170px] md:min-w-[210px] md:w-[210px] shrink-0 pointer-events-auto"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScrollableRow;
