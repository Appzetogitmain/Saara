import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Privacy Policy

Last updated: ${new Date().toLocaleDateString()}

1. Information We Collect
We collect information that you provide directly to us, including when you create an account, make a purchase, or contact us for support.

2. How We Use Your Information
We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.

3. Information Sharing
We do not sell, trade, or rent your personal information to third parties without your consent.

4. Data Security
We implement appropriate security measures to protect your personal information.

5. Your Rights
You have the right to access, update, or delete your personal information at any time.`;

const PrivacyPolicy = () => {
  return (
    <PolicyEditor 
      title="Privacy Policy" 
      policyKey="privacy" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default PrivacyPolicy;
