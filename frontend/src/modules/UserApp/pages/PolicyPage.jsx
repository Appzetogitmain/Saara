import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiChevronLeft,
  FiShield,
  FiRotateCcw,
  FiHeadphones,
} from "react-icons/fi";
import { motion } from "framer-motion";
import PageTransition from "../../../shared/components/PageTransition";

const POLICY_CONTENT = {
  seller: {
    title: "Seller Policy",
    icon: <FiShield className="text-3xl text-[#024d3e]" />,
    content: [
      {
        heading: "Verification & Standards",
        text: "Every seller on our platform undergoes a rigorous verification process. We ensure that all products sold are authentic and meet our high-quality standards.",
      },
      {
        heading: "Shipping & Fulfillment",
        text: "Sellers are committed to dispatching orders within 24-48 hours. You will receive tracking updates as soon as the package leaves the warehouse.",
      },
      {
        heading: "Seller Responsibility",
        text: "The seller is responsible for the accuracy of product descriptions, professional packaging, and ensuring items match the listed specifications.",
      },
    ],
  },
  return: {
    title: "Return Policy",
    icon: <FiRotateCcw className="text-3xl text-pink-500" />,
    content: [
      {
        heading: "7-Day Return Window",
        text: "We offer a hassle-free 7-day return policy for most items. If you're not satisfied, you can initiate a return directly from the 'My Orders' section.",
      },
      {
        heading: "Condition for Returns",
        text: "Items must be returned in their original packaging, with all tags intact and in unused condition to qualify for a full refund.",
      },
      {
        heading: "Refund Process",
        text: "Once the item is picked up and verified, the refund will be initiated to your original payment method within 3-5 business days.",
      },
    ],
  },
  support: {
    title: "Support Policy",
    icon: <FiHeadphones className="text-3xl text-indigo-500" />,
    content: [
      {
        heading: "24/7 Availability",
        text: "Our customer support team is available round the clock to assist you with any queries regarding orders, payments, or product information.",
      },
      {
        heading: "Response Time",
        text: "We aim to respond to all chat queries within 5 minutes and email support tickets within 4 hours during business days.",
      },
      {
        heading: "Escalation Matrix",
        text: "If your issue remains unresolved for more than 24 hours, it is automatically escalated to our senior management for priority resolution.",
      },
    ],
  },
};

const PolicyPage = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const data = POLICY_CONTENT[type] || POLICY_CONTENT["seller"];

  return (
    <PageTransition>
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="bg-white px-4 py-4 sticky top-0 z-50 flex items-center gap-4 border-b border-gray-100">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors"
          >
            <FiChevronLeft className="text-2xl text-slate-800" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">{data.title}</h1>
        </div>

        {/* Hero Section */}
        <div className="bg-white px-6 py-10 flex flex-col items-center text-center border-b border-gray-100">
          <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
            {data.icon}
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">
            Our Commitment
          </h2>
          <p className="text-sm text-slate-500 max-w-[280px]">
            Ensuring a safe, transparent, and premium shopping experience for
            you.
          </p>
        </div>

        {/* Content Section */}
        <div className="px-4 py-8 space-y-6">
          {data.content.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
            >
              <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                {item.heading}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="px-8 py-6 text-center">
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            For more details or specific inquiries, please reach out to our
            legal department at legal@Porutkal.com
          </p>
        </div>
      </div>
    </PageTransition>
  );
};

export default PolicyPage;
