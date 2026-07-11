import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FiPackage,
  FiTruck,
  FiMapPin,
  FiCreditCard,
  FiRotateCw,
  FiArrowLeft,
  FiShoppingBag,
  FiX,
} from "react-icons/fi";
import { motion } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from "../../../shared/store/orderStore";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import { useCartStore } from "../../../shared/store/useStore";
import { formatPrice } from "../../../shared/utils/helpers";
import {
  formatVariantLabel,
  getVariantSignature,
} from "../../../shared/utils/variant";
import toast from "react-hot-toast";
import PageTransition from "../../../shared/components/PageTransition";
import Badge from "../../../shared/components/Badge";
import LazyImage from "../../../shared/components/LazyImage";
import VariantSelector from "../../../shared/components/Product/VariantSelector";
import api from "../../../shared/utils/api";
const RETURN_REASONS = [
  "Wrong Size",
  "Wrong Color",
  "Received Wrong Variant",
  "Defective Product",
  "Wrong Product Received",
  "Product Damaged",
  "Quality Not As Expected",
  "Missing Parts or Accessories",
  "Product Not Matching Description",
  "Changed My Mind",
  "Other",
];

const MobileOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, cancelOrder, fetchOrderById, requestReturn } =
    useOrderStore();
  const { addItem } = useCartStore();
  const [isResolving, setIsResolving] = useState(true);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [requestType, setRequestType] = useState("return"); // return, exchange
  const [productDetailsMap, setProductDetailsMap] = useState({});
  const [exchangeVariants, setExchangeVariants] = useState({});
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [returnVendorId, setReturnVendorId] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [evidencePreviews, setEvidencePreviews] = useState([]);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);

  const fetchDetailsForProduct = async (productId) => {
    if (productDetailsMap[productId]) return;
    try {
      const res = await api.get(`/products/${productId}`);
      const payload = res?.data ?? res;
      setProductDetailsMap((prev) => ({
        ...prev,
        [productId]: payload,
      }));
    } catch (err) {
      console.error("Failed to fetch details for product:", productId, err);
    }
  };
  const order = getOrder(orderId);
  const [selectedItems, setSelectedItems] = useState({});

  const allOrderItems = useMemo(() => {
    if (!order) return [];
    if (order.vendorItems && order.vendorItems.length > 0) {
      const list = [];
      order.vendorItems.forEach((group) => {
        group.items.forEach((item) => {
          list.push({
            ...item,
            vendorId: String(group.vendorId || ""),
            vendorName: group.vendorName || "Vendor",
          });
        });
      });
      return list;
    }
    return (order.items || []).map((item) => ({
      ...item,
      vendorId: String(item.vendorId || ""),
      vendorName: item.vendorName || "Vendor",
    }));
  }, [order]);

  useEffect(() => {
    if (showReturnModal && allOrderItems.length > 0) {
      const initialSelected = {};
      allOrderItems.forEach((item) => {
        const key = String(item.productId || item.id || "");
        initialSelected[key] = {
          checked: true,
          quantity: item.quantity || 1,
          maxQuantity: item.quantity || 1,
          vendorId: item.vendorId,
          vendorName: item.vendorName,
          name: item.name,
          image: item.image,
          price: item.price,
        };
      });
      setSelectedItems(initialSelected);
    } else {
      setSelectedItems({});
    }
  }, [showReturnModal, allOrderItems]);

  const getItemReturnStatus = (item) => {
    if (!Array.isArray(order?.returnRequests)) return null;
    for (const ret of order.returnRequests) {
      if (Array.isArray(ret.items)) {
        const match = ret.items.find((retItem) => {
          const itemProdId = String(item.productId || item.id || "");
          const retProdId = String(retItem.productId || retItem.id || "");
          if (itemProdId !== retProdId) return false;
          if (item.variant && retItem.variant) {
            return (
              getVariantSignature(item.variant) ===
              getVariantSignature(retItem.variant)
            );
          }
          return true;
        });
        if (match) {
          return {
            status: ret.status,
            requestType: ret.requestType,
          };
        }
      }
    }
    return null;
  };

  const shippingAddress = order?.shippingAddress || {};
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const hasPendingOrCompletedReturn =
    Array.isArray(order?.returnRequests) &&
    order.returnRequests.some((req) => !["rejected"].includes(req.status));
  const hasSevenDaysPassed = useMemo(() => {
    if (!order?.deliveredAt) return false;
    const deliveredTime = new Date(order.deliveredAt).getTime();
    const timeLimit = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - deliveredTime > timeLimit;
  }, [order?.deliveredAt]);
  const vendorOptions = Array.isArray(order?.vendorItems)
    ? order.vendorItems
        .map((group) => ({
          id: String(group?.vendorId || ""),
          name: group?.vendorName || "Vendor",
        }))
        .filter((group) => group.id)
    : [];

  useEffect(() => {
    let mounted = true;

    const fetchOrder = async () => {
      if (orderId) {
        await fetchOrderById(orderId);
      }
      if (mounted) setIsResolving(false);
    };

    fetchOrder();

    const token =
      localStorage.getItem("token") || localStorage.getItem("user-token");
    if (token && orderId) {
      const socket = getSocket(token);
      if (socket) {
        joinRoom(`order_${orderId}`);

        const handleOrderUpdate = (updatedOrder) => {
          const updatedId = updatedOrder.orderId || updatedOrder._id;
          if (String(updatedId) === String(orderId) && mounted) {
            fetchOrderById(orderId);
          }
        };

        const handleReturnUpdate = (updatedReturn) => {
          if (String(updatedReturn.orderId) === String(orderId) && mounted) {
            fetchOrderById(orderId);
          }
        };

        socket.on("order_updated", handleOrderUpdate);
        socket.on("return_updated", handleReturnUpdate);

        return () => {
          mounted = false;
          socket.off("order_updated", handleOrderUpdate);
          socket.off("return_updated", handleReturnUpdate);
          leaveRoom(`order_${orderId}`);
        };
      }
    }

    return () => {
      mounted = false;
    };
  }, [orderId, fetchOrderById]);

  useEffect(() => {
    if (!isResolving && !order) {
      navigate("/orders");
    }
  }, [isResolving, order, navigate]);

  useEffect(() => {
    if (requestType === "exchange") {
      setSelectedItems((prev) => {
        const next = {};
        let foundFirst = false;
        Object.entries(prev).forEach(([id, val]) => {
          const isChecked = val.checked && !foundFirst;
          if (isChecked) {
            foundFirst = true;
            fetchDetailsForProduct(id);
          }
          next[id] = { ...val, checked: isChecked };
        });
        return next;
      });
    }
  }, [requestType]);

  if (isResolving) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <p className="text-gray-600">Loading order...</p>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Order Not Found
              </h2>
              <button
                onClick={() => navigate("/orders")}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
              >
                Back to Orders
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleReorder = () => {
    order.items.forEach((item) => {
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: item.quantity,
        variant: item.variant || undefined,
      });
    });
    toast.success("Items added to cart!");
    navigate("/checkout");
  };

  const handleCancel = async () => {
    if (window.confirm("Are you sure you want to cancel this order?")) {
      if (["pending", "processing", "payment_pending"].includes(order.status)) {
        try {
          await cancelOrder(order.id);
          toast.success("Order cancelled successfully");
          navigate("/orders");
        } catch (error) {
          toast.error(error?.message || "Failed to cancel order");
        }
      } else {
        toast.error("This order cannot be cancelled");
      }
    }
  };

  // Phase 2.2 — Retry payment for payment_pending orders

  const loadRazorpay = () =>
    new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handleRetryPayment = async () => {
    if (isRetryingPayment) return;
    setIsRetryingPayment(true);
    try {
      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded) {
        toast.error("Payment gateway failed to load.");
        return;
      }

      const { data: retryData } = await api.post(
        `/user/payment/retry/${order.orderId}`,
      );
      const payload = retryData?.data ?? retryData;

      await new Promise((resolve) => {
        const options = {
          key: payload.key,
          amount: Math.round((payload.amount || 0) * 100),
          currency: payload.currency || "INR",
          order_id: payload.razorpayOrderId,
          name: "Porutkal",
          description: `Retry Payment — Order #${order.orderId}`,
          prefill: {
            name: order.shippingAddress?.name || "",
            email: order.shippingAddress?.email || "",
            contact: order.shippingAddress?.phone || "",
          },
          theme: { color: "#6366f1" },
          handler: async (response) => {
            const verifyToastId = toast.loading("Confirming your payment...");
            try {
              await api.post("/user/payment/verify", {
                orderId: order.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });

              toast.success("Payment successful! Order confirmed.", { id: verifyToastId });
              await fetchOrderById(order.id);
              resolve();
            } catch (err) {
              console.error("Verification failed:", err);
              toast.error("Payment confirmation failed. Please refresh the page.", { id: verifyToastId });
              resolve();
            }
          },
          modal: {
            ondismiss: () => {
              toast("Payment cancelled. You can retry again from Orders.");
              resolve();
            },
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", (response) => {
          toast.error(
            `Payment failed: ${response.error?.description || "Unknown error"}`,
          );
          resolve();
        });
        rzp.open();
      });
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Could not initiate retry payment",
      );
    } finally {
      setIsRetryingPayment(false);
    }
  };

  const handleToggleCheck = (prodId) => {
    setSelectedItems((prev) => {
      const next = {};
      const isChecking = !prev[prodId]?.checked;

      Object.entries(prev).forEach(([id, val]) => {
        next[id] = {
          ...val,
          checked:
            id === prodId
              ? isChecking
              : requestType === "exchange"
                ? false
                : val.checked,
        };
      });

      if (isChecking && requestType === "exchange") {
        fetchDetailsForProduct(prodId);
      }
      return next;
    });
  };

  const handleUpdateQty = (prodId, change) => {
    setSelectedItems((prev) => {
      const current = prev[prodId];
      if (!current) return prev;
      const nextQty = Math.max(
        1,
        Math.min(current.maxQuantity, current.quantity + change),
      );
      return {
        ...prev,
        [prodId]: {
          ...current,
          quantity: nextQty,
        },
      };
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (evidenceFiles.length + files.length > 5) {
      toast.error("You can upload a maximum of 5 images");
      return;
    }

    const newFiles = [...evidenceFiles, ...files];
    setEvidenceFiles(newFiles);

    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setEvidencePreviews([...evidencePreviews, ...newPreviews]);
  };

  const removeFile = (index) => {
    URL.revokeObjectURL(evidencePreviews[index]);
    const newFiles = evidenceFiles.filter((_, i) => i !== index);
    const newPreviews = evidencePreviews.filter((_, i) => i !== index);
    setEvidenceFiles(newFiles);
    setEvidencePreviews(newPreviews);
  };

  const resetReturnModal = () => {
    setRequestType("return");
    setExchangeVariants({});
    setReturnReason(RETURN_REASONS[0]);
    setCustomReason("");
    evidencePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setEvidenceFiles([]);
    setEvidencePreviews([]);
    setShowReturnModal(false);
  };

  const openReturnModal = () => {
    if (order.status !== "delivered") {
      toast.error("Return can only be requested for delivered orders");
      return;
    }
    if (vendorOptions.length === 1) {
      setReturnVendorId(vendorOptions[0].id);
    } else if (!vendorOptions.find((v) => v.id === returnVendorId)) {
      setReturnVendorId(vendorOptions[0]?.id || "");
    }
    setShowReturnModal(true);

    // Prefetch for currently checked items if in exchange mode
    if (requestType === "exchange") {
      Object.entries(selectedItems).forEach(([id, val]) => {
        if (val.checked) {
          fetchDetailsForProduct(id);
        }
      });
    }
  };

  const handleRequestReturn = async () => {
    if (isSubmittingReturn) return;

    if (returnReason === "Other") {
      const trimmedCustom = customReason.trim();
      if (!trimmedCustom) {
        toast.error("Please enter a custom reason");
        return;
      }
      if (trimmedCustom.length < 10) {
        toast.error("Custom reason must be at least 10 characters");
        return;
      }
      if (trimmedCustom.length > 500) {
        toast.error("Custom reason cannot exceed 500 characters");
        return;
      }
    }

    const checkedItemsList = Object.entries(selectedItems)
      .filter(([_, value]) => value.checked === true)
      .map(([productId, value]) => ({
        productId,
        quantity: value.quantity,
        vendorId: value.vendorId,
      }));

    if (checkedItemsList.length === 0) {
      toast.error("Please select at least one item to return.");
      return;
    }

    if (requestType === "exchange") {
      const selectedItem = checkedItemsList[0];
      const variant = selectedItem
        ? exchangeVariants[selectedItem.productId]
        : null;
      if (!variant || (!variant.size && !variant.color)) {
        toast.error(
          "Please select a valid replacement variant (size/color) for exchange.",
        );
        return;
      }
    }

    const itemsByVendor = {};
    checkedItemsList.forEach((item) => {
      if (!itemsByVendor[item.vendorId]) {
        itemsByVendor[item.vendorId] = [];
      }
      itemsByVendor[item.vendorId].push({
        productId: item.productId,
        quantity: item.quantity,
      });
    });

    try {
      setIsSubmittingReturn(true);
      const submitPromises = Object.entries(itemsByVendor).map(
        ([vendorId, items]) => {
          const formData = new FormData();
          formData.append("returnReason", returnReason);
          formData.append(
            "customReason",
            returnReason === "Other" ? customReason.trim() : "",
          );
          formData.append("vendorId", vendorId);
          formData.append("itemsJson", JSON.stringify(items));
          formData.append("requestType", requestType);
          if (requestType === "exchange") {
            const selectedItem = items[0];
            const variant = exchangeVariants[selectedItem.productId] || {};
            formData.append("exchangeSize", String(variant.size || "").trim());
            formData.append(
              "exchangeColor",
              String(variant.color || "").trim(),
            );
          }

          evidenceFiles.forEach((file) => {
            formData.append("images", file);
          });

          return requestReturn(order.id, formData);
        },
      );

      await Promise.all(submitPromises);
      toast.success("Return request submitted successfully");
      resetReturnModal();
      await fetchOrderById(order.id);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to submit return request",
      );
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={true}>
        <div className="w-full pb-24">
          {/* Header */}
          <div className="px-4 py-4 bg-white border-b border-gray-200 sticky top-1 z-30">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800">
                  Order Details
                </h1>
                <p className="text-sm text-gray-600">Order #{order.id}</p>
              </div>
              <Badge variant={order.status}>{order.status.toUpperCase()}</Badge>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Order Items */}
            <div className="glass-card rounded-2xl p-4">
              <h2 className="text-base font-bold text-gray-800 mb-4">
                Order Items
              </h2>
              {order.vendorItems && order.vendorItems.length > 0 ? (
                <div className="space-y-4">
                  {order.vendorItems.map((vendorGroup) => (
                    <div key={vendorGroup.vendorId} className="space-y-2">
                      {/* Vendor Header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg border border-primary-200/50">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                          <FiShoppingBag className="text-white text-[10px]" />
                        </div>
                        <span className="text-sm font-bold text-primary-700 flex-1">
                          {vendorGroup.vendorName}
                        </span>
                        <span className="text-xs font-semibold text-primary-600 bg-white px-2 py-0.5 rounded-md">
                          {formatPrice(vendorGroup.subtotal)}
                        </span>
                      </div>
                      {/* Vendor Items */}
                      <div className="space-y-2 pl-2">
                        {vendorGroup.items.map((item, itemIndex) => (
                          <div
                            key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                            className="flex items-center gap-3"
                          >
                            <Link
                              to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || "")}&variantColor=${encodeURIComponent(item?.variant?.color || "")}`}
                              className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 active:scale-95 transition-transform"
                            >
                              <LazyImage
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || "")}&variantColor=${encodeURIComponent(item?.variant?.color || "")}`}
                                className="hover:underline"
                              >
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">
                                  {item.name}
                                </h3>
                              </Link>
                              <p className="text-xs text-gray-600">
                                {formatPrice(item.price)} x {item.quantity}
                              </p>
                              {formatVariantLabel(item?.variant) && (
                                <p className="text-[11px] text-gray-500">
                                  {formatVariantLabel(item?.variant)}
                                </p>
                              )}
                              {(() => {
                                const ret = getItemReturnStatus(item);
                                if (!ret) return null;
                                if (ret.status === "completed") {
                                  return (
                                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                                      {ret.requestType === "exchange"
                                        ? "Exchanged"
                                        : "Returned"}
                                    </span>
                                  );
                                } else if (ret.status !== "rejected") {
                                  return (
                                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-55/10 text-amber-600 text-[9px] font-bold uppercase tracking-wider border border-amber-100 font-semibold">
                                      Return Pending
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <p className="font-bold text-gray-800 text-sm">
                              {formatPrice(item.price * item.quantity)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {orderItems.map((item, itemIndex) => (
                    <div
                      key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                      className="flex items-center gap-3"
                    >
                      <Link
                        to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || "")}&variantColor=${encodeURIComponent(item?.variant?.color || "")}`}
                        className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 active:scale-95 transition-transform"
                      >
                        <LazyImage
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || "")}&variantColor=${encodeURIComponent(item?.variant?.color || "")}`}
                          className="hover:underline"
                        >
                          <h3 className="font-semibold text-gray-800 text-sm mb-1">
                            {item.name}
                          </h3>
                        </Link>
                        <p className="text-xs text-gray-600">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                        {formatVariantLabel(item?.variant) && (
                          <p className="text-[11px] text-gray-500">
                            {formatVariantLabel(item?.variant)}
                          </p>
                        )}
                        {(() => {
                          const ret = getItemReturnStatus(item);
                          if (!ret) return null;
                          if (ret.status === "completed") {
                            return (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                                {ret.requestType === "exchange"
                                  ? "Exchanged"
                                  : "Returned"}
                              </span>
                            );
                          } else if (ret.status !== "rejected") {
                            return (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-55/10 text-amber-600 text-[9px] font-bold uppercase tracking-wider border border-amber-100 font-semibold">
                                Return Pending
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <p className="font-bold text-gray-800 text-sm">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delivery OTP Code for testing / delivery verification */}
            {order.status === "shipped" && (
              <div className="glass-card rounded-2xl p-4 bg-green-50 border border-green-200">
                <h2 className="text-base font-bold text-green-800 mb-1 flex items-center gap-1.5">
                  🔑 Delivery Verification OTP
                </h2>
                <p className="text-xs text-green-700 mb-3">
                  Please provide this 6-digit OTP code to the delivery boy to
                  confirm successful delivery.
                </p>
                <p className="text-3xl font-extrabold text-green-800 tracking-widest text-center py-2 bg-white rounded-xl border border-green-300 font-mono">
                  {order.deliveryOtpDebug || "Check Email"}
                </p>
              </div>
            )}

            {/* Return Tracking Panel */}
            {Array.isArray(order.returnRequests) &&
              order.returnRequests.length > 0 && (
                <div className="glass-card rounded-2xl p-4 bg-amber-50/10 border border-amber-200/50 space-y-4">
                  <h2 className="text-base font-bold text-amber-800 flex items-center gap-1.5">
                    🔄 Return & Exchange Progress
                  </h2>
                  <div className="space-y-4">
                    {order.returnRequests.map((ret, index) => {
                      const isExchange = ret.requestType === "exchange";
                      const returnStatusConfig = {
                        pending: {
                          badge:
                            "bg-yellow-50 text-yellow-750 border-yellow-100",
                          label: "Pending Approval",
                          desc: "Awaiting inspection approval from vendor.",
                        },
                        approved: {
                          badge: "bg-blue-50 text-blue-755 border-blue-100",
                          label: "Approved",
                          desc: "Vendor approved. Finding closest courier partner.",
                        },
                        pickup_pending: {
                          badge: "bg-blue-50 text-blue-755 border-blue-100",
                          label: "Finding Rider",
                          desc: "Assigning a rider to pick up the package from your address.",
                        },
                        pickup_assigned: {
                          badge:
                            "bg-indigo-50 text-indigo-700 border-indigo-100",
                          label: "Rider Assigned",
                          desc: "Rider is on the way to pick up the items.",
                        },
                        picked_up: {
                          badge:
                            "bg-indigo-50 text-indigo-700 border-indigo-100",
                          label: "In Transit",
                          desc: "Rider has collected your items and is delivering back to the shop.",
                        },
                        delivered_to_vendor: {
                          badge: "bg-teal-50 text-teal-750 border-teal-100",
                          label: "Delivered to Shop",
                          desc: "Rider returned the package. Awaiting vendor inspection.",
                        },
                        replacement_preparing: {
                          badge:
                            "bg-purple-50 text-purple-750 border-purple-100",
                          label: "Preparing Replacement",
                          desc: "Vendor confirmed receipt and is preparing your replacement items.",
                        },
                        replacement_ready: {
                          badge:
                            "bg-purple-50 text-purple-750 border-purple-100",
                          label: "Replacement Ready",
                          desc: "Replacement items prepared. Auto-assigning delivery rider.",
                        },
                        replacement_assigned: {
                          badge:
                            "bg-indigo-50 text-indigo-700 border-indigo-100",
                          label: "Replacement Assigned",
                          desc: "Rider assigned to pick up and deliver the replacement items.",
                        },
                        out_for_delivery: {
                          badge:
                            "bg-indigo-50 text-indigo-700 border-indigo-100",
                          label: "Out for Delivery",
                          desc: "Rider picked up replacement items and is heading to you.",
                        },
                        completed: {
                          badge: "bg-green-50 text-green-750 border-green-100",
                          label: isExchange
                            ? "Exchange Completed"
                            : "Refund Processed",
                          desc: isExchange
                            ? "Completed. Your replacement product has been delivered."
                            : "Completed. Refund has been credited back to your account.",
                        },
                        rejected: {
                          badge: "bg-red-50 text-red-700 border-red-100",
                          label: "Rejected",
                          desc: `Rejected: ${ret.rejectionReason || "No reason provided."}`,
                        },
                      };

                      const currentStatus =
                        returnStatusConfig[ret.status] ||
                        returnStatusConfig.pending;

                      const returnStages = [
                        { key: "pending", label: "Requested" },
                        { key: "approved", label: "Approved" },
                        { key: "pickup_assigned", label: "Pickup Assigned" },
                        { key: "picked_up", label: "Picked Up" },
                        {
                          key: "delivered_to_vendor",
                          label: "Vendor Received",
                        },
                        { key: "completed", label: "Refund Processed" },
                      ];

                      const exchangeStages = [
                        { key: "pending", label: "Requested" },
                        { key: "approved", label: "Approved" },
                        { key: "pickup_assigned", label: "Pickup Assigned" },
                        { key: "picked_up", label: "Picked Up" },
                        {
                          key: "delivered_to_vendor",
                          label: "Vendor Received",
                        },
                        {
                          key: "replacement_ready",
                          label: "Replacement Ready",
                        },
                        { key: "out_for_delivery", label: "Out for Delivery" },
                        { key: "completed", label: "Completed" },
                      ];

                      const stages = isExchange ? exchangeStages : returnStages;
                      const statusToStageIdx = {
                        pending: 0,
                        rejected: 0,
                        approved: 1,
                        pickup_pending: 1,
                        pickup_assigned: 2,
                        picked_up: 3,
                        delivered_to_vendor: 4,
                        replacement_preparing: 4,
                        replacement_ready: 5,
                        replacement_assigned: 6,
                        out_for_delivery: 6,
                        completed: isExchange ? 7 : 5,
                      };

                      const currentIdx = statusToStageIdx[ret.status] || 0;

                      return (
                        <div
                          key={ret._id || index}
                          className="p-3 bg-white rounded-xl border border-amber-100 shadow-sm space-y-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-bold uppercase tracking-wider mr-1.5">
                                {isExchange ? "Exchange" : "Return"}
                              </span>
                              <p className="text-xs font-bold text-slate-800 inline-block">
                                {ret.vendorId?.storeName || "Vendor return"}
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">
                                ID:{" "}
                                {String(ret._id || "")
                                  .slice(-6)
                                  .toUpperCase()}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${currentStatus.badge}`}
                            >
                              {currentStatus.label}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                            {currentStatus.desc}
                          </p>

                          {/* Secure Return Pickup OTP Card */}
                          {[
                            "approved",
                            "pickup_pending",
                            "pickup_assigned",
                          ].includes(ret.status) && (
                            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2">
                              <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                                🔑 Return Pickup OTP
                              </p>
                              <p className="text-[11px] font-semibold text-amber-700 leading-snug">
                                Provide this 6-digit verification code to the
                                rider when they arrive to collect the package.
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-2xl font-black text-amber-850 tracking-widest text-center py-2 bg-white rounded-lg border border-amber-200 font-mono shadow-sm">
                                  {ret.returnPickupOtpDebug || "Check Email"}
                                </span>
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    const btn = e.currentTarget;
                                    btn.disabled = true;
                                    const originalText = btn.innerText;
                                    btn.innerText = "Sending...";
                                    try {
                                      await api.post(
                                        `/user/returns/${ret._id}/regenerate-otp`,
                                      );
                                      toast.success(
                                        "New OTP generated successfully.",
                                      );
                                      fetchOrderById(orderId);
                                    } catch (err) {
                                      toast.error(
                                        err.response?.data?.message ||
                                          "Failed to regenerate OTP",
                                      );
                                    } finally {
                                      btn.disabled = false;
                                      btn.innerText = originalText;
                                    }
                                  }}
                                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-sm transition-colors flex-shrink-0"
                                >
                                  Resend OTP
                                </button>
                              </div>
                            </div>
                          )}
                          {ret.status === "out_for_delivery" && (
                            <div className="p-3 bg-purple-50/50 border border-purple-250 rounded-xl space-y-2">
                              <p className="text-[10px] font-black text-purple-900 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                                🔑 Replacement Delivery OTP
                              </p>
                              <p className="text-[11px] font-semibold text-purple-700 leading-snug">
                                Provide this 6-digit verification code to the
                                rider when they arrive to deliver the
                                replacement item.
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="flex-1 text-2xl font-black text-purple-850 tracking-widest text-center py-2 bg-white rounded-lg border border-purple-200 font-mono shadow-sm">
                                  {ret.customerDeliveryOtpDebug ||
                                    "Check Email"}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Visual Timeline Stepper */}
                          {ret.status !== "rejected" && (
                            <div className="pt-3 border-t border-slate-100 space-y-3">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                Status Timeline
                              </p>
                              <div className="relative pl-4 space-y-3">
                                {/* Connecting line */}
                                <div className="absolute left-[5px] top-[4px] bottom-[4px] w-[2px] bg-slate-100" />
                                <div
                                  className="absolute left-[5px] top-[4px] w-[2px] bg-emerald-500 transition-all duration-300"
                                  style={{
                                    height: `${(currentIdx / (stages.length - 1)) * 100}%`,
                                  }}
                                />

                                {stages.map((stage, sIdx) => {
                                  const isDone = sIdx <= currentIdx;
                                  const isCurrent = sIdx === currentIdx;
                                  return (
                                    <div
                                      key={sIdx}
                                      className="flex items-center gap-3 relative"
                                    >
                                      <div
                                        className={`absolute -left-[15px] w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 ${
                                          isDone
                                            ? "bg-emerald-500 border-emerald-500"
                                            : "bg-white border-slate-200"
                                        } ${isCurrent ? "ring-4 ring-emerald-500/25 scale-110" : ""}`}
                                      />
                                      <span
                                        className={`text-[10px] font-bold tracking-tight transition-colors duration-300 ${
                                          isDone
                                            ? "text-slate-800"
                                            : "text-slate-400"
                                        }`}
                                      >
                                        {stage.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {isExchange &&
                            ret.exchangeDetails?.requestedVariant && (
                              <div className="pt-2 text-[10px] font-black text-slate-500 border-t border-slate-50 flex gap-3">
                                {ret.exchangeDetails.requestedVariant.size && (
                                  <span>
                                    Size:{" "}
                                    {ret.exchangeDetails.requestedVariant.size}
                                  </span>
                                )}
                                {ret.exchangeDetails.requestedVariant.color && (
                                  <span>
                                    Color:{" "}
                                    {ret.exchangeDetails.requestedVariant.color}
                                  </span>
                                )}
                              </div>
                            )}

                          <div className="pt-2 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-slate-400">
                            <span>Amount: {formatPrice(ret.refundAmount)}</span>
                            <span>
                              {new Date(ret.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Shipping Address */}
            <div className="glass-card rounded-2xl p-4">
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiMapPin className="text-primary-600" />
                Shipping Address
              </h2>
              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-semibold text-gray-800">
                  {shippingAddress.name || "N/A"}
                </p>
                <p>{shippingAddress.address || "N/A"}</p>
                <p>
                  {shippingAddress.city || "N/A"},{" "}
                  {shippingAddress.state || "N/A"}{" "}
                  {shippingAddress.zipCode || "N/A"}
                </p>
                <p>{shippingAddress.country || "N/A"}</p>
                <p className="mt-2">Phone: {shippingAddress.phone || "N/A"}</p>
              </div>
            </div>

            {/* Payment Info */}
            <div className="glass-card rounded-2xl p-4">
              <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiCreditCard className="text-primary-600" />
                Payment Information
              </h2>
              <div className="text-sm text-gray-600 space-y-2">
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span className="font-semibold text-gray-800 capitalize">
                    {order.paymentMethod}
                  </span>
                </div>
                {order.trackingNumber && (
                  <div className="flex justify-between">
                    <span>Tracking Number:</span>
                    <span className="font-semibold text-gray-800">
                      {order.trackingNumber}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Order Date:</span>
                  <span className="font-semibold text-gray-800">
                    {formatDate(order.date)}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="glass-card rounded-2xl p-4">
              <h2 className="text-base font-bold text-gray-800 mb-3">
                Order Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{formatPrice(order.shipping)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span>
                  <span>{formatPrice(order.tax)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-800 pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <span className="text-primary-600">
                    {formatPrice(order.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {order.status === "payment_pending" && (
                <button
                  onClick={handleRetryPayment}
                  disabled={isRetryingPayment}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  <FiCreditCard className="text-lg" />
                  {isRetryingPayment
                    ? "Opening Payment..."
                    : "Complete Payment (Pay Now)"}
                </button>
              )}
              {["pending", "processing", "payment_pending"].includes(
                order.status,
              ) && (
                <button
                  onClick={handleCancel}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition-colors"
                >
                  Cancel Order
                </button>
              )}

              <button
                onClick={handleReorder}
                className="w-full py-3 gradient-green text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:shadow-glow-green transition-all"
              >
                <FiRotateCw className="text-lg" />
                Reorder
              </button>
              {order.status === "delivered" && (
                <div
                  className={`w-full py-2.5 px-4 rounded-xl border text-center font-bold text-[11px] uppercase tracking-wider ${
                    hasSevenDaysPassed
                      ? "bg-red-50/50 border-red-100 text-red-600"
                      : "bg-green-50/50 border-green-100 text-green-700"
                  }`}
                >
                  {hasSevenDaysPassed
                    ? "Return policy expired (7 days elapsed)"
                    : "🛡️ Covered by 7-Day Return Policy"}
                </div>
              )}
              {order.status === "delivered" &&
              !hasPendingOrCompletedReturn &&
              !hasSevenDaysPassed &&
              ![
                "returned",
                "refunded",
                "return_in_progress",
                "exchange_in_progress",
              ].includes(order.status) ? (
                <button
                  onClick={openReturnModal}
                  className="w-full py-3 bg-amber-50 text-amber-700 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors"
                >
                  <FiPackage className="text-lg" />
                  Request Return / Exchange
                </button>
              ) : (
                (hasPendingOrCompletedReturn ||
                  [
                    "returned",
                    "refunded",
                    "return_in_progress",
                    "exchange_in_progress",
                  ].includes(order?.status)) && (
                  <div className="w-full py-3 bg-gray-50 border border-gray-200 text-gray-500 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
                    <FiPackage className="text-lg" />
                    {order?.status === "returned" ||
                    order?.status === "refunded" ||
                    (Array.isArray(order?.returnRequests) &&
                      order.returnRequests.some(
                        (r) => r.status === "completed",
                      ))
                      ? "Return Completed"
                      : "Return Request Submitted"}
                  </div>
                )
              )}
              <button
                onClick={() => navigate(`/track-order/${order.id}`)}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
              >
                <FiTruck className="text-lg" />
                Track Order
              </button>
            </div>
          </div>
        </div>

        {showReturnModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center sm:justify-center"
            onClick={resetReturnModal}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">
                  Request Return / Exchange
                </h3>
                <button
                  onClick={resetReturnModal}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <FiX className="text-gray-600" />
                </button>
              </div>

              {/* Product Selection List */}
              {allOrderItems.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Items to Return
                  </label>
                  <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-100 p-2 rounded-xl">
                    {allOrderItems.map((item) => {
                      const prodId = String(item.productId || item.id || "");
                      const stateVal = selectedItems[prodId] || {
                        checked: false,
                        quantity: 1,
                        maxQuantity: item.quantity || 1,
                      };
                      return (
                        <div
                          key={prodId}
                          className="flex items-center justify-between gap-3 p-2 bg-slate-50/50 rounded-xl border border-slate-100"
                        >
                          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={stateVal.checked}
                              onChange={() => handleToggleCheck(prodId)}
                              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                            />
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-gray-100 flex-shrink-0">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-grow min-w-0">
                              <span className="block text-xs font-bold text-gray-800 truncate leading-tight">
                                {item.name}
                              </span>
                              <span className="block text-[10px] text-gray-400 font-bold mt-0.5">
                                Sold by: {item.vendorName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                Qty purchased: {stateVal.maxQuantity}
                              </span>
                            </div>
                          </label>

                          {/* Quantity Controls */}
                          {stateVal.checked && stateVal.maxQuantity > 1 && (
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(prodId, -1)}
                                className="w-5 h-5 flex items-center justify-center text-xs font-black text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                -
                              </button>
                              <span className="w-4 text-center text-xs font-bold text-slate-700">
                                {stateVal.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(prodId, 1)}
                                className="w-5 h-5 flex items-center justify-center text-xs font-black text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Request Type Selector */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Request Type
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRequestType("return")}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      requestType === "return"
                        ? "bg-white text-slate-800 shadow-sm border border-slate-100"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Return (Refund)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestType("exchange")}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      requestType === "exchange"
                        ? "bg-white text-slate-800 shadow-sm border border-slate-100"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Exchange (Replacement)
                  </button>
                </div>
              </div>

              {/* Exchange Fields */}
              {/* Exchange Fields */}
              {requestType === "exchange" && (
                <div className="mb-4 space-y-3 animate-fadeIn">
                  {/* Find the checked product */}
                  {(() => {
                    const checkedEntry = Object.entries(selectedItems).find(
                      ([_, value]) => value.checked === true,
                    );
                    if (!checkedEntry) {
                      return (
                        <div className="p-3 bg-purple-50/20 border border-dashed border-purple-200 rounded-xl text-center text-xs font-semibold text-purple-700">
                          Please select an item above to choose replacement
                          variant.
                        </div>
                      );
                    }

                    const prodId = checkedEntry[0];
                    const orderItem = allOrderItems.find(
                      (it) => String(it.productId || it.id || "") === prodId,
                    );
                    if (!orderItem) return null;

                    return (
                      <div className="space-y-3 p-3 bg-purple-50/20 border border-purple-100 rounded-2xl">
                        {/* Show Current Variant */}
                        <div className="p-2.5 bg-white border border-purple-200/60 rounded-xl space-y-1">
                          <span className="text-[10px] font-black text-purple-900 uppercase tracking-widest block font-sans">
                            Current Variant Purchased
                          </span>
                          <div className="flex gap-4 text-xs font-bold text-slate-700 font-sans">
                            <span>
                              Size:{" "}
                              <span className="text-slate-900">
                                {orderItem.variant?.size || "N/A"}
                              </span>
                            </span>
                            <span>
                              Color:{" "}
                              <span className="text-slate-900 capitalize">
                                {orderItem.variant?.color || "N/A"}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Choose Replacement */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-purple-900 uppercase tracking-widest block font-sans">
                            Choose Replacement Variant
                          </span>
                          {productDetailsMap[prodId] ? (
                            <VariantSelector
                              variants={productDetailsMap[prodId].variants}
                              currentPrice={productDetailsMap[prodId].price}
                              selectedVariant={exchangeVariants[prodId] || {}}
                              onVariantChange={(newVariant) => {
                                // Check if it is same as purchased
                                const sameSize =
                                  String(newVariant.size || "")
                                    .trim()
                                    .toLowerCase() ===
                                  String(orderItem.variant?.size || "")
                                    .trim()
                                    .toLowerCase();
                                const sameColor =
                                  String(newVariant.color || "")
                                    .trim()
                                    .toLowerCase() ===
                                  String(orderItem.variant?.color || "")
                                    .trim()
                                    .toLowerCase();
                                if (sameSize && sameColor) {
                                  toast.error(
                                    "Cannot exchange for the exact same size and color.",
                                  );
                                  return;
                                }
                                setExchangeVariants((prev) => ({
                                  ...prev,
                                  [prodId]: newVariant,
                                }));
                              }}
                            />
                          ) : (
                            <p className="text-xs text-slate-400 font-semibold italic">
                              Loading variants...
                            </p>
                          )}
                        </div>

                        {/* Inventory Check & Price difference */}
                        {exchangeVariants[prodId] &&
                          productDetailsMap[prodId] && (
                            <div className="pt-2.5 border-t border-purple-200/50 space-y-2.5">
                              {(() => {
                                const variant = exchangeVariants[prodId];
                                const productData = productDetailsMap[prodId];

                                // Get stock level
                                const signature = getVariantSignature(variant);
                                const entries = Object.entries(
                                  productData.variants?.stockMap || {},
                                );
                                const exact = entries.find(
                                  ([k]) =>
                                    String(k).trim().toLowerCase() ===
                                    signature.toLowerCase(),
                                );
                                const stockCount = exact ? Number(exact[1]) : 0;

                                // Get price difference
                                const basePrice = Number(
                                  productData.price || 0,
                                );
                                const priceEntries = Object.entries(
                                  productData.variants?.prices || {},
                                );
                                const pExact = priceEntries.find(
                                  ([k]) =>
                                    String(k).trim().toLowerCase() ===
                                    signature.toLowerCase(),
                                );
                                const variantPrice = pExact
                                  ? Number(pExact[1])
                                  : basePrice;

                                const purchasedPrice = Number(
                                  orderItem.price || 0,
                                );
                                const priceDiff = variantPrice - purchasedPrice;

                                const isOutOfStock = stockCount <= 0;

                                return (
                                  <div className="space-y-2">
                                    {/* Stock status */}
                                    <div className="flex items-center gap-1.5 text-xs font-bold font-sans">
                                      <span
                                        className={
                                          isOutOfStock
                                            ? "text-red-600"
                                            : "text-emerald-600"
                                        }
                                      >
                                        {isOutOfStock
                                          ? "● Out of Stock"
                                          : stockCount <= 3
                                            ? `● Low Stock: Only ${stockCount} left`
                                            : "✓ In Stock"}
                                      </span>
                                    </div>

                                    {/* Price Diff */}
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-100 flex justify-between text-xs font-bold text-slate-700 font-sans shadow-sm">
                                      <span>Price Difference:</span>
                                      <span
                                        className={
                                          priceDiff > 0
                                            ? "text-red-650"
                                            : priceDiff < 0
                                              ? "text-green-650"
                                              : "text-slate-900"
                                        }
                                      >
                                        {priceDiff > 0
                                          ? `Pay Difference: +${formatPrice(priceDiff)}`
                                          : priceDiff < 0
                                            ? `Refund Difference: -${formatPrice(Math.abs(priceDiff))}`
                                            : "No Difference"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reason for Return / Exchange
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-medium text-gray-700 bg-white"
                >
                  {RETURN_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {returnReason === "Other" && (
                <div className="mb-4 animate-fadeIn">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Custom Reason (min. 10 characters)
                  </label>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="Please explain your return request in detail..."
                  />
                </div>
              )}

              {/* Evidence Images Upload */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Evidence Photos (Optional, max 5)
                </label>
                <p className="text-[10px] text-gray-400 mb-2 font-medium">
                  Upload images showing product defects or details to speed up
                  vendor inspection.
                </p>

                {/* File Input */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center justify-center w-12 h-12 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-slate-50 transition-all flex-shrink-0">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={evidenceFiles.length >= 5}
                    />
                    <span className="text-lg font-bold text-gray-400">+</span>
                  </label>

                  {/* Previews List */}
                  <div className="flex items-center gap-2 overflow-x-auto flex-1 py-1">
                    {evidencePreviews.map((preview, index) => (
                      <div
                        key={index}
                        className="relative w-12 h-12 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 bg-slate-50"
                      >
                        <img
                          src={preview}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg w-5 h-5 flex items-center justify-center text-xs font-black hover:bg-red-650 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleRequestReturn}
                disabled={isSubmittingReturn}
                className="w-full py-3 gradient-green text-white rounded-xl font-semibold disabled:opacity-70"
              >
                {isSubmittingReturn
                  ? "Submitting..."
                  : requestType === "exchange"
                    ? "Submit Exchange Request"
                    : "Submit Return Request"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrderDetail;
