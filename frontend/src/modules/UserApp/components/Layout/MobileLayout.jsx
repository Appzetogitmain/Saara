import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import MobileHeader from './MobileHeader';
import DesktopHeader from './DesktopHeader';
import DesktopFooter from './DesktopFooter';
import MobileBottomNav from './MobileBottomNav';
import MobileCartBar from './MobileCartBar';
import CartDrawer from '../../../../shared/components/Cart/CartDrawer';
import useMobileHeaderHeight from '../../hooks/useMobileHeaderHeight';

const MobileLayout = ({ children, showBottomNav = true, showCartBar = true, showHeader = true }) => {
  const location = useLocation();
  const headerHeight = useMobileHeaderHeight();
  // Hide header and bottom nav on login, register, and verification pages
  const isAuthPage = location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/verification';

  const isCheckoutPage = location.pathname === '/checkout';
  const isAddressesPage = location.pathname === '/addresses';

  // Respect the showBottomNav prop and hide on auth pages
  const shouldShowBottomNav = showBottomNav && !isAuthPage;
  // Hide header on categories, search, wishlist, profile, and auth pages
  const shouldShowHeader = showHeader && !isAuthPage &&
    location.pathname !== '/categories' &&
    location.pathname !== '/search' &&
    location.pathname !== '/wishlist' &&
    location.pathname !== '/profile' &&
    location.pathname !== '/orders' &&
    !isAddressesPage &&
    !location.pathname.startsWith('/product/') &&
    !isCheckoutPage;

  // Ensure body scroll is restored when component mounts
  useEffect(() => {
    document.body.style.overflowY = '';
    return () => {
      document.body.style.overflowY = '';
    };
  }, []);

  const isDesktopHeaderVisible = !isAuthPage && !isCheckoutPage && !isAddressesPage;
  const mainStyle = shouldShowHeader ? { paddingTop: `${headerHeight}px` } : {};

  const shouldHideFooter = isAuthPage ||
    location.pathname === '/signup' ||
    location.pathname.startsWith('/reels') ||
    location.pathname === '/explore' ||
    location.pathname === '/profile';

  const isCategoriesPage = location.pathname === '/categories';

  return (
    <div className="min-h-screen flex flex-col">
      {isDesktopHeaderVisible && <DesktopHeader />}
      {shouldShowHeader && <MobileHeader />}
      <main
        className={`flex-grow w-full overflow-x-hidden max-w-[1440px] mx-auto px-0 md:px-8 lg:px-12 ${
          showCartBar 
            ? 'pb-24' 
            : (shouldShowBottomNav ? 'pb-14' : '')
        }`}
        style={mainStyle}
      >
        {children}
      </main>
      {!shouldHideFooter && <DesktopFooter />}
      {showCartBar && <MobileCartBar />}
      {shouldShowBottomNav && <MobileBottomNav />}
      <CartDrawer />
    </div>
  );
};

export default MobileLayout;

