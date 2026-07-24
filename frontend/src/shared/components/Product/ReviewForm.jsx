import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FiStar, FiUpload, FiX } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const ReviewForm = ({ productId, onSubmit, initialReview }) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [images, setImages] = useState([]);
  const [existingImages, setExistingImages] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (initialReview) {
      setRating(initialReview.rating || 0);
      setExistingImages(initialReview.images || initialReview.reviewImages || []);
      reset({
        title: initialReview.title || '',
        comment: initialReview.comment || initialReview.review || '',
      });
    } else {
      setRating(0);
      setImages([]);
      setExistingImages([]);
      reset({ title: '', comment: '' });
    }
  }, [initialReview, reset]);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + existingImages.length + files.length > 5) {
      toast.error('Maximum 5 images allowed');
      return;
    }
    const newImages = files.slice(0, 5 - (images.length + existingImages.length));
    setImages([...images, ...newImages]);
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const onFormSubmit = async (data) => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    const reviewData = {
      ...data,
      rating,
      images: [...existingImages, ...images],
      productId,
      date: new Date().toISOString(),
    };

    if (onSubmit) {
      const result = await onSubmit(reviewData);
      if (result === false) {
        return;
      }
      reset();
      setRating(0);
      setImages([]);
      setExistingImages([]);
      toast.success(initialReview ? 'Review updated successfully!' : 'Review submitted successfully!');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-150 rounded-2xl p-6 mb-8 shadow-sm"
    >
      <h3 className="text-base font-black text-gray-800 mb-6 uppercase tracking-wider">
        {initialReview ? 'Edit Your Review' : 'Write a Product Review'}
      </h3>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
        {/* Rating */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
            Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="focus:outline-none"
              >
                <FiStar
                  className={`text-3xl transition-colors ${
                    star <= (hoveredRating || rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-xs font-bold text-slate-500">({rating} out of 5)</span>
            )}
          </div>
        </div>

        {/* Review Title */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
            Review Title
          </label>
          <input
            type="text"
            {...register('title', {
              required: 'Review title is required',
              minLength: {
                value: 3,
                message: 'Title must be at least 3 characters',
              },
            })}
            className={`w-full px-4 py-2.5 rounded-xl border ${
              errors.title
                ? 'border-red-300 focus:ring-red-500'
                : 'border-gray-200 focus:ring-pink-500'
            } text-sm focus:outline-none transition-all`}
            placeholder="Summarize your main opinion..."
          />
          {errors.title && (
            <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
          )}
        </div>

        {/* Review Text */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
            Your Review <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('comment', {
              required: 'Review text is required',
              minLength: {
                value: 10,
                message: 'Review must be at least 10 characters',
              },
            })}
            rows={4}
            className={`w-full px-4 py-2.5 rounded-xl border ${
              errors.comment
                ? 'border-red-300 focus:ring-red-500'
                : 'border-gray-200 focus:ring-pink-500'
            } text-sm focus:outline-none transition-all resize-none`}
            placeholder="Share details of what you liked or disliked about this product..."
          />
          {errors.comment && (
            <p className="mt-1 text-xs text-red-600">{errors.comment.message}</p>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
            Photos (Optional, max 5)
          </label>
          <div className="flex flex-wrap gap-3">
            {/* Existing Images */}
            {existingImages.map((image, index) => (
              <div key={`existing-${index}`} className="relative">
                <img
                  src={image}
                  alt={`Review Existing ${index + 1}`}
                  className="w-20 h-20 object-cover rounded-xl border border-gray-100 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setExistingImages(existingImages.filter((_, i) => i !== index))}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                >
                  <FiX className="text-xs" />
                </button>
              </div>
            ))}

            {/* New Uploaded Images */}
            {images.map((image, index) => (
              <div key={`new-${index}`} className="relative">
                <img
                  src={URL.createObjectURL(image)}
                  alt={`Review New ${index + 1}`}
                  className="w-20 h-20 object-cover rounded-xl border border-gray-100 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                >
                  <FiX className="text-xs" />
                </button>
              </div>
            ))}

            {existingImages.length + images.length < 5 && (
              <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center cursor-pointer hover:border-pink-500 hover:text-pink-500 text-gray-400 transition-colors">
                <FiUpload className="text-xl" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl font-bold text-sm shadow-md shadow-primary-500/20 active:scale-95 transition-all"
        >
          {initialReview ? 'Update Review' : 'Submit Review'}
        </button>
      </form>
    </motion.div>
  );
};

export default ReviewForm;
