import fs from 'fs';

const filePath = 'frontend/src/modules/UserApp/components/Mobile/MobileOrderCard.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

const searchBlock = `            {(() => {
              const completedReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => r.status === 'completed');
              const pendingReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor'].includes(r.status));`;

const replaceBlock = `            {(() => {
              if (['returned', 'refunded'].includes(order.status?.toLowerCase())) {
                return null;
              }
              const completedReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => r.status === 'completed');
              const pendingReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor'].includes(r.status));`;

if (!normalized.includes(searchBlock)) {
    console.error("Target searchBlock not found in MobileOrderCard.jsx!");
    process.exit(1);
}

normalized = normalized.replace(searchBlock, replaceBlock);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched MobileOrderCard.jsx with returned check!");
