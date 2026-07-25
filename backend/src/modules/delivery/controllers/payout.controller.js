import asyncHandler from "../../../utils/asyncHandler.js";
import ApiResponse from "../../../utils/ApiResponse.js";
import ApiError from "../../../utils/ApiError.js";
import DeliveryBoy from "../../../models/DeliveryBoy.model.js";
import DeliveryWithdrawal from "../../../models/DeliveryWithdrawal.model.js";
import DeliveryWalletTransaction from "../../../models/DeliveryWalletTransaction.model.js";
import Admin from "../../../models/Admin.model.js";
import { createNotification } from "../../../services/notification.service.js";
import mongoose from "mongoose";
import Settings from "../../../models/Settings.model.js";

/**
 * @desc    Get delivery boy wallet summary
 * @route   GET /api/delivery/wallet/summary
 * @access  Private (Delivery Boy)
 */
export const getWalletSummary = asyncHandler(async (req, res) => {
  const boy = await DeliveryBoy.findById(req.user.id).select(
    "+payoutMethodDetails",
  );
  if (!boy) throw new ApiError(404, "Driver profile not found.");

  const earningsBalance = parseFloat((boy.walletBalance || 0).toFixed(2));
  const codLiability = parseFloat((boy.cashInHand || 0).toFixed(2));
  // T5.3: Clamp to 0 — negative display is confusing; the withdrawal guard at requestWithdrawal
  // already correctly prevents withdrawals when codLiability > earningsBalance.
  const availableWithdrawal = parseFloat(
    Math.max(0, earningsBalance - codLiability).toFixed(2),
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        earningsBalance,
        codLiability,
        availableWithdrawal,
        payoutMethodDetails: boy.payoutMethodDetails || null,
      },
      "Wallet summary retrieved successfully.",
    ),
  );
});

/**
 * @desc    Request withdrawal of earnings
 * @route   POST /api/delivery/wallet/withdraw
 * @access  Private (Delivery Boy)
 */
export const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const reqAmount = parseFloat(Number(amount).toFixed(2));

  if (isNaN(reqAmount) || reqAmount <= 0) {
    throw new ApiError(400, "Please enter a valid amount.");
  }

  const MIN_WITHDRAWAL = 100;
  if (reqAmount < MIN_WITHDRAWAL) {
    throw new ApiError(400, `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}.`);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // IDEMPOTENCY GUARD: prevent concurrent duplicate withdrawals
      const existingPending = await DeliveryWithdrawal.findOne({
        deliveryBoyId: req.user.id,
        status: { $in: ["pending", "processing"] },
      })
        .session(session)
        .lean();
      if (existingPending) {
        throw new ApiError(
          409,
          "You already have a pending withdrawal request. Please wait for it to be processed.",
        );
      }

      const boy = await DeliveryBoy.findById(req.user.id)
        .select("+payoutMethodDetails")
        .session(session);
      if (!boy) throw new ApiError(404, "Driver profile not found.");

      if (
        !boy.payoutMethodDetails ||
        (!boy.payoutMethodDetails.upiId &&
          !boy.payoutMethodDetails.bankDetails?.accountNumber)
      ) {
        throw new ApiError(
          400,
          "Please set up your bank account or UPI ID details first before requesting withdrawal.",
        );
      }

      const available = parseFloat(
        (boy.walletBalance - boy.cashInHand).toFixed(2),
      );
      if (reqAmount > available) {
        throw new ApiError(
          400,
          `Dues check failed. Available: ₹${available} (Wallet: ₹${boy.walletBalance}, Cash: ₹${boy.cashInHand}). Please clear your COD dues first.`,
        );
      }

      const walletBefore = boy.walletBalance;
      const cashBefore = boy.cashInHand;

      // Update balance
      boy.walletBalance = parseFloat(
        (boy.walletBalance - reqAmount).toFixed(2),
      );
      await boy.save({ session });

      // Create withdrawal request
      const [withdrawal] = await DeliveryWithdrawal.create(
        [
          {
            deliveryBoyId: req.user.id,
            amount: reqAmount,
            payoutMethodDetails: boy.payoutMethodDetails,
          },
        ],
        { session },
      );

      // Log ledger transaction
      await DeliveryWalletTransaction.create(
        [
          {
            deliveryBoyId: req.user.id,
            type: "WITHDRAWAL",
            amount: -reqAmount,
            referenceId: `WITHDRAWAL_REQUEST_${withdrawal._id}`,
            performedBy: { role: "delivery_boy", id: req.user.id },
            walletBalanceBefore: walletBefore,
            walletBalanceAfter: boy.walletBalance,
            cashInHandBefore: cashBefore,
            cashInHandAfter: boy.cashInHand,
            notes: `Withdrawal request of ₹${reqAmount} submitted (Ref: #${withdrawal._id})`,
          },
        ],
        { session },
      );

      // Notify active Admins about new payout request
      const admins = await Admin.find({ isActive: true }).session(session).select("_id");
      const methodText = boy.payoutMethodDetails?.method === "upi" ? "UPI" : "Bank Transfer";
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            recipientId: admin._id,
            recipientType: "admin",
            title: "New Payout Withdrawal Request",
            message: `${boy.name} requested a withdrawal of ₹${reqAmount} via ${methodText}.`,
            type: "system",
            data: {
              withdrawalId: String(withdrawal._id),
              deliveryBoyId: String(req.user.id),
              amount: reqAmount,
            },
          })
        )
      );
    });
  } finally {
    await session.endSession();
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, null, "Withdrawal request submitted successfully."),
    );
});

