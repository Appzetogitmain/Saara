import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';

const isMongoObjectId = (value) => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);

const normalizeReview = (review) => ({
  ...review,
  id: review?.id || review?._id || Date.now().toString(),
  user: review?.user || review?.userId?.name || 'User',
  date: review?.date || review?.createdAt || new Date().toISOString(),
  helpfulCount: review?.helpfulCount || 0,
  notHelpfulCount: review?.notHelpfulCount || 0,
});

export const useReviewsStore = create(
  persist(
    (set, get) => ({
      reviews: {},
      reviewsMeta: {},
      votes: {},
      isLoading: false,
      error: null,

      fetchReviews: async (productId, options = {}) => {
        if (!productId || !isMongoObjectId(String(productId))) {
          return get().sortReviews(productId, options?.sort || 'newest');
        }

        set({ isLoading: true, error: null });
        try {
          const { sort = 'newest', page = 1, limit = 50 } = options;
          const response = await api.get(
            `/products/${productId}/reviews?sort=${encodeURIComponent(sort)}&page=${page}&limit=${limit}`
          );
          const payload = response?.data || {};
          const fetched = Array.isArray(payload?.reviews)
            ? payload.reviews.map(normalizeReview)
            : [];

          set((state) => ({
            reviews: {
              ...state.reviews,
              [productId]: fetched,
            },
            reviewsMeta: {
              ...state.reviewsMeta,
              [productId]: {
                averageRating: payload?.averageRating || 0,
                totalReviews: payload?.totalReviews || 0,
                distribution: payload?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                images: payload?.images || [],
              }
            },
            isLoading: false,
          }));

          return fetched;
        } catch (error) {
          set({ isLoading: false, error: error?.message || 'Failed to fetch reviews' });
          return get().sortReviews(productId, options?.sort || 'newest');
        }
      },

      addReview: async (productId, reviewData) => {
        const normalizedProductId = String(productId);
        if (!isMongoObjectId(normalizedProductId)) {
          set((state) => {
            const productReviews = state.reviews[normalizedProductId] || [];
            const newReview = normalizeReview({
              ...reviewData,
              id: Date.now().toString(),
            });
            return {
              reviews: {
                ...state.reviews,
                [normalizedProductId]: [...productReviews, newReview],
              },
            };
          });
          return true;
        }

        try {
          let reqData;
          if (reviewData instanceof FormData) {
            reqData = reviewData;
          } else {
            const formData = new FormData();
            formData.append('orderId', reviewData.orderId);
            formData.append('rating', reviewData.rating);
            formData.append('comment', reviewData.comment || reviewData.review || '');
            formData.append('title', reviewData.title || '');
            
            if (Array.isArray(reviewData.images)) {
              reviewData.images.forEach(img => {
                if (img instanceof File) {
                  formData.append('images', img);
                } else {
                  formData.append('reviewImages', img);
                }
              });
            }
            reqData = formData;
          }

          const response = await api.post(`/user/products/${normalizedProductId}/review`, reqData);
          const payload = response?.data;
          if (payload) {
            const added = normalizeReview(payload);
            set((state) => ({
              reviews: {
                ...state.reviews,
                [normalizedProductId]: [...(state.reviews[normalizedProductId] || []), added],
              },
            }));
            await get().fetchReviews(productId);
          }
          return true;
        } catch (err) {
          console.error("addReview store error:", err);
          return false;
        }
      },

      updateReview: async (productId, reviewData) => {
        const normalizedProductId = String(productId);
        try {
          let reqData;
          if (reviewData instanceof FormData) {
            reqData = reviewData;
          } else {
            const formData = new FormData();
            if (reviewData.rating !== undefined) formData.append('rating', reviewData.rating);
            if (reviewData.comment !== undefined || reviewData.review !== undefined) {
              formData.append('comment', reviewData.comment || reviewData.review || '');
            }
            if (reviewData.title !== undefined) formData.append('title', reviewData.title);
            
            if (Array.isArray(reviewData.images)) {
              reviewData.images.forEach(img => {
                if (img instanceof File) {
                  formData.append('images', img);
                } else {
                  formData.append('reviewImages', img);
                }
              });
            }
            reqData = formData;
          }

          const response = await api.patch(`/user/products/${normalizedProductId}/review`, reqData);
          const payload = response?.data;
          if (payload) {
            const updated = normalizeReview(payload);
            set((state) => ({
              reviews: {
                ...state.reviews,
                [normalizedProductId]: (state.reviews[normalizedProductId] || []).map(r => 
                  r.userId === updated.userId || r.userId?._id === updated.userId?._id ? updated : r
                ),
              },
            }));
            await get().fetchReviews(productId);
          }
          return true;
        } catch (err) {
          console.error("updateReview store error:", err);
          return false;
        }
      },

      // Get reviews for a product
      getReviews: (productId) => {
        const state = get();
        return state.reviews[productId] || [];
      },

      // Vote on review helpfulness
      voteHelpful: async (productId, reviewId) => {
        const normalizedProductId = String(productId);
        const voteKey = `${normalizedProductId}_${reviewId}`;
        if (get().votes[voteKey]) {
          return false;
        }

        if (isMongoObjectId(normalizedProductId) && isMongoObjectId(String(reviewId))) {
          try {
            const response = await api.post(`/user/reviews/${reviewId}/helpful`);
            const payload = response?.data;
            const helpfulCount = payload?.helpfulCount;
            set((state) => ({
              reviews: {
                ...state.reviews,
                [normalizedProductId]: (state.reviews[normalizedProductId] || []).map((review) =>
                  review.id === reviewId || review._id === reviewId
                    ? {
                      ...review,
                      helpfulCount: typeof helpfulCount === 'number'
                        ? helpfulCount
                        : (review.helpfulCount || 0) + 1,
                    }
                    : review
                ),
              },
              votes: {
                ...state.votes,
                [voteKey]: 'helpful',
              },
            }));
            return true;
          } catch {
            return false;
          }
        }

        set((state) => {
          if (state.votes[voteKey]) {
            return state; // Already voted
          }

          const productReviews = state.reviews[normalizedProductId] || [];
          const updatedReviews = productReviews.map((review) =>
            review.id === reviewId
              ? { ...review, helpfulCount: (review.helpfulCount || 0) + 1 }
              : review
          );

          return {
            reviews: {
              ...state.reviews,
              [normalizedProductId]: updatedReviews,
            },
            votes: {
              ...state.votes,
              [voteKey]: 'helpful',
            },
          };
        });
        return true;
      },

      // Vote on review not helpful
      voteNotHelpful: (productId, reviewId) => {
        set((state) => {
          const voteKey = `${productId}_${reviewId}`;
          if (state.votes[voteKey]) {
            return state; // Already voted
          }

          const productReviews = state.reviews[productId] || [];
          const updatedReviews = productReviews.map((review) =>
            review.id === reviewId
              ? { ...review, notHelpfulCount: (review.notHelpfulCount || 0) + 1 }
              : review
          );

          return {
            reviews: {
              ...state.reviews,
              [productId]: updatedReviews,
            },
            votes: {
              ...state.votes,
              [voteKey]: 'not-helpful',
            },
          };
        });
      },

      // Check if user has voted on a review
      hasVoted: (productId, reviewId) => {
        const state = get();
        const voteKey = `${productId}_${reviewId}`;
        return !!state.votes[voteKey];
      },

      // Sort reviews
      sortReviews: (productId, sortBy) => {
        const state = get();
        const reviews = state.reviews[productId] || [];
        let sorted = [...reviews];

        switch (sortBy) {
          case 'newest':
            sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
          case 'oldest':
            sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
          case 'most-helpful':
            sorted.sort(
              (a, b) =>
                (b.helpfulCount || 0) - (a.helpfulCount || 0) ||
                (a.notHelpfulCount || 0) - (b.notHelpfulCount || 0)
            );
            break;
          case 'highest-rating':
            sorted.sort((a, b) => b.rating - a.rating);
            break;
          case 'lowest-rating':
            sorted.sort((a, b) => a.rating - b.rating);
            break;
          default:
            break;
        }

        return sorted;
      },
    }),
    {
      name: 'reviews-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

