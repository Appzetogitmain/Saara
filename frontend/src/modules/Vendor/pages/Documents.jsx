import { useState, useEffect, useCallback } from "react";
import { FiFile, FiUpload, FiDownload, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../Admin/components/DataTable";
import ConfirmModal from "../../Admin/components/ConfirmModal";
import Badge from "../../../shared/components/Badge";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import {
  getVendorDocuments,
  uploadVendorDocument,
  deleteVendorDocument,
} from "../services/vendorService";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import toast from "react-hot-toast";

const Documents = () => {
  const { vendor, token } = useVendorAuthStore();
  const [documents, setDocuments] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null });
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const vendorId = vendor?.id || vendor?._id;

  const fetchDocuments = useCallback(async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const res = await getVendorDocuments();
      const data = res?.data ?? res;
      setDocuments(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!token || !vendorId) return;
    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(socket, `vendor_${vendorId}`);

    const handleNotification = (notification) => {
      // Refresh list if the notification relates to document changes
      if (notification?.data?.documentId || (notification?.title && notification.title.includes("Document"))) {
        fetchDocuments();
      }
    };

    socket.on("notification", handleNotification);
    socket.on("new_notification", handleNotification);

    return () => {
      socket.off("notification", handleNotification);
      socket.off("new_notification", handleNotification);
      leaveRoom(socket, `vendor_${vendorId}`);
    };
  }, [token, vendorId, fetchDocuments]);

  const handleUpload = async (docData, file) => {
    setIsSaving(true);
    try {
      await uploadVendorDocument(docData, file);
      setShowUpload(false);
      toast.success("Document uploaded");
      fetchDocuments();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.id) return;
    setIsSaving(true);
    try {
      await deleteVendorDocument(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
      toast.success("Document deleted");
      fetchDocuments();
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    { key: "name", label: "Document Name", sortable: true },
    { key: "category", label: "Category", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <Badge
          variant={
            value === "approved"
              ? "success"
              : value === "rejected"
                ? "error"
                : "warning"
          }
        >
          {value}
        </Badge>
      ),
    },
    {
      key: "expiryDate",
      label: "Expiry Date",
      render: (value) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => window.open(row.fileUrl, "_blank")}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Download"
          >
            <FiDownload />
          </button>
          <button
            onClick={() => setDeleteModal({ isOpen: true, id: row._id })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
            title="Delete"
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view documents</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
            <FiFile className="text-primary-600" />
            Documents
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage business documents and certificates
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
        >
          <FiUpload />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Document Verification Guide Banner */}
      <div className="bg-purple-50/80 border border-purple-100 rounded-xl p-4 sm:p-5 flex items-start gap-3.5 text-purple-900 text-sm shadow-sm">
        <div className="p-2.5 bg-purple-100 rounded-lg text-purple-600 shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-purple-950">Document Verification Guide</h4>
          <p className="text-purple-800/90 leading-relaxed">
            Upload clear and valid copies of your store files (such as business licenses, tax registration certifications, or corporate identity verifications). 
            All documents are audited and manually reviewed by the <strong>Platform Administrator</strong>. 
            Audits are typically completed within 24-48 business hours, and you will be notified of approval or correction requests right here in your dashboard.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500">Loading documents...</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <DataTable data={documents} columns={columns} pagination={true} />
          </div>

          {/* Mobile Card List View */}
          <div className="block md:hidden space-y-4">
            {documents.length > 0 ? (
              documents.map((doc) => (
                <div 
                  key={doc._id} 
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm sm:text-base">{doc.name}</h4>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase tracking-wider">
                        {doc.category}
                      </span>
                    </div>
                    <Badge
                      variant={
                        doc.status === "approved"
                          ? "success"
                          : doc.status === "rejected"
                            ? "error"
                            : "warning"
                      }
                      className="text-xs uppercase"
                    >
                      {doc.status}
                    </Badge>
                  </div>
                  
                  {doc.status === "rejected" && doc.remarks && (
                    <div className="bg-red-50 p-2.5 rounded-lg border border-red-100 text-xs text-red-600 italic">
                      <strong>Remarks:</strong> "{doc.remarks}"
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">Expires On</span>
                      <span className="text-gray-700 font-semibold">
                        {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(doc.fileUrl, "_blank")}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100"
                        title="Download / View"
                      >
                        <FiDownload />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ isOpen: true, id: doc._id })}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8 bg-white rounded-xl border border-gray-200">
                No documents uploaded yet.
              </p>
            )}
          </div>
        </>
      )}

      {showUpload && (
        <DocumentUploadForm
          onSave={handleUpload}
          onClose={() => setShowUpload(false)}
          isSaving={isSaving}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Document"
        message="Are you sure you want to delete this document?"
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

const DocumentUploadForm = ({ onSave, onClose, isSaving }) => {
  const [formData, setFormData] = useState({
    name: "",
    category: "License",
    expiryDate: "",
  });
  const [file, setFile] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    onSave(formData, file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold mb-4">Upload Document</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Document Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option>License</option>
              <option>Certificate</option>
              <option>Tax Document</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">
              Expiry Date (optional)
            </label>
            <input
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Upload File</label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-60"
            >
              {isSaving ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Documents;
