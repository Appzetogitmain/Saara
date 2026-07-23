import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiSearch, FiEdit, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import DataTable from "../../../Admin/components/DataTable";
import ExportButton from "../../../Admin/components/ExportButton";
import Badge from "../../../../shared/components/Badge";
import ConfirmModal from "../../../Admin/components/ConfirmModal";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorProductStore } from "../../store/vendorProductStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";

const ManageProducts = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { products, isLoading, fetchProducts, removeProduct } = useVendorProductStore();
  const { categories, initialize: initCategories } = useCategoryStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    productId: null,
  });

  const vendorId = vendor?.id;

  useEffect(() => {
    initCategories();
    if (vendorId) {
      fetchProducts({ fetchAll: true, limit: 200 });
    }
  }, [vendorId, initCategories, fetchProducts]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((product) => product.stock === selectedStatus);
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (product) =>
          String(product.categoryId?._id ?? product.categoryId ?? "") ===
          selectedCategory
      );
    }

    return filtered;
  }, [products, searchQuery, selectedStatus, selectedCategory]);

  const columns = [
    {
      key: "_id",
      label: "ID",
      sortable: true,
      render: (value) => String(value).slice(-6).toUpperCase(),
    },
    {
      key: "name",
      label: "Product Name",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <img
            src={row.image || row.images?.[0]}
            alt={value}
            className="w-10 h-10 object-cover rounded-lg"
            onError={(e) => {
              e.target.src = "https://via.placeholder.com/50x50?text=Product";
            }}
          />
          <span className="font-medium">{value}</span>
        </div>
      ),
    },
    {
      key: "price",
      label: "Price",
      sortable: true,
      render: (value) => formatPrice(value),
    },
    {
      key: "stockQuantity",
      label: "Stock",
      sortable: true,
      render: (value) => value?.toLocaleString() || 0,
    },
    {
      key: "stock",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "in_stock"
              ? "success"
              : value === "low_stock"
                ? "warning"
                : "error"
          }>
          {value?.replace("_", " ").toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/vendor/products/${row._id ?? row.id}`);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <FiEdit />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({ isOpen: true, productId: row._id ?? row.id });
            }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    const success = await removeProduct(deleteModal.productId);
    if (success) {
      setDeleteModal({ isOpen: false, productId: null });
    }
  };

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to manage products</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Manage Products
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View, edit, and manage your product catalog
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Filters Section */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base"
              />
            </div>

            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "in_stock", label: "In Stock" },
                { value: "low_stock", label: "Low Stock" },
                { value: "out_of_stock", label: "Out of Stock" },
              ]}
              className="w-full sm:w-auto min-w-[140px]"
            />

            <AnimatedSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: "all", label: "All Categories" },
                ...categories
                  .filter((cat) => cat.isActive !== false)
                  .map((cat) => ({ value: String(cat._id ?? cat.id), label: cat.name })),
              ]}
              className="w-full sm:w-auto min-w-[160px]"
            />

            <button
              onClick={() => navigate("/vendor/products/add-product")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-2xl shadow-md shadow-primary-500/20 active:scale-95 transition-all font-bold text-sm sm:text-base whitespace-nowrap">
              <span>Add New Product</span>
            </button>

            <div className="w-full sm:w-auto">
              <ExportButton
                data={filteredProducts}
                headers={[
                  { label: "ID", accessor: (row) => String(row._id ?? row.id) },
                  { label: "Name", accessor: (row) => row.name },
                  { label: "Price", accessor: (row) => formatPrice(row.price) },
                  { label: "Stock", accessor: (row) => row.stockQuantity || 0 },
                  { label: "Status", accessor: (row) => row.stock || "N/A" },
                ]}
                filename="vendor-products"
              />
            </div>
          </div>
        </div>

        {/* DataTable */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-medium">Loading products...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          <>
            {/* Mobile Card List (shown on mobile, hidden on desktop) */}
            <div className="block md:hidden space-y-4">
              {filteredProducts.map((product) => {
                const productId = String(product._id ?? product.id);
                const displayId = productId.slice(-6).toUpperCase();
                const imageSrc = product.image || product.images?.[0];
                const status = product.stock || "in_stock";
                
                const statusConfig = {
                  in_stock: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  low_stock: "bg-amber-50 text-amber-700 border-amber-100",
                  out_of_stock: "bg-rose-50 text-rose-700 border-rose-100",
                };
                
                const statusLabel = status.replace("_", " ").toUpperCase();
                const statusClass = statusConfig[status] || statusConfig.in_stock;

                return (
                  <div 
                    key={productId}
                    onClick={() => navigate(`/vendor/products/${productId}`)}
                    className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative flex gap-4 group cursor-pointer"
                  >
                    {/* Image */}
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 flex-shrink-0">
                      <img
                        src={imageSrc}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.src = "https://via.placeholder.com/100x100?text=Product";
                        }}
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                            ID: {displayId}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm leading-tight truncate group-hover:text-primary-600 transition-colors mb-1">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold mb-0.5">Price / Stock</p>
                          <p className="font-extrabold text-slate-800 text-sm font-mono leading-none">
                            {formatPrice(product.price)}
                            <span className="text-[10px] text-slate-400 font-bold ml-1.5 font-sans">
                              ({product.stockQuantity || 0} left)
                            </span>
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/vendor/products/${productId}`)}
                            className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
                            <FiEdit className="text-xs" />
                          </button>
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, productId })}
                            className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors">
                            <FiTrash2 className="text-xs" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden on mobile, shown on desktop) */}
            <div className="hidden md:block">
              <DataTable
                data={filteredProducts}
                columns={columns}
                pagination={true}
                itemsPerPage={10}
                onRowClick={(row) => navigate(`/vendor/products/${row._id ?? row.id}`)}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No products found</p>
            <button
              onClick={() => navigate("/vendor/products/add-product")}
              className="px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold">
              Add Your First Product
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, productId: null })}
        onConfirm={confirmDelete}
        title="Delete Product?"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default ManageProducts;