/**
 * @desc    Set or update payout method details
 * @route   PUT /api/delivery/wallet/payout-settings
 * @access  Private (Delivery Boy)
 */
export const updatePayoutSettings = asyncHandler(async (req, res) => {
  const { method, bankDetails, upiId } = req.body;

  if (!method || !["bank", "upi"].includes(method)) {
    throw new ApiError(400, 'Payout method must be either "bank" or "upi".');
  }

  if (method === "upi") {
    if (!upiId) {
      throw new ApiError(400, "UPI ID is required for UPI payout method.");
    }
    // T3.1: Validate UPI ID format (e.g. name@bank) to catch invalid entries before payout fails
    const upiRegex = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upiId.trim())) {
      throw new ApiError(400, 'Invalid UPI ID format. Expected format: name@bank (e.g. john@upi, 9876543210@paytm).');
    }
  }

  if (method === "bank") {
    if (
      !bankDetails ||
      !bankDetails.accountHolder ||
      !bankDetails.accountNumber ||
      !bankDetails.ifsc ||
      !bankDetails.bankName
    ) {
      throw new ApiError(
        400,
        "All bank details (holder, account number, IFSC, bank name) are required.",
      );
    }
  }

  const payoutMethodDetails = {
    method,
    upiId: method === "upi" ? upiId : undefined,
    bankDetails: method === "bank" ? bankDetails : undefined,
  };

  const boy = await DeliveryBoy.findByIdAndUpdate(
    req.user.id,
    { $set: { payoutMethodDetails } },
    { new: true },
  ).select("+payoutMethodDetails");

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        boy.payoutMethodDetails,
        "Payout details updated successfully.",
      ),
    );
});

/**
 * @desc    Get ledger transactions list for current driver
 * @route   GET /api/delivery/wallet/transactions
 * @access  Private (Delivery Boy)
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const list = await DeliveryWalletTransaction.find({
    deliveryBoyId: req.user.id,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("orderId", "orderId total paymentMethod");

  const total = await DeliveryWalletTransaction.countDocuments({
    deliveryBoyId: req.user.id,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        transactions: list,
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        totalCount: total,
      },
      "Wallet transactions retrieved successfully.",
    ),
  );
});

/**
 * @desc    Get company payment transfer details for cash deposit/settlement
 * @route   GET /api/delivery/wallet/company-payment-details
 * @access  Private (Delivery Boy)
 */
export const getCompanyPaymentDetails = asyncHandler(async (req, res) => {
  const settings = await Settings.findOne({ key: "company_payment_details" });
  const defaultDetails = {
    upiId: "Porutkal.pay@upi",
    accountName: "Porutkal LOGISTICS PVT LTD",
    accountNumber: "50200081729012",
    bankName: "HDFC Bank",
    ifscCode: "HDFC0000103",
  };
  const details = settings?.value || defaultDetails;
  res
    .status(200)
    .json(new ApiResponse(200, details, "Company payment details fetched."));
});
