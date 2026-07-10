import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiGrid,
  FiTag,
  FiUsers,
  FiPackage,
  FiTrendingUp,
  FiImage,
  FiMessageSquare,
  FiBarChart2,
  FiFileText,
} from 'react-icons/fi';

const More = () => {
  const navigate = useNavigate();

  const menuItems = [
    { 
      path: '/admin/categories', 
      label: 'Categories', 
      icon: FiGrid, 
      gradient: 'from-blue-500 via-blue-600 to-blue-700',
      lightGradient: 'from-blue-50 via-blue-100/80 to-blue-50',
      shadowColor: 'shadow-blue-500/20',
      hoverShadow: 'hover:shadow-blue-500/30',
      description: 'Manage categories'
    },
    { 
      path: '/admin/brands', 
      label: 'Brands', 
      icon: FiTag, 
      gradient: 'from-purple-500 via-purple-600 to-purple-700',
      lightGradient: 'from-purple-50 via-purple-100/80 to-purple-50',
      shadowColor: 'shadow-purple-500/20',
      hoverShadow: 'hover:shadow-purple-500/30',
      description: 'Manage brands'
    },
    { 
      path: '/admin/customers', 
      label: 'Customers', 
      icon: FiUsers, 
      gradient: 'from-emerald-500 via-emerald-600 to-emerald-700',
      lightGradient: 'from-emerald-50 via-emerald-100/80 to-emerald-50',
      shadowColor: 'shadow-emerald-500/20',
      hoverShadow: 'hover:shadow-emerald-500/30',
      description: 'View customers'
    },
    { 
      path: '/admin/inventory', 
      label: 'Inventory', 
      icon: FiPackage, 
      gradient: 'from-orange-500 via-orange-600 to-orange-700',
      lightGradient: 'from-orange-50 via-orange-100/80 to-orange-50',
      shadowColor: 'shadow-orange-500/20',
      hoverShadow: 'hover:shadow-orange-500/30',
      description: 'Track inventory'
    },
    { 
      path: '/admin/campaigns', 
      label: 'Campaigns', 
      icon: FiTrendingUp, 
      gradient: 'from-rose-500 via-rose-600 to-rose-700',
      lightGradient: 'from-rose-50 via-rose-100/80 to-rose-50',
      shadowColor: 'shadow-rose-500/20',
      hoverShadow: 'hover:shadow-rose-500/30',
      description: 'Create campaigns'
    },
    { 
      path: '/admin/marketing/home-content', 
      label: 'Home Content', 
      icon: FiImage, 
      gradient: 'from-pink-500 via-pink-600 to-pink-700',
      lightGradient: 'from-pink-50 via-pink-100/80 to-pink-50',
      shadowColor: 'shadow-pink-500/20',
      hoverShadow: 'hover:shadow-pink-500/30',
      description: 'Manage home page content sections'
    },
    { 
      path: '/admin/reviews', 
      label: 'Reviews', 
      icon: FiMessageSquare, 
      gradient: 'from-amber-500 via-amber-600 to-amber-700',
      lightGradient: 'from-amber-50 via-amber-100/80 to-amber-50',
      shadowColor: 'shadow-amber-500/20',
      hoverShadow: 'hover:shadow-amber-500/30',
      description: 'Moderate reviews'
    },
    { 
      path: '/admin/analytics', 
      label: 'Analytics', 
      icon: FiBarChart2, 
      gradient: 'from-indigo-500 via-indigo-600 to-indigo-700',
      lightGradient: 'from-indigo-50 via-indigo-100/80 to-indigo-50',
      shadowColor: 'shadow-indigo-500/20',
      hoverShadow: 'hover:shadow-indigo-500/30',
      description: 'View analytics'
    },
    { 
      path: '/admin/content', 
      label: 'Content', 
      icon: FiFileText, 
      gradient: 'from-cyan-500 via-cyan-600 to-cyan-700',
      lightGradient: 'from-cyan-50 via-cyan-100/80 to-cyan-50',
      shadowColor: 'shadow-cyan-500/20',
      hoverShadow: 'hover:shadow-cyan-500/30',
      description: 'Manage content'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 sm:space-y-6"
    >
      {/* Header */}
      <div className="px-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5">More</h1>
        <p className="text-sm sm:text-base text-gray-500">Access additional admin features</p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ 
                delay: index * 0.05,
                type: 'spring',
                stiffness: 200,
                damping: 20
              }}
              onClick={() => navigate(item.path)}
              className="group relative overflow-hidden"
            >
              <div className={`
                relative h-full
                flex flex-col items-center justify-center
                p-3 sm:p-6
                bg-white
                rounded-2xl sm:rounded-3xl
                border border-gray-100/80
                ${`bg-gradient-to-br ${item.lightGradient}`}
                ${item.shadowColor} ${item.hoverShadow}
                shadow-md sm:shadow-lg hover:shadow-2xl
                transition-all duration-500 ease-out
                active:scale-[0.96]
                hover:border-transparent
                overflow-hidden
              `}>
                {/* Animated Background Gradient */}
                <div className={`
                  absolute inset-0
                  bg-gradient-to-br ${item.gradient}
                  opacity-0 group-hover:opacity-10
                  transition-opacity duration-500
                `} />

                {/* Decorative Circles */}
                <div className="absolute -top-6 -right-6 sm:-top-8 sm:-right-8 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Icon Container with Enhanced Design */}
                <div className={`
                  relative z-10
                  w-12 h-12 sm:w-20 sm:h-20
                  rounded-xl sm:rounded-3xl
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center
                  mb-2 sm:mb-4
                  ${item.shadowColor}
                  shadow-lg sm:shadow-xl group-hover:shadow-2xl
                  group-hover:scale-110 group-hover:rotate-3
                  transition-all duration-500 ease-out
                  before:absolute before:inset-0
                  before:bg-gradient-to-br before:from-white/20 before:to-transparent
                  before:rounded-xl sm:before:rounded-3xl
                `}>
                  <Icon className="text-white text-lg sm:text-3xl relative z-10" strokeWidth={2.5} />
                  
                  {/* Shine Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                {/* Content */}
                <div className="relative z-10 text-center space-y-0.5 sm:space-y-1">
                  <h3 className="text-xs sm:text-base font-bold text-gray-900 group-hover:text-gray-950 transition-colors duration-300 leading-tight">
                    {item.label}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 group-hover:text-gray-600 transition-colors duration-300 leading-tight">
                    {item.description}
                  </p>
                </div>

                {/* Bottom Accent Line */}
                <div className={`
                  absolute bottom-0 left-0 right-0
                  h-0.5 sm:h-1
                  bg-gradient-to-r ${item.gradient}
                  transform scale-x-0 group-hover:scale-x-100
                  transition-transform duration-500 ease-out
                  origin-left
                `} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default More;

