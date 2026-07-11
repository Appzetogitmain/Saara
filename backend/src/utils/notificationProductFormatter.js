export const buildItemsSummary = (items) => {
    if (!items || !Array.isArray(items) || items.length === 0) return '';

    const resolved = items.map(item => {
        if (!item) return { name: 'Product', quantity: 1 };
        const name = item.name || item.productName || (item.product && item.product.name) || item.title || 'Product';
        const quantity = item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1);
        return { name, quantity };
    });

    const maxItems = 3;
    const itemsToShow = resolved.slice(0, maxItems);
    
    let result = '';
    if (resolved.length === 1) {
        result = `\n\nProduct:\n• ${itemsToShow[0].name} ×${itemsToShow[0].quantity}`;
    } else if (resolved.length > 1) {
        result = `\n\nProducts:\n` + itemsToShow.map(item => `• ${item.name} ×${item.quantity}`).join('\n');
        if (resolved.length > maxItems) {
            const remaining = resolved.length - maxItems;
            result += `\n\n+${remaining} more item${remaining > 1 ? 's' : ''}`;
        }
    }
    return result;
};

export const buildOrderItemsSummary = (items) => {
    return buildItemsSummary(items);
};

export const buildVendorItemsSummary = (vendorGroupItems) => {
    return buildItemsSummary(vendorGroupItems);
};

export const buildReturnItemsSummary = (returnItems) => {
    return buildItemsSummary(returnItems);
};

export const buildExchangeSummary = (returnRequest) => {
    const itemsText = buildItemsSummary(returnRequest?.items);
    let variantDetails = '';
    if (returnRequest?.requestType === 'exchange' && returnRequest.exchangeDetails?.requestedVariant) {
        const { size, color } = returnRequest.exchangeDetails.requestedVariant;
        if (size || color) {
            variantDetails = `\n\nRequested Variant:\nSize: ${size || '—'}\nColor: ${color || '—'}`;
        }
    }
    return itemsText + variantDetails;
};
