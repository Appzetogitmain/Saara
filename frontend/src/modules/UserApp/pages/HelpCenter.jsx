import React, { useState, useMemo } from "react";
import { FiChevronDown, FiSearch, FiHelpCircle } from "react-icons/fi";
import { motion } from "framer-motion";

const HelpCenter = ({ dynamicPolicy }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openFaq, setOpenFaq] = useState(null);

  const categories = useMemo(() => {
    if (!dynamicPolicy || !dynamicPolicy.items) return ["All"];
    const uniqueCats = new Set(dynamicPolicy.items.map(item => item.category || "General"));
    return ["All", ...Array.from(uniqueCats)].sort();
  }, [dynamicPolicy]);

  const filteredItems = useMemo(() => {
    if (!dynamicPolicy || !dynamicPolicy.items) return [];
    
    let items = [...dynamicPolicy.items];
    
    // Search ignores category
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        item => 
          item.question.toLowerCase().includes(q) || 
          item.answer.toLowerCase().includes(q)
      );
    } else if (selectedCategory !== "All") {
      items = items.filter(item => (item.category || "General") === selectedCategory);
    }
    
    // Sort alphabetically by question
    return items.sort((a, b) => a.question.localeCompare(b.question));
  }, [dynamicPolicy, searchQuery, selectedCategory]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
      {/* Header and Search */}
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-6 flex items-center justify-center md:justify-start gap-3">
          <FiHelpCircle className="text-primary-500" />
          Help Center
        </h1>
        
        <div className="relative max-w-2xl mx-auto md:mx-0">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
          <input 
            type="text" 
            placeholder="Search for answers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-700 shadow-sm"
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Desktop Sidebar (Hidden on Mobile) */}
        <div className="hidden md:block w-64 shrink-0">
          <div className="sticky top-24 bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 px-4">Categories</h3>
            <div className="flex flex-col space-y-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSearchQuery("");
                  }}
                  className={`text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    (selectedCategory === cat && !searchQuery) 
                      ? "bg-white shadow-sm text-primary-600 border border-slate-200" 
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Category Chips (Hidden on Desktop) */}
        {!searchQuery && (
          <div className="md:hidden flex overflow-x-auto pb-4 -mx-4 px-4 space-x-2 snap-x hide-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 snap-start px-5 py-2 rounded-full text-sm font-semibold transition-colors border ${
                  selectedCategory === cat 
                    ? "bg-slate-800 text-white border-slate-800" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1">
          {searchQuery && (
            <div className="mb-6">
              <p className="text-slate-500 font-medium">
                Search results for <span className="text-slate-900 font-bold">"{searchQuery}"</span>
              </p>
            </div>
          )}

          <div className="space-y-4">
            {filteredItems.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100">
                <FiSearch className="text-4xl text-slate-300 mx-auto mb-4" />
                <p className="text-slate-700 font-bold text-lg">No results found</p>
                <p className="text-slate-500 mt-2">Try adjusting your search or selecting a different category.</p>
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 group bg-white"
                  >
                    <span className="text-base font-bold text-slate-800 group-hover:text-primary-600 transition-colors">
                      {item.question}
                    </span>
                    <FiChevronDown 
                      className={`text-xl text-slate-400 shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180 text-primary-500' : ''}`}
                    />
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: openFaq === idx ? 'auto' : 0, opacity: openFaq === idx ? 1 : 0 }}
                    className="overflow-hidden bg-slate-50 border-t border-slate-100"
                  >
                    <div className="px-6 py-6 text-base text-slate-600 leading-relaxed font-medium">
                      {item.answer}
                    </div>
                  </motion.div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
