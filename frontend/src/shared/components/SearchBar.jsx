
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiClock, FiTrendingUp, FiMic } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getCatalogProducts } from '../../modules/UserApp/data/catalogData';
import api from '../utils/api';
import useSpeechRecognition from '../hooks/useSpeechRecognition';

const RECENT_SEARCHES_KEY = 'recent-searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_SUGGESTIONS = 5;

const SearchBar = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're in the mobile app section
  const isMobileApp = location.pathname.startsWith('/app');
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: (text, isFinal) => {
      setSearchQuery(text);
      if (isFinal && text.trim()) {
        handleSubmit(null, text.trim());
      }
    }
  });

  // Popular searches (can be made dynamic later)
  const popularSearches = ['Diapers', 'Vegetables', 'Meat', 'Fruits', 'Baby Care'];

  // Get recent searches from localStorage
  const getRecentSearches = () => {
    try {
      const recent = localStorage.getItem(RECENT_SEARCHES_KEY);
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  };

  // Save search to recent searches
  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    const recent = getRecentSearches();
    const updated = [query.trim(), ...recent.filter((s) => s !== query.trim())].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Update suggestions when query changes
  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      if (!searchQuery.trim()) {
        setSuggestions([]);
        setSelectedIndex(-1);
        return;
      }

      try {
        const response = await api.get('/products', {
          params: { q: searchQuery.trim(), page: 1, limit: MAX_SUGGESTIONS, sort: 'newest' },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        setSuggestions(
          products.map((product) => ({
            type: 'product',
            id: product?._id || product?.id,
            name: product?.name || '',
            image: product?.image || product?.images?.[0] || '',
            price: Number(product?.price) || 0,
          }))
        );
      } catch {
        if (cancelled) return;
        const lowerQuery = searchQuery.toLowerCase();
        const fallback = getCatalogProducts()
          .filter((product) => String(product?.name || '').toLowerCase().includes(lowerQuery))
          .slice(0, MAX_SUGGESTIONS)
          .map((product) => ({
            type: 'product',
            id: product.id,
            name: product.name,
            image: product.image,
            price: Number(product.price) || 0,
          }));
        setSuggestions(fallback);
      }
      setSelectedIndex(-1);
    };

    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
    }
  }, [searchQuery]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions && (suggestions.length > 0 || getRecentSearches().length > 0)) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
      }
      return;
    }

    const recentSearches = getRecentSearches();
    const totalItems = suggestions.length + (searchQuery.trim() ? 0 : recentSearches.length) + (searchQuery.trim() ? 0 : popularSearches.length);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSuggestionSelect(selectedIndex);
      } else {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleSubmit = (e, queryOverride) => {
    if (e) e.preventDefault();
    const finalQuery = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (finalQuery) {
      saveRecentSearch(finalQuery);
      if (onSearch) {
        onSearch(finalQuery);
      } else {
        const searchRoute = `/search?q=${encodeURIComponent(finalQuery)}`;
        navigate(searchRoute);
      }
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (index) => {
    const recentSearches = getRecentSearches();
    let selectedItem;

    if (searchQuery.trim()) {
      // Product suggestions
      if (index < suggestions.length) {
        selectedItem = suggestions[index];
        const productRoute = `/product/${selectedItem.id}`;
        navigate(productRoute);
      }
    } else {
      // Recent searches or popular searches
      if (index < recentSearches.length) {
        const query = recentSearches[index];
        setSearchQuery(query);
        saveRecentSearch(query);
        const searchRoute = `/search?q=${encodeURIComponent(query)}`;
        navigate(searchRoute);
      } else if (index < recentSearches.length + popularSearches.length) {
        const query = popularSearches[index - recentSearches.length];
        setSearchQuery(query);
        saveRecentSearch(query);
        const searchRoute = `/search?q=${encodeURIComponent(query)}`;
        navigate(searchRoute);
      }
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    setShowSuggestions(true);
  };

  const handleInputBlur = (e) => {
    // Delay blur to allow clicking on suggestions
    setTimeout(() => {
      if (!searchRef.current?.contains(document.activeElement)) {
        setIsFocused(false);
      }
    }, 200);
  };

  // Rotate placeholders when not focused and input is empty


  const recentSearches = getRecentSearches();
  const hasSuggestions = suggestions.length > 0 || recentSearches.length > 0 || popularSearches.length > 0;

  return (
    <div className="w-full relative" ref={searchRef}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative group">
          <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors z-10" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "🎤 Listening... (Tap mic to stop)" : "Search products..."}
            className="w-full pl-12 pr-12 py-2 glass-card rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:shadow-glow transition-all duration-300 text-gray-700 placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            disabled={!isSupported && !isListening}
            className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-all duration-300 z-20 ${
              isListening 
              ? 'bg-red-500 text-white shadow-lg scale-110 animate-pulse' 
              : !isSupported
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-primary-500 hover:bg-primary-50'
            }`}
            title={!isSupported ? "Voice search is not supported in your browser" : "Voice Search"}
          >
            <FiMic className={`${isListening ? 'scale-110' : ''}`} />
          </button>
        </div>
      </form>

      {/* Voice Search Overlay Card */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center px-4 md:px-0"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-2xl flex flex-col items-center gap-4 max-w-[300px] w-full mx-auto text-center"
            >
              <div className="relative">
                {/* Pulsing Background Rings */}
                <motion.div
                  animate={{
                    scale: [1, 1.4, 1.8],
                    opacity: [0.3, 0.1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                  className="absolute inset-0 bg-primary-500 rounded-full"
                />
                
                {/* Main Mic Button Overlay */}
                <div className="relative z-10 w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-primary-200">
                  <FiMic className="text-3xl animate-bounce" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Speak Now</h3>
                <p className="text-gray-500 text-xs font-medium">Listening for your command...</p>
              </div>

              <div className="w-full bg-gray-50 p-3 rounded-2xl flex flex-wrap justify-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-full mb-0.5">Try saying</span>
                {['T-shirts', 'Jackets', 'Sneakers'].map((hint) => (
                  <span key={hint} className="px-2.5 py-0.5 bg-white border border-gray-100 rounded-full text-[10px] font-medium text-gray-600 shadow-sm">
                    "{hint}"
                  </span>
                ))}
              </div>

              <button
                onClick={stopListening}
                className="mt-1 text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Autocomplete Dropdown */}
      {showSuggestions && hasSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-96 overflow-y-auto"
        >
          {/* Product Suggestions */}
          {searchQuery.trim() && suggestions.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Products</div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <img
                    src={suggestion.image}
                    alt={suggestion.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-800">{suggestion.name}</p>
                    <p className="text-xs text-gray-600">${suggestion.price.toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {!searchQuery.trim() && recentSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiClock className="text-xs" />
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiClock className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular Searches */}
          {!searchQuery.trim() && popularSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiTrendingUp className="text-xs" />
                Popular Searches
              </div>
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(recentSearches.length + index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left ${selectedIndex === recentSearches.length + index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiTrendingUp className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {searchQuery.trim() && suggestions.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No products found for "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

