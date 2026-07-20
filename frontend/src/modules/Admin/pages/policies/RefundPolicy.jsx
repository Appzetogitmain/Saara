import PolicyEditor from './PolicyEditor';

const DEFAULT_CONTENT = `Refund Policy

Last updated: ${new Date().toLocaleDateString()}

1. Return Window
You have 7 days to return an item from the date you received it.

2. Eligibility for Returns
To be eligible for a return, your item must be unused and in the same condition that you received it. Your item must be in the original packaging.

3. Refund Process
Once we receive your item, we will inspect it and notify you that we have received your returned item. If your return is approved, we will initiate a refund to your original method of payment.

4. Exceptions
Certain items cannot be returned, including perishable goods, custom products, and personal care goods.`;

const RefundPolicy = () => {
  return (
    <PolicyEditor 
      title="Refund Policy" 
      policyKey="refund" 
      defaultContent={DEFAULT_CONTENT} 
    />
  );
};

export default RefundPolicy;
