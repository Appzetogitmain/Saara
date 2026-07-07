import fs from 'fs';

const filePath = 'frontend/src/modules/UserApp/pages/OrderDetail.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

// 1. Add Link to react-router-dom import
const searchImport = `import { useParams, useNavigate } from 'react-router-dom';`;
const replaceImport = `import { useParams, useNavigate, Link } from 'react-router-dom';`;

if (!normalized.includes(searchImport)) {
    console.error("Target searchImport not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchImport, replaceImport);

// 2. Wrap image and name in Link in Loop 1 (vendor items)
const searchLoop1 = `                          {vendorGroup.items.map((item, itemIndex) => (
                            <div key={\`\${item.id}-\${itemIndex}-\${getVariantSignature(item?.variant || {})}\`} className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                <LazyImage
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>`;

const replaceLoop1 = `                          {vendorGroup.items.map((item, itemIndex) => (
                            <div key={\`\${item.id}-\${itemIndex}-\${getVariantSignature(item?.variant || {})}\`} className="flex items-center gap-3">
                              <Link 
                                to={\`/product/\${item.productId || item.id}?variantSize=\${encodeURIComponent(item?.variant?.size || '')}&variantColor=\${encodeURIComponent(item?.variant?.color || '')}\`}
                                className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 active:scale-95 transition-transform"
                              >
                                <LazyImage
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </Link>
                              <div className="flex-1 min-w-0">
                                <Link 
                                  to={\`/product/\${item.productId || item.id}?variantSize=\${encodeURIComponent(item?.variant?.size || '')}&variantColor=\${encodeURIComponent(item?.variant?.color || '')}\`}
                                  className="hover:underline"
                                >
                                  <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                                </Link>`;

if (!normalized.includes(searchLoop1)) {
    console.error("Target searchLoop1 not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchLoop1, replaceLoop1);

// 3. Wrap image and name in Link in Loop 2 (non-grouped items)
const searchLoop2 = `                    {orderItems.map((item, itemIndex) => (
                      <div key={\`\${item.id}-\${itemIndex}-\${getVariantSignature(item?.variant || {})}\`} className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                          <LazyImage
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>`;

const replaceLoop2 = `                    {orderItems.map((item, itemIndex) => (
                      <div key={\`\${item.id}-\${itemIndex}-\${getVariantSignature(item?.variant || {})}\`} className="flex items-center gap-3">
                        <Link 
                          to={\`/product/\${item.productId || item.id}?variantSize=\${encodeURIComponent(item?.variant?.size || '')}&variantColor=\${encodeURIComponent(item?.variant?.color || '')}\`}
                          className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 active:scale-95 transition-transform"
                        >
                          <LazyImage
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link 
                            to={\`/product/\${item.productId || item.id}?variantSize=\${encodeURIComponent(item?.variant?.size || '')}&variantColor=\${encodeURIComponent(item?.variant?.color || '')}\`}
                            className="hover:underline"
                          >
                            <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                          </Link>`;

if (!normalized.includes(searchLoop2)) {
    console.error("Target searchLoop2 not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchLoop2, replaceLoop2);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched OrderDetail.jsx with product detail links and preselect parameters!");
