import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Terms & Conditions

Last updated: ${new Date().toLocaleDateString()}

1. Acceptance of Terms
By accessing or using our services, you agree to be bound by these Terms and Conditions.

2. User Responsibilities
You are responsible for maintaining the confidentiality of your account and password and for restricting access to your computer.

3. Prohibited Activities
You agree not to use the service for any illegal or unauthorized purpose.

4. Intellectual Property
All content included on this site, such as text, graphics, logos, images, is the property of the company or its content suppliers.

5. Limitation of Liability
We shall not be liable for any indirect, incidental, special, consequential or punitive damages.`;

const TermsConditions = () => {
  return (
    <PolicyEditor 
      title="Terms & Conditions" 
      policyKey="terms" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default TermsConditions;
