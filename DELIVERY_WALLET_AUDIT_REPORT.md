# SAARA Multi-Vendor Marketplace: Delivery Wallet & COD Settlement Audit Report

This report presents a comprehensive end-to-end architectural, security, database, and logic audit of the Delivery Wallet, COD Settlement, Payouts, Withdrawals, Escrow, and Ledger implementations.

---

## 1. Features Working Correctly

The core components of the system are functionally coded and correctly integrated. Specifically:
- **Authentication & Role Authorization**: Protected routes correctly enforce `deliveryAuth` and `adminAuth` middleware. Delivery riders are restricted to their own profiles, while admins can perform adjustments and settle cash.
- **Rider Withdrawal Request (Dues Check)**: The logic correctly prevents withdrawals if the rider's COD liabilities (`cashInHand`) exceed their logistics earnings (`walletBalance`).
- **Admin Payout Flow State Machine**: Payout approvals and rejections correctly transition through `pending` ➔ `processing` ➔ `completed` / `rejected`. Double-approval and double-rejection preventions are atomically checked using `findOneAndUpdate`.
- **Rider Assignment & COD Cash Limits**: The rider auto-assignment logic correctly checks the rider capacity limits and blocks assignment of new COD orders if the rider's `cashInHand` exceeds the threshold (₹20,000), while correctly allowing online orders.
- **Frontend UI & State Integration**: 
  - The delivery rider's **Wallet Screen** displays `earningsBalance`, `codLiability`, and `availableWithdrawal`. The "Request Withdrawal" button is disabled if the dues check fails.
  - The Admin **Cash Settlement** screen displays riders with pending cash collections and triggers the settlement endpoint.
  - The Admin **Payouts & Adjustments** panel allows approving/rejecting withdrawals and posting penalties/bonuses.

---

## 2. Bugs Found

### B1: Incomplete Delivery OTP Cleanup on Completion
* **Location**: `backend/src/modules/delivery/controllers/order.controller.js` ➔ `updateDeliveryStatus`
* **Severity**: **MEDIUM**
* **Description**: When the delivery status is updated to `'delivered'`, the controller updates the OTP fields in memory:
  ```javascript
  order.deliveryOtpVerifiedAt = new Date();
  order.deliveryOtpHash = undefined;
  order.deliveryOtpExpiry = undefined;
  ...
  ```
  However, inside the transaction block, the database update is performed using a raw query with a hardcoded `$set` object that does **not** include these OTP fields:
  ```javascript
  const updateOrderResult = await Order.updateOne(
      { _id: order._id, deliveryPayoutProcessed: { $ne: true } },
      { 
          $set: { 
              status: 'delivered',
              deliveredAt: order.deliveredAt,
              vendorItems: order.vendorItems,
              deliveryPayoutProcessed: true, 
              deliveryPayoutProcessedAt: new Date() 
          } 
      },
      { session }
  );
  ```
  Since `order.save()` is only called in the `else` block (when status is NOT `'delivered'`), the OTP fields in memory are discarded, and they are never cleared in the database.
* **Impact**:
  1. The OTP hash and debug OTP remain in the database post-delivery (security risk).
  2. `deliveryOtpVerifiedAt` is never saved to the database.

### B2: Ledger Balance Sequence Inconsistency
* **Location**: `backend/src/modules/delivery/controllers/order.controller.js` ➔ `updateDeliveryStatus`
* **Severity**: **MEDIUM**
* **Description**: During delivery completion, both `DELIVERY_EARNING` and `COD_COLLECTION` ledger entries are written in a single transaction. However, the driver's balances are updated on the `boy` object first:
  ```javascript
  boy.walletBalance = parseFloat((boy.walletBalance + payout).toFixed(2));
  if (isCod) boy.cashInHand = parseFloat((boy.cashInHand + cashAmount).toFixed(2));
  await boy.save({ session });
  ```
  The subsequent `DELIVERY_EARNING` ledger entry is created with `cashInHandAfter: boy.cashInHand`. This new value already includes the COD collection amount. Consequently, the `DELIVERY_EARNING` entry records that cash in hand changed from `cashBefore` to `cashBefore + cashAmount`, which is incorrect because a delivery earning transaction does not collect cash.
* **Impact**: Financial statement ledger shows mathematically inconsistent sequential balances. Both transactions reflect the cash increase, making audit trails confusing.

---

## 3. Security Issues

