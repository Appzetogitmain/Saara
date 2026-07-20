export const validateString = (value, fieldName, minLength = 1, maxLength = 255) => {
    const trimmed = String(value || '').trim();
    if (trimmed.length < minLength) {
        return { isValid: false, error: `${fieldName} must be at least ${minLength} character${minLength > 1 ? 's' : ''}.` };
    }
    if (trimmed.length > maxLength) {
        return { isValid: false, error: `${fieldName} cannot exceed ${maxLength} characters.` };
    }
    return { isValid: true, value: trimmed };
};

export const validatePageName = (name) => validateString(name, 'Page Title', 2, 60);
export const validateNavigationLabel = (label) => validateString(label, 'Navigation Label', 2, 40);
export const validateCollectionName = (name) => validateString(name, 'Collection Name', 2, 60);

export const validateStoreDetails = (store) => {
    const nameVal = validateString(store.storeName, 'Store Name', 2, 100);
    if (!nameVal.isValid) return nameVal;

    if (store.tagline) {
        const taglineVal = validateString(store.tagline, 'Tagline', 0, 150);
        if (store.tagline.trim() && !taglineVal.isValid) return taglineVal;
    }

    if (store.description) {
        const descVal = validateString(store.description, 'Description', 0, 2000);
        if (store.description.trim() && !descVal.isValid) return descVal;
    }

    if (store.contact?.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(store.contact.email.trim())) {
            return { isValid: false, error: 'Please enter a valid support email address.' };
        }
    }
    
    if (store.contact?.mapsUrl) {
        const urlRegex = /^https?:\/\/.+/i;
        if (store.contact.mapsUrl.trim() && !urlRegex.test(store.contact.mapsUrl.trim())) {
            return { isValid: false, error: 'Google Maps URL must be a valid http or https link.' };
        }
    }

    if (store.socialLinks) {
        const urlRegex = /^https?:\/\/.+/i;
        for (const [platform, url] of Object.entries(store.socialLinks)) {
            if (url && url.trim() && !urlRegex.test(url.trim())) {
                return { isValid: false, error: `${platform} must be a valid http or https link.` };
            }
        }
    }

    return { isValid: true };
};
