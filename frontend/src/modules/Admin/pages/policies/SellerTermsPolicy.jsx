import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Seller Terms & Conditions

Last updated: ${new Date().toLocaleDateString()}

1. Vendor Registration
By registering as a seller on our platform, you agree to comply with all platform rules and local laws.

2. Product Listings
All products listed must be authentic, accurately described, and available for dispatch within the specified SLA.

3. Fees and Commissions
We deduct a standard commission from every successful sale as outlined in your seller agreement.

4. Settlement
Payments will be processed on a weekly basis for all completed orders.

5. Termination
We reserve the right to suspend or terminate seller accounts that violate these terms or receive excessive customer complaints.`;

const SellerTermsPolicy = () => {
  return (
    <PolicyEditor 
      title="Seller Terms & Conditions" 
      policyKey="seller-terms" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default SellerTermsPolicy;
