import React from "react";
import { Link } from "react-router-dom";
import {
  FiFacebook,
  FiInstagram,
  FiTwitter,
  FiArrowRight,
} from "react-icons/fi";
import { useSettingsStore } from "../../../../shared/store/settingsStore";

const DesktopFooter = () => {
  const { settings } = useSettingsStore();
  const general = settings?.general || {};

  return (
    <footer className="hidden lg:block bg-slate-900 text-slate-300 border-t border-slate-800 pt-16 pb-8 w-full mt-auto">
      <div className="max-w-[1440px] mx-auto px-8 lg:px-16 xl:px-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
        {/* Brand Column */}
        <div className="space-y-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-white uppercase">
              {general.storeName || "Porutkal"}
            </span>
            <span className="w-2 h-2 rounded-full bg-pink-500 mt-1.5" />
          </Link>
          <p className="text-sm text-slate-400 font-medium leading-relaxed">
            {general.storeDescription || "Your premium marketplace for multi-vendor apparel, beauty, electronics, and fashion accessories."}
          </p>
          {(general.contactEmail || general.contactPhone || general.address) && (
            <div className="text-xs space-y-1.5 text-slate-400 font-medium pt-1">
              {general.contactEmail && (
                <p>Email: <a href={`mailto:${general.contactEmail}`} className="hover:text-white transition-colors">{general.contactEmail}</a></p>
              )}
              {general.contactPhone && (
                <p>Phone: <a href={`tel:${general.contactPhone}`} className="hover:text-white transition-colors">{general.contactPhone}</a></p>
              )}
              {general.address && (
                <p>Address: <span className="text-slate-400">{general.address}</span></p>
              )}
            </div>
          )}
          <div className="flex gap-4">
            {[
              { icon: FiFacebook, link: general.socialMedia?.facebook || "#" },
              { icon: FiInstagram, link: general.socialMedia?.instagram || "#" },
              { icon: FiTwitter, link: general.socialMedia?.twitter || "#" },
            ].map((social, idx) => (
              <a
                key={idx}
                href={social.link}
                target={social.link !== "#" ? "_blank" : undefined}
                rel={social.link !== "#" ? "noopener noreferrer" : undefined}
                className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-white transition-all duration-300"
              >
                <social.icon className="text-lg" />
              </a>
            ))}
          </div>
        </div>

        {/* Categories Column */}
        <div className="space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Shop Categories
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "Men's Apparel", path: "/categories" },
              { name: "Women's Fashion", path: "/categories" },
              { name: "Beauty & Grooming", path: "/categories" },
              { name: "Gadgets & Gear", path: "/categories" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Support Column */}
        <div className="space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Customer Care
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "Help Center", path: "/policy/faq" },
              { name: "Frequently Asked Questions", path: "/policy/faq" },
              { name: "Returns & Refund Policy", path: "/policy/refund-policy" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal Column */}
        <div className="space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Legal
          </h4>
          <ul className="space-y-3 text-sm font-medium">
            {[
              { name: "Privacy Policy", path: "/policy/privacy-policy" },
              { name: "Terms & Conditions", path: "/policy/terms-conditions" },
              { name: "Seller Terms & Conditions", path: "/policy/seller-terms" },
            ].map((link, idx) => (
              <li key={idx}>
                <Link
                  to={link.path}
                  className="hover:text-white hover:underline transition-all"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Newsletter / Contact Column */}
        <div className="space-y-6">
          <h4 className="text-sm font-bold uppercase text-white tracking-widest">
            Join Our Newsletter
          </h4>
          <p className="text-sm text-slate-400 font-medium">
            Subscribe to get notifications about new releases, special sales,
            and vendor events.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Your email address"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white transition-all"
            />
            <button className="px-5 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center">
              <FiArrowRight />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="max-w-[1440px] mx-auto px-8 lg:px-16 xl:px-20 mt-16 pt-8 border-t border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-6">
        <p className="text-xs text-slate-500 font-semibold text-center lg:text-left">
          © {new Date().getFullYear()} Porutkal Marketplace. All rights
          reserved. Developed with ❤️.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-slate-500 font-bold uppercase tracking-wider">
          <Link to="/policy/privacy-policy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link to="/policy/terms-conditions" className="hover:text-white transition-colors">
            Terms & Conditions
          </Link>
          <Link to="/policy/refund-policy" className="hover:text-white transition-colors">
            Refund Policy
          </Link>
          <Link to="/policy/seller-terms" className="hover:text-white transition-colors">
            Seller Terms & Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default DesktopFooter;
