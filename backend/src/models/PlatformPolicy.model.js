import mongoose from 'mongoose';

const policyDetailSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

const faqItemSchema = new mongoose.Schema({
  category: { type: String, default: 'General' },
  question: { type: String, required: true },
  answer: { type: String, required: true }
}, { _id: false });

const faqSchema = new mongoose.Schema({
  title: { type: String, required: true },
  categories: { type: [String], default: ['General', 'Orders', 'Shipping', 'Returns', 'Payments', 'Account', 'Seller'] },
  items: { type: [faqItemSchema], default: [] },
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

const platformPolicySchema = new mongoose.Schema(
  {
    privacy: { type: policyDetailSchema, default: () => ({ title: 'Privacy Policy' }) },
    refund: { type: policyDetailSchema, default: () => ({ title: 'Refund Policy' }) },
    terms: { type: policyDetailSchema, default: () => ({ title: 'Terms & Conditions' }) },
    sellerTerms: { type: policyDetailSchema, default: () => ({ title: 'Seller Terms & Conditions' }) },
    faq: { type: faqSchema, default: () => ({ title: 'Frequently Asked Questions', items: [] }) }
  },
  { timestamps: true }
);

const PlatformPolicy = mongoose.model('PlatformPolicy', platformPolicySchema);
export default PlatformPolicy;
