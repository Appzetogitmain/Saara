import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiChevronLeft,
  FiShield,
  FiRotateCcw,
  FiHeadphones,
  FiChevronDown,
  FiHome,
  FiChevronRight
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";
import HelpCenter from "./HelpCenter";

const PolicyPage = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const [dynamicPolicy, setDynamicPolicy] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  // Map legacy URLs to valid backend types
  const apiType = useMemo(() => {
    if (type === "return") return "refund-policy";
    if (type === "seller") return "seller-terms";
    if (type === "support") return "faq";
    return type;
  }, [type]);

  useEffect(() => {

    const fetchPolicy = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.get(`/policies/${apiType}`);
        const data = response?.data ?? response;
        setDynamicPolicy(data);
      } catch (err) {
        console.error("Failed to load policy:", err);
        setError("Unable to load policy. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPolicy();
  }, [apiType]);

  const formatLastUpdated = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return "";
    }
  };

  const title = useMemo(() => {
    switch (apiType) {
      case "privacy-policy": return "Privacy Policy";
      case "terms-conditions": return "Terms & Conditions";
      case "refund-policy": return "Refund Policy";
      case "seller-terms": return "Seller Terms & Conditions";
      case "faq": return "Frequently Asked Questions";
      default: return "Policy Details";
    }
  }, [apiType]);

  const icon = useMemo(() => {
    switch (apiType) {
      case "privacy-policy": return <FiShield className="text-3xl text-[#024d3e]" />;
      case "terms-conditions": return <FiShield className="text-3xl text-indigo-500" />;
      case "refund-policy": return <FiRotateCcw className="text-3xl text-pink-500" />;
      case "seller-terms": return <FiShield className="text-3xl text-[#024d3e]" />;
      case "faq": return <FiHeadphones className="text-3xl text-indigo-500" />;
      default: return <FiShield className="text-3xl text-gray-500" />;
    }
  }, [apiType]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-white pb-20">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="md:hidden bg-white px-4 py-4 sticky top-0 z-50 flex items-center gap-4 border-b border-gray-100 shadow-sm">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <FiChevronLeft className="text-2xl text-slate-800" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
        </div>

        {/* Content Section */}
        {apiType === "faq" && !isLoading && !error && dynamicPolicy ? (
          <HelpCenter dynamicPolicy={dynamicPolicy} />
        ) : (
          <div className="px-4 md:px-8 py-8 md:py-12 w-full max-w-[900px] mx-auto">
            {/* Desktop Breadcrumb (Hidden on Mobile) */}
            <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 mb-10">
              <Link to="/" className="flex items-center gap-1 hover:text-primary-600 transition-colors">
                <FiHome />
                <span>Home</span>
              </Link>
              <FiChevronRight className="text-slate-400" />
              <span className="font-semibold text-slate-900">{title}</span>
            </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-semibold animate-pulse">Loading policy content...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-sm">
              <p className="text-base font-bold text-red-700 mb-2">Error Loading Policy</p>
              <p className="text-sm text-red-500 font-medium">{error}</p>
            </div>
          ) : dynamicPolicy ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Document Header */}
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">{title}</h1>
                {dynamicPolicy.lastUpdated && (
                  <p className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
                    Updated {formatLastUpdated(dynamicPolicy.lastUpdated)}
                  </p>
                )}
              </div>
              
              <hr className="border-t-2 border-gray-100" />

              {/* Document Content */}
              {dynamicPolicy.content ? (
                <div 
                  className="text-base text-slate-600 leading-relaxed font-medium mt-8
                             [&>h1]:text-2xl [&>h1]:font-black [&>h1]:text-slate-900 [&>h1]:mt-10 [&>h1]:mb-5 [&>h1:first-child]:mt-0
                             [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-800 [&>h2]:mt-8 [&>h2]:mb-4 
                             [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-slate-800 [&>h3]:mt-6 [&>h3]:mb-3 
                             [&>p]:mb-5 [&>p:last-child]:mb-0
                             [&>b]:font-bold [&>b]:text-slate-800
                             [&>strong]:font-bold [&>strong]:text-slate-800
                             [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-6 [&>ul>li]:mb-2 [&>ul>li]:pl-2 [&>ul>li::marker]:text-primary-500
                             [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-6 [&>ol>li]:mb-2 [&>ol>li]:pl-2
                             [&>a]:text-primary-600 [&>a]:underline [&>a]:underline-offset-2 [&>a]:hover:text-primary-700 [&>a]:transition-colors"
                  dangerouslySetInnerHTML={{ __html: dynamicPolicy.content }}
                />
              ) : (
                <div className="text-center py-20 text-slate-500">
                  <FiShield className="text-4xl text-slate-200 mx-auto mb-4" />
                  <p className="font-semibold text-lg">No content available.</p>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="text-center py-20">
              <p className="text-lg font-bold text-slate-700">No content available.</p>
            </div>
          )}
        </div>
        )}

        {/* Footer Note */}
        <div className="px-8 py-10 mt-10 border-t border-gray-50 text-center bg-gray-50/50">
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            For more details or specific inquiries, please reach out to our legal department at legal@Porutkal.com
          </p>
        </div>
      </div>
    </PageTransition>
  );
};

export default PolicyPage;
