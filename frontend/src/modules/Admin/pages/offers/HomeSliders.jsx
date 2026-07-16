import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { FiPlus, FiEdit, FiTrash2, FiUpload, FiArrowUp, FiArrowDown, FiEye, FiEyeOff } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../components/DataTable";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { useBannerStore } from "../../../../shared/store/bannerStore";
import { getPlaceholderImage } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import { uploadAdminImage, reorderBanners as reorderBannersApi } from "../../services/adminService";
import BannerForm from "../../components/Banners/BannerForm";
import { BannerTypes, SLIDER_TYPES } from "../../utils/bannerConstants";

const SLIDER_IMAGE_PLACEHOLDER = getPlaceholderImage(64, 64, "Image");

const HomeSliders = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { banners, initialize, createBanner, updateBanner, deleteBanner, toggleBannerStatus, getBannersByTypes } =
    useBannerStore();
  const [selectedBannerType, setSelectedBannerType] = useState(BannerTypes.HOME_SLIDER);

  const sliders = useMemo(
    () =>
      getBannersByTypes(SLIDER_TYPES)
        .filter((banner) => banner.type === selectedBannerType)
        .map((banner) => ({
          ...banner,
          id: banner._id,
          status: banner.isActive ? "active" : "inactive",
        }))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [banners, getBannersByTypes, selectedBannerType]
  );

  const [editingSlider, setEditingSlider] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleSave = async (sliderData) => {
    const payload = {
      title: sliderData.title,
      image: sliderData.image,
      mobileImage: sliderData.mobileImage,
      altText: sliderData.altText,
      openInNewTab: sliderData.openInNewTab,
      showButton: sliderData.showButton,
      link: sliderData.link,
      order: sliderData.order,
      isActive: sliderData.status === "active",
      type: sliderData.type || selectedBannerType,
    };

    try {
      if (editingSlider && editingSlider.id) {
        await updateBanner(editingSlider.id, payload);
      } else {
        await createBanner(payload);
      }
      await initialize();
      setEditingSlider(null);
    } catch (error) {
      // Error handled in store
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBanner(deleteModal.id);
      await initialize();
    } catch (error) {
      // Error handled in store
    } finally {
      setDeleteModal({ isOpen: false, id: null });
    }
  };

  const handleSliderImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingSlider) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await uploadAdminImage(file, "banners");
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error("Image upload failed");
        return;
      }
      setEditingSlider((prev) => ({ ...prev, image: imageUrl }));
      toast.success("Image uploaded");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleMoveUp = async (slider) => {
    const index = sliders.findIndex((s) => s._id === slider._id);
    if (index <= 0) return;

    const current = sliders[index];
    const previous = sliders[index - 1];
    const currentOrder = Number(current.order || 0);
    const previousOrder = Number(previous.order || 0);

    try {
      await reorderBannersApi([
        { id: current._id, order: previousOrder },
        { id: previous._id, order: currentOrder },
      ]);
      await initialize();
    } catch {
      // Handled by api interceptor
    }
  };

  const handleMoveDown = async (slider) => {
    const index = sliders.findIndex((s) => s._id === slider._id);
    if (index < 0 || index >= sliders.length - 1) return;

    const current = sliders[index];
    const next = sliders[index + 1];
    const currentOrder = Number(current.order || 0);
    const nextOrder = Number(next.order || 0);

    try {
      await reorderBannersApi([
        { id: current._id, order: nextOrder },
        { id: next._id, order: currentOrder },
      ]);
      await initialize();
    } catch {
      // Handled by api interceptor
    }
  };

  const columns = [
    {
      key: "image",
      label: "Image",
      sortable: false,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt={row.title}
            className="w-16 h-16 object-cover rounded-lg"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = SLIDER_IMAGE_PLACEHOLDER;
            }}
          />
          <span className="font-medium text-gray-800">{row.title}</span>
        </div>
      ),
    },
    {
      key: "link",
      label: "Link",
      sortable: false,
      render: (value) => <span className="text-sm text-gray-600">{value}</span>,
    },
    {
      key: "order",
      label: "Order",
      sortable: true,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            value === "active"
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}>
          {value}
        </span>
      ),
    },
    {
      key: "reorder",
      label: "Move",
      sortable: false,
      render: (_, row) => {
        const index = sliders.findIndex((s) => s._id === row._id);
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleMoveUp(row)}
              disabled={index === 0}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Move Up"
            >
              <FiArrowUp />
            </button>
            <button
              onClick={() => handleMoveDown(row)}
              disabled={index === sliders.length - 1}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Move Down"
            >
              <FiArrowDown />
            </button>
          </div>
        );
      }
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleBannerStatus(row._id)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={row.isActive ? "Deactivate" : "Activate"}
          >
            {row.isActive ? <FiEye /> : <FiEyeOff />}
          </button>
          <button
            onClick={() => setEditingSlider(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row.id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Home Sliders
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage homepage slider and right-side banners
          </p>
        </div>
        <div className="flex items-center gap-3 lg:ml-auto">
          <AnimatedSelect
            value={selectedBannerType}
            onChange={(e) => setSelectedBannerType(e.target.value)}
            options={[
              { value: BannerTypes.HOME_SLIDER, label: "Hero Slider" },
              { value: BannerTypes.SIDE_BANNER, label: "Hero Side Banner" },
            ]}
            className="min-w-[170px]"
          />
          <button
            onClick={() =>
              setEditingSlider({
                title: "",
                image: "",
                mobileImage: "",
                altText: "",
                openInNewTab: false,
                showButton: true,
                link: "",
                order: 1,
                status: "active",
                type: selectedBannerType,
              })
            }
            className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm">
            <FiPlus />
            <span>
              {selectedBannerType === BannerTypes.SIDE_BANNER
                ? "Add Side Banner"
                : "Add Hero Slide"}
            </span>
          </button>
        </div>
      </div>

      {sliders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-bold mb-1">No Home Sliders Found</p>
          <p className="text-xs text-gray-400">Create hero sliders and side banners for the home page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <DataTable data={sliders} columns={columns} pagination={true} itemsPerPage={10} />
        </div>
      )}

      <AnimatePresence>
        {editingSlider !== null && (
          <BannerForm
            banner={editingSlider.id ? editingSlider : null}
            allowedTypes={[editingSlider.type || selectedBannerType]}
            onClose={() => setEditingSlider(null)}
            onSave={() => {
              initialize();
              setEditingSlider(null);
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Slider?"
        message="Are you sure you want to delete this slider? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default HomeSliders;