### S1: Admin Order Status Updates Bypasses Delivery Boy Payouts & COD Liabilities
* **Location**: `backend/src/modules/admin/controllers/order.controller.js` ➔ `updateOrderStatus`
* **Severity**: **HIGH**
* **Description**: If an admin manually marks a pending/shipped order as `'delivered'` via the Admin Order status API, the status is directly updated to `'delivered'` in the database. However, this controller completely bypasses the delivery boy payout calculation, rider wallet credits, cash collection additions, and transaction ledger logging.
* **Impact**:
  1. The delivery rider is never paid for the delivery.
  2. If the order was COD, the rider's `cashInHand` is not updated, creating a mismatch between actual collected cash and the database.
  3. The rider's application will block them from completing the delivery themselves because the order is already `'delivered'`.

### S2: Missing Vendor Wallet Ledger Schema
* **Location**: `backend/src/models/` and `backend/src/modules/vendor/controllers/order.controller.js`
* **Severity**: **MEDIUM**
* **Description**: Unlike the delivery boy module which logs all wallet changes in `DeliveryWalletTransaction`, the vendor module has no dedicated transaction ledger. Vendor wallet balances, withdrawals, and settlements are updated directly on the `Vendor` document, and their history page is dynamically compiled from orders and settlements.
* **Impact**: Lack of a granular, immutable financial ledger for vendors. Administrative manual balance adjustments or fee changes cannot be audited reliably.

---

## 4. Race Condition Issues

### R1: Cash Settlement Concurrency (Negative Cash Collections & Security Bypass)
* **Location**: `backend/src/modules/admin/controllers/delivery.controller.js` ➔ `settleCash`
* **Severity**: **CRITICAL**
* **Description**: The cash settlement controller queries pending COD orders using `Order.find(baseFilter)` inside a transaction. In MongoDB, read queries inside transactions do not block concurrent reads on those documents. If an admin submits two concurrent settlement requests (or clicks the settle button twice rapidly), both requests can read the same pending orders concurrently.
  - Request 1 creates a `CashSettlement` record, marks the orders as settled, and decrements the driver's `cashInHand` by the total amount (e.g., from ₹10,000 to ₹0).
  - Request 2's `Order.updateMany` query blocks until Request 1 commits. Once Request 1 commits, Request 2's update query executes but modifies 0 documents (since they are already settled).
  - However, Request 2 does **not** verify that `modifiedCount === orderIds.length`. It proceeds to fetch the driver's fresh balance (which is now ₹0) and subtracts the settled amount *again*, saving the driver's `cashInHand` as **-₹10,000**.
* **Impact**:
  1. A rider's cash in hand can become negative.
  2. Duplicate `CashSettlement` and duplicate ledger entries are created.
  3. **Security Bypass**: Because the withdrawal dues check is `walletBalance - cashInHand`, a negative cash in hand value (e.g. -₹10,000) causes the available balance to *increase* (e.g. `5000 - (-10000) = 15000`). The rider can withdraw ₹15,000, which exceeds their actual wallet balance of ₹5,000, leading to theft/loss of funds.

### R2: Escrow Release Cron Concurrency & Crash Vulnerabilities
* **Location**: `backend/src/cron/escrowCron.js`
* **Severity**: **HIGH**
* **Description**: The escrow cron script does not use a MongoDB transaction session. While it uses an atomic `findOneAndUpdate` lock to set the order status to `'processing'` (preventing multiple cron instances from grabbing the same order), it writes to the database in an unsafe sequence:
  1. It transitions `escrowStatus` to `'released'` *before* it begins distributing funds to vendors (line 58).
  2. If the script crashes or the database disconnects during the vendor payout loop, the order remains `'released'`, but the vendors never receive their earnings.
  3. If a database save fails during the loop, the catch block tries to roll back the order status:
     ```javascript
     await Order.updateOne(
         { _id: order._id, escrowStatus: 'processing' },
         { $set: { escrowStatus: 'held' } }
     );
     ```
     This rollback query fails because the order's `escrowStatus` is already `'released'` rather than `'processing'`. The order is stuck in `'released'` state, and on the next run, it won't be picked up again, causing permanent vendor earnings loss. If there are multiple vendors on the order and it fails halfway, a retry could pay the first vendor twice.

---

## 5. Missing Frontend Integration

- **Withdrawal Settings Validation**: The frontend payout settings form allows entering UPI IDs and bank details without formatting validations (such as checking IFSC regex or bank account number matching).

---

## 6. Missing Backend Integration

- **Sync Admin Order Delivery**: When an admin marks an order as delivered, there is no system hook or shared service to invoke the delivery boy payout transaction.

---

## 7. Database Problems

