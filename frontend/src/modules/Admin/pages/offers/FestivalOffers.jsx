import { useState, useEffect, useMemo } from "react";
import {
  FiPlus,
  FiEdit,
  FiTrash2,
  FiTag,
  FiExternalLink,
  FiEye,
  FiEyeOff,
  FiCopy,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useCampaignStore } from "../../../../shared/store/campaignStore";
import CampaignForm from "../../components/Campaigns/CampaignForm";
import DataTable from "../../components/DataTable";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../components/ConfirmModal";

const Offers = () => {
  const { campaigns, initialize, getCampaignsByType, deleteCampaign, toggleCampaignStatus } =
    useCampaignStore();

  const [editingOffer, setEditingOffer] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get festival campaigns
  const festivalCampaigns = useMemo(() => {
    return getCampaignsByType("festival");
  }, [campaigns, getCampaignsByType]);

  // Convert campaigns to table format
  const offers = useMemo(() => {
    return festivalCampaigns.map((campaign) => {
      const now = new Date();
      const startDate = new Date(campaign.startDate);
      const endDate = new Date(campaign.endDate);

      let status = "expired";
      if (!campaign.isActive) {
        status = "inactive";
      } else if (startDate > now) {
        status = "upcoming";
      } else if (endDate >= now) {
        status = "active";
      }

      return {
        id: campaign.id || campaign._id,
        title: campaign.name,
        discount: campaign.discountValue,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        status,
        campaign, // Store full campaign object for reference
      };
    });
  }, [festivalCampaigns]);

  const handleDelete = async () => {
    try {
      await deleteCampaign(deleteModal.id);
    } finally {
      setDeleteModal({ isOpen: false, id: null });
    }
  };

  const handleFormClose = () => {
    setEditingOffer(null);
  };

  const handleClone = (campaignToClone) => {
    if (!campaignToClone) return;
    const cloned = {
      ...campaignToClone,
      _id: undefined, // Clear Mongo ID so it creates a new record
      id: undefined,
      name: `${campaignToClone.name} (Copy)`,
      slug: "", // Clear slug so it auto-generates
    };
    setEditingOffer(cloned);
  };

  const columns = [
    {
      key: "title",
      label: "Offer Title",
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <FiTag className="text-primary-600" />
          <span className="font-semibold text-gray-800">{value}</span>
        </div>
      ),
    },
    {
      key: "discount",
      label: "Discount",
      sortable: true,
      render: (value) => (
        <span className="font-bold text-green-600">{value}%</span>
      ),
    },
    {
      key: "startDate",
      label: "Start Date",
      sortable: true,
      render: (value) =>
        new Date(value).toLocaleDateString() +
        " " +
        new Date(value).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "endDate",
      label: "End Date",
      sortable: true,
      render: (value) =>
        new Date(value).toLocaleDateString() +
        " " +
        new Date(value).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "active"
              ? "success"
              : value === "upcoming"
              ? "warning"
              : "error"
          }>
          {value}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.campaign?.route && (
            <Link
              to={row.campaign.route}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="View Campaign Page">
              <FiExternalLink />
            </Link>
          )}
          <button
            onClick={() => toggleCampaignStatus(row.id)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={row.campaign?.isActive ? "Deactivate" : "Activate"}>
            {row.campaign?.isActive ? <FiEye /> : <FiEyeOff />}
          </button>
          <button
            onClick={() => handleClone(row.campaign)}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Clone Offer">
            <FiCopy />
          </button>
          <button
            onClick={() => setEditingOffer(row.campaign)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit Offer">
            <FiEdit />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row.id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete Offer">
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
            Offers
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage seasonal and event marketing campaigns
          </p>
        </div>
        <button
          onClick={() => setEditingOffer({ type: "festival" })}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm lg:ml-auto">
          <FiPlus />
          <span>Add Offer</span>
        </button>
      </div>

      {offers.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
          <FiTag className="text-6xl text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            No Offers Found
          </h3>
          <p className="text-gray-600 mb-6">
            Create your first seasonal or promotional campaign.
          </p>
          <button
            onClick={() => setEditingOffer({ type: "festival" })}
            className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all">
            Create Offer
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <DataTable
            data={offers}
            columns={columns}
            pagination={true}
            itemsPerPage={10}
          />
        </div>
      )}

      {/* Campaign Form Modal */}
      {editingOffer !== null && (
        <CampaignForm
          campaign={editingOffer}
          onClose={handleFormClose}
          onSave={() => {
            initialize();
            handleFormClose();
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Offer?"
        message="Are you sure you want to delete this offer? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default Offers;
