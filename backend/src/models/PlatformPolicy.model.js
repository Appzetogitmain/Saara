import mongoose from 'mongoose';

const policyDetailSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  lastUpdated: { type: Date, default: Date.now }
}, { _id: false });

const platformPolicySchema = new mongoose.Schema(
  {
    privacy: { type: policyDetailSchema, default: () => ({ title: 'Privacy Policy' }) },
    refund: { type: policyDetailSchema, default: () => ({ title: 'Refund Policy' }) },
    terms: { type: policyDetailSchema, default: () => ({ title: 'Terms & Conditions' }) }
  },
  { timestamps: true }
);

const PlatformPolicy = mongoose.model('PlatformPolicy', platformPolicySchema);
export default PlatformPolicy;
