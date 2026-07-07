import fs from 'fs';

const filePath = 'backend/src/modules/vendor/controllers/return.controller.js';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF for reliable string replacement
let normalized = content.replace(/\r\n/g, '\n');

// 1. Helper functions replacement
const helperSearch = `const enrichReturnItems = (request) => {`;
const helperReplace = `const getVariantKeyFromVariant = (variant) => {
    if (!variant) return '';
    const size = variant.size ? String(variant.size).trim().toLowerCase() : '';
    const color = variant.color ? String(variant.color).trim().toLowerCase() : '';
    if (size && color) return \`\${size}|\${color}\`;
    return size || color || '';
};

const getOrderItemIdentifier = (item) => {
    if (item.orderItemId) return String(item.orderItemId);
    if (item._id) return String(item._id);
    const variantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
    if (variantKey) return \`\${String(item.productId)}_\${variantKey}\`;
    return String(item.productId);
};

const findMatchingOrderItem = (retItem, orderItems, matchedTrack = new Set()) => {
    const candidates = orderItems.filter(item => String(item.productId) === String(retItem.productId));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 1. Prefer orderItemId
    if (retItem.orderItemId) {
        const match = candidates.find(item => String(item._id) === String(retItem.orderItemId) || String(item.orderItemId) === String(retItem.orderItemId));
        if (match) return match;
    }

    // 2. Fallback: productId + variantKey
    const retVariantKey = retItem.variantKey || (retItem.variant ? getVariantKeyFromVariant(retItem.variant) : '');
    if (retVariantKey) {
        const match = candidates.find(item => {
            const itemVariantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
            return itemVariantKey === retVariantKey;
        });
        if (match) return match;
    }

    // 3. Last fallback: Try to match any candidate not fully matched in matchedTrack
    for (const candidate of candidates) {
        const key = String(candidate._id);
        if (!matchedTrack.has(key)) {
            return candidate;
        }
    }
    return candidates[0];
};

const enrichReturnItems = (request) => {`;

if (!normalized.includes(helperSearch)) {
    console.error("Could not find helperSearch target!");
    process.exit(1);
}
normalized = normalized.replace(helperSearch, helperReplace);

// 2. Status update block replacement
const blockSearch = `                    // Mark full order returned/refunded only when every vendor in this order completed returns.
                    const completedReturns = await ReturnRequest.find({
                        orderId: order._id,
                        status: 'completed',
                    })
                        .select('vendorId')
                        .lean();

                    const completedVendorSet = new Set(
                        completedReturns.map((entry) => String(entry?.vendorId || '')).filter(Boolean)
                    );
                    completedVendorSet.add(String(req.user.id));

                    const allVendorsCompleted =
                        uniqueVendorIds.length > 0 && uniqueVendorIds.every((vendorId) => completedVendorSet.has(vendorId));

                    if (allVendorsCompleted || isSingleVendorOrder) {
                        if (order.status !== 'cancelled') {
                            order.status = 'returned';
                        }
                        order.paymentStatus = 'refunded';
                        order.escrowStatus = 'refunded';
                        await order.save();
                    }`;

const blockReplace = `                    // 1. Retrieve all completed ReturnRequests for the order
                    const completedReturnRequests = await ReturnRequest.find({
                        orderId: order._id,
                        status: 'completed',
                        _id: { $ne: request._id }
                    });
                    const allOrderCompletedReturns = [...completedReturnRequests, request];

                    // 2. Build a returned quantity map using the same identifier as the order items
                    const returnedQuantitiesMap = {};
                    const matchedTrack = new Set();
                    const allOrderItems = Array.isArray(order.items) ? order.items : [];

                    for (const ret of allOrderCompletedReturns) {
                        if (Array.isArray(ret.items)) {
                            for (const retItem of ret.items) {
                                const matchedOrderItem = findMatchingOrderItem(retItem, allOrderItems, matchedTrack);
                                const identifier = matchedOrderItem ? getOrderItemIdentifier(matchedOrderItem) : (retItem.orderItemId || String(retItem.productId));
                                if (matchedOrderItem) {
                                    matchedTrack.add(String(matchedOrderItem._id));
                                }

                                if (!returnedQuantitiesMap[identifier]) {
                                    returnedQuantitiesMap[identifier] = 0;
                                }
                                returnedQuantitiesMap[identifier] += Number(retItem.quantity || 0);
                            }
                        }
                    }

                    // 3. Compare every order item against the returned quantities.
                    let allItemsReturned = true;
                    for (const item of allOrderItems) {
                        const identifier = getOrderItemIdentifier(item);
                        const purchasedQty = Number(item.quantity || 0);
                        const returnedQty = Number(returnedQuantitiesMap[identifier] || 0);
                        if (returnedQty < purchasedQty) {
                            allItemsReturned = false;
                            break;
                        }
                    }

                    // 4. Update order and escrow status accordingly
                    if (allItemsReturned) {
                        if (order.status !== 'cancelled') {
                            order.status = 'returned';
                        }
                        order.paymentStatus = 'refunded';
                        order.escrowStatus = 'refunded';
                    } else {
                        // Partial return
                        order.status = 'delivered';
                        order.escrowStatus = 'held';

                        const paymentStatusPath = Order.schema.path('paymentStatus');
                        const enumValues = (paymentStatusPath && paymentStatusPath.enumValues) || [];
                        if (enumValues.includes('partially_refunded')) {
                            order.paymentStatus = 'partially_refunded';
                        }
                    }
                    await order.save();`;

if (!normalized.includes(blockSearch)) {
    console.error("Could not find blockSearch target!");
    process.exit(1);
}
normalized = normalized.replace(blockSearch, blockReplace);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched return.controller.js!");
