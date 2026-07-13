import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import PlatformPolicy from '../../../models/PlatformPolicy.model.js';

// Helper to get or initialize the singleton policy document
const getOrCreatePolicyDoc = async () => {
    let doc = await PlatformPolicy.findOne();
    if (!doc) {
        doc = await PlatformPolicy.create({
            privacy: { title: 'Privacy Policy', content: '' },
            refund: { title: 'Refund Policy', content: '' },
            terms: { title: 'Terms & Conditions', content: '' }
        });
    }
    return doc;
};

// GET /api/admin/policies/:type
export const getPolicy = asyncHandler(async (req, res) => {
    const { type } = req.params;
    const doc = await getOrCreatePolicyDoc();
    
    let policy = null;
    if (type === 'privacy' || type === 'privacy-policy') {
        policy = doc.privacy;
    } else if (type === 'refund' || type === 'refund-policy') {
        policy = doc.refund;
    } else if (type === 'terms' || type === 'terms-conditions') {
        policy = doc.terms;
    } else {
        throw new ApiError(400, 'Invalid policy type.');
    }

    res.status(200).json(new ApiResponse(200, policy, 'Policy fetched.'));
});

// PUT /api/admin/policies/:type
export const updatePolicy = asyncHandler(async (req, res) => {
    const { type } = req.params;
    const { content } = req.body;

    if (content === undefined) {
        throw new ApiError(400, 'Content is required.');
    }

    const doc = await getOrCreatePolicyDoc();
    const now = new Date();

    if (type === 'privacy' || type === 'privacy-policy') {
        doc.privacy.content = content;
        doc.privacy.lastUpdated = now;
    } else if (type === 'refund' || type === 'refund-policy') {
        doc.refund.content = content;
        doc.refund.lastUpdated = now;
    } else if (type === 'terms' || type === 'terms-conditions') {
        doc.terms.content = content;
        doc.terms.lastUpdated = now;
    } else {
        throw new ApiError(400, 'Invalid policy type.');
    }

    await doc.save();
    
    let updatedPolicy = null;
    if (type === 'privacy' || type === 'privacy-policy') {
        updatedPolicy = doc.privacy;
    } else if (type === 'refund' || type === 'refund-policy') {
        updatedPolicy = doc.refund;
    } else if (type === 'terms' || type === 'terms-conditions') {
        updatedPolicy = doc.terms;
    }

    res.status(200).json(new ApiResponse(200, updatedPolicy, 'Policy updated.'));
});