### D1: Inconsistent Mongoose Schema Enum in Order Model for Escrow Status
* **Location**: `backend/src/models/Order.model.js` vs `backend/src/cron/escrowCron.js`
* **Severity**: **HIGH**
* **Description**: The `Order` schema defines the `escrowStatus` enum as:
  `enum: ["held", "release_pending", "released", "refund_processing", "refunded"]`
  However, the escrow cron job `escrowCron.js` sets the order's `escrowStatus` to `'processing'` to reserve it:
  ```javascript
  const reservedOrder = await Order.findOneAndUpdate(
      { _id: order._id, escrowStatus: 'held' },
      { $set: { escrowStatus: 'processing' } }, // NOT IN ENUM!
      { new: true }
  );
  ```
* **Impact**: Mongoose validators will fail when saving or verifying the document, and data values in MongoDB violate the schema's enum constraints.

---

## 8. Summary Severity Table

| Ref | Issue Description | Severity | Impact Area |
| :--- | :--- | :--- | :--- |
| **R1** | Cash Settlement Concurrency (Negative Cash collection & available balance inflation) | **CRITICAL** | Financial Ledger & Cash Theft |
| **R2** | Escrow Release Cron lack of Transaction & Unsafe state transition sequence | **HIGH** | Vendor Payouts / Cash Loss |
| **S1** | Admin Order Status change bypasses Delivery Payout & COD Liability updates | **HIGH** | Payout logic bypass |
| **D1** | Mongoose Schema Enum mismatch for `escrowStatus` (`'processing'` missing) | **HIGH** | DB Validation Failures |
| **B1** | Complete Delivery OTP Cleanup is never written to the DB | **MEDIUM** | Security / DB Inconsistency |
| **B2** | Ledger sequential balance calculations are out of order | **MEDIUM** | Financial Auditing |
| **S2** | Missing Vendor Wallet Transaction Ledger | **MEDIUM** | Vendor Financial Audits |

---

## 9. Recommended Fixes

### Fix for R1 (Cash Settlement Concurrency)
Modify the update step in `settleCash` to enforce that only unsettled orders are modified, and abort the transaction if the count does not match:
```javascript
// Ensure only unsettled orders are matched
const result = await Order.updateMany(
    { _id: { $in: orderIds }, isCashSettled: { $ne: true } },
    {
        $set: { isCashSettled: true, settledAt: new Date(), cashSettlementId: settlement._id }
    },
    { session }
);

// If another process settled them in the meantime, abort the transaction
if (result.modifiedCount !== orderIds.length) {
    throw new Error('Some orders in this session have already been settled.');
}
```

### Fix for R2 (Escrow Release Cron)
Wrap the entire eligible order evaluation and vendor payout loop inside a MongoDB transaction session. Also, only update the order's `escrowStatus` to `'released'` *after* all vendors have been successfully paid:
```javascript
const session = await mongoose.startSession();
try {
    await session.withTransaction(async () => {
        // 1. Reserve the order
        const reservedOrder = await Order.findOneAndUpdate(
            { _id: order._id, escrowStatus: 'held' },
            { $set: { escrowStatus: 'processing' } },
            { session, new: true }
        );
        if (!reservedOrder) return;

        // 2. Perform return checks & calculate payouts...
        
        // 3. Update vendor balances & create Settlements...

        // 4. Finally mark order escrow as released
        await Order.updateOne(
            { _id: order._id },
            { $set: { escrowStatus: 'released' } },
            { session }
        );
    });
} finally {
    await session.endSession();
}
```

### Fix for D1 (Mongoose Schema Enum)
Add `'processing'` to the `escrowStatus` enum array in `backend/src/models/Order.model.js`:
```javascript
escrowStatus: {
    type: String,
    enum: ["held", "processing", "release_pending", "released", "refund_processing", "refunded"],
    default: "held"
}
```

### Fix for B1 (Delivery Completion OTP Cleanup)
Include the OTP clear fields inside the `$set` (or `$unset`) object of the atomic `Order.updateOne` query inside `updateDeliveryStatus`.

### Fix for B2 (Ledger Sequence)
Record the ledger sequential balances correctly by logging them in their execution order in the code or updating ledger balances manually before writing the database updates.

### Fix for S1 (Sync Admin Order Delivery)
Extract the delivery boy payout and COD liability update logic from `updateDeliveryStatus` into a shared utility/service function (e.g. `processDeliveryBoyPayout(orderId, session)`). Invoke this service inside both `updateDeliveryStatus` (for delivery boy app completions) and `updateOrderStatus` (for admin manual completions).
