import fs from 'fs';

const filePath = 'backend/src/modules/user/controllers/order.controller.js';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

const searchBlock = `// GET /api/user/orders
export const getUserOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Order.countDocuments({ userId: req.user.id });
    res.status(200).json(new ApiResponse(200, { orders, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Orders fetched.'));
});`;

const replaceBlock = `// GET /api/user/orders
export const getUserOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Order.countDocuments({ userId: req.user.id });

    // Fetch return requests for these orders
    const orderIds = orders.map(o => o._id);
    const returnRequests = await ReturnRequest.find({ orderId: { $in: orderIds } }).lean();

    // Group return requests by orderId
    const returnMap = {};
    returnRequests.forEach(retReq => {
        const oId = String(retReq.orderId);
        if (!returnMap[oId]) returnMap[oId] = [];
        returnMap[oId].push(retReq);
    });

    // Attach returnRequests to each order
    const ordersWithReturns = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.returnRequests = returnMap[String(order._id)] || [];
        return orderObj;
    });

    res.status(200).json(new ApiResponse(200, { orders: ordersWithReturns, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Orders fetched.'));
});`;

if (!normalized.includes(searchBlock)) {
    console.error("Target search block not found in order.controller.js!");
    process.exit(1);
}

normalized = normalized.replace(searchBlock, replaceBlock);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched order.controller.js!");
