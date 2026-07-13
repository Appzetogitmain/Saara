import api from '../utils/api';

/**
 * Fetch the public general settings of the store.
 * Returns storeName, storeDescription, email, phone, socialMedia etc.
 */
export const getPublicGeneralSettings = () =>
    api.get('/settings/general');
