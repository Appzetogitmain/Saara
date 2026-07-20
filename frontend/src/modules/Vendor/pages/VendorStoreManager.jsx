import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSave, FiSettings, FiLayout, FiImage, FiCompass, FiFolder,
  FiSearch, FiActivity, FiGlobe, FiUpload, FiPlus, FiTrash2,
  FiChevronDown, FiChevronUp, FiEdit, FiEye, FiCheckCircle,
  FiShoppingBag, FiInfo, FiCopy, FiEyeOff, FiMessageSquare
} from "react-icons/fi";
import api from "../../../shared/utils/api";
import toast from "react-hot-toast";
import { validatePageName, validateNavigationLabel, validateCollectionName, validateStoreDetails } from "../utils/storeValidators";
import { RESERVED_SLUGS } from "../../../shared/constants/reservedSlugs";

const PRESET_THEMES = {
  modern: { primary: "#7c3aed", accent: "#10b981", bg: "#ffffff", text: "#1e293b", border: "lg", button: "filled", font: "Inter", spacing: "cozy", shadow: "sm" },
  classic: { primary: "#10b981", accent: "#2563eb", bg: "#f9fafb", text: "#111827", border: "md", button: "filled", font: "Outfit", spacing: "cozy", shadow: "sm" },
  luxury: { primary: "#d97706", accent: "#292524", bg: "#fafaf9", text: "#1c1917", border: "none", button: "outline", font: "Lora", spacing: "spacious", shadow: "lg" },
  dark: { primary: "#a78bfa", accent: "#06b6d4", bg: "#0f172a", text: "#f3f4f6", border: "full", button: "pill", font: "Inter", spacing: "compact", shadow: "none" }
};

const EMOJI_OPTIONS = ["🏠", "🔥", "⭐", "👕", "🎁", "📞", "✉️", "🛍️", "🏷️", "ℹ️"];

const generateMongoObjectId = () => {
  const timestamp = Math.floor(new Date().getTime() / 1000).toString(16).padStart(8, '0');
  const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return timestamp + random;
};

const slugify = (text) => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")          // Replace spaces with -
    .replace(/[^\w\-]+/g, "")       // Remove all non-word chars
    .replace(/\-\-+/g, "-");        // Replace multiple - with single -
};

const VendorStoreManager = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [store, setStore] = useState(null);
  const [pages, setPages] = useState([]);
  const [collections, setCollections] = useState([]);
  const [storeMenus, setStoreMenus] = useState([]);
  const [dirtyMenus, setDirtyMenus] = useState({});
  const [mediaAssets, setMediaAssets] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const [globalCategories, setGlobalCategories] = useState([]);
  const [globalBrands, setGlobalBrands] = useState([]);
  const [vendorProducts, setVendorProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inquiries State
  const [inquiries, setInquiries] = useState([]);
  const [unreadInquiriesCount, setUnreadInquiriesCount] = useState(0);
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [inquirySearch, setInquirySearch] = useState("");
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState("all");
  const [inquirySort, setInquirySort] = useState("newest");
  const [inquiryReplyText, setInquiryReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Custom page creation templates state
  const [showCreatePageModal, setShowCreatePageModal] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageTemplate, setNewPageTemplate] = useState("blank");

  // Media Library parameters
  const [activeMediaFolder, setActiveMediaFolder] = useState("Misc");
  const mediaFolders = ["Home", "Collections", "Logos", "Promotions", "Seasonal", "Archive", "Misc"];

  // Visual Canvas Builder workspace
  const [editingPageKey, setEditingPageKey] = useState(null);
  const [canvasSections, setCanvasSections] = useState([]);
  const [canvasLayout, setCanvasLayout] = useState({ type: "fullWidth", maxWidth: "1440px" });
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(null);
  const [inspectorTab, setInspectorTab] = useState("content");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [showSectionPickerModal, setShowSectionPickerModal] = useState(false);

  // Real-time collection rule matching state
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  let activeCollectionIdx = null;
  if (activeCollectionId) {
    const idx = collections.findIndex(c => (c._id || c.id) === activeCollectionId);
    if (idx !== -1) activeCollectionIdx = idx;
  }
  const [matchedProducts, setMatchedProducts] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);



  const setupSteps = useMemo(() => {
    if (!store) return [];

    const items = [
      { id: "name", title: "Store Name", completed: !!store.storeName, actionLabel: "Set Store Name", tab: "branding" },
      { id: "branding", title: "Store Branding", completed: !!(store.logo && store.coverBanner), actionLabel: "Upload Branding Assets", tab: "branding" },
      { id: "contact", title: "Contact Information", completed: !!(store.contact?.email && store.contact?.phone), actionLabel: "Set Contact Details", tab: "branding" },
      { id: "home_pub", title: "Homepage Published", completed: pages.some(p => p.pageKey === "home" && p.status === "published"), actionLabel: "Publish Home Page", tab: "pages", editPage: "home" },
      { id: "products", title: "Products Added", completed: (analytics?.summary?.productsCount || 0) > 0, actionLabel: "Add Products", path: "/vendor/products" },
      { id: "navigation", title: "Navigation Configured", completed: !!(storeMenus?.some(m => m.items?.length > 0) || store.navigation?.length > 0), actionLabel: "Configure Navigation", tab: "navigation" },
      { id: "collections", title: "Collections Created", completed: collections.length > 0, actionLabel: "Create Collections", tab: "collections" }
    ];

    const completedCount = items.filter(s => s.completed).length;
    const percentage = Math.round((completedCount / items.length) * 100);

    items.push({
      id: "ready",
      title: "Store Ready",
      completed: percentage >= 100,
      actionLabel: "Launch Store",
      tab: "dashboard"
    });

    return items;
  }, [store, pages, analytics, storeMenus, collections]);

  const completionPercentage = useMemo(() => {
    const items = setupSteps.filter(s => s.id !== "ready");
    if (items.length === 0) return 0;
    const completed = items.filter(s => s.completed).length;
    return Math.round((completed / items.length) * 100);
  }, [setupSteps]);

  const fetchInquiries = async (params = {}) => {
    try {
      const queryParams = new URLSearchParams(params).toString();
      const res = await api.get(`/vendor/store/inquiries?${queryParams}`);
      const data = res?.data ?? res ?? { inquiries: [], unreadCount: 0 };
      setInquiries(data.inquiries || []);
      setUnreadInquiriesCount(data.unreadCount || 0);
    } catch (err) {
      console.error("Failed to fetch inquiries:", err);
    }
  };

  useEffect(() => {
    const loadBuilderWorkspace = async () => {
      setLoading(true);
      try {
        const [storeRes, pagesRes, catsRes, brandsRes, analyticsRes, menusRes, productsRes, inquiriesRes] = await Promise.all([
          api.get("/vendor/store"),
          api.get("/vendor/store/pages"),
          api.get("/categories/all"),
          api.get("/brands/all"),
          api.get("/vendor/store/analytics").catch(() => null),
          api.get("/vendor/store/menus").catch(() => null),
          api.get("/vendor/products?limit=1000").catch(() => null),
          api.get("/vendor/store/inquiries").catch(() => null)
        ]);

        const storeData = storeRes?.data ?? storeRes;
        setStore(storeData);

        const pagesData = pagesRes?.data ?? pagesRes;
        setPages(pagesData || []);

        setGlobalCategories(catsRes?.data ?? catsRes ?? []);
        setGlobalBrands(brandsRes?.data ?? brandsRes ?? []);
        setVendorProducts(productsRes?.data?.products ?? productsRes?.products ?? []);

        if (analyticsRes) {
          setAnalytics(analyticsRes?.data ?? analyticsRes);
        }

        if (menusRes) {
          setStoreMenus(menusRes?.data ?? menusRes ?? []);
        }

        // Fetch collections
        const colRes = await api.get("/vendor/store/collections").catch(() => null);
        setCollections(colRes?.data ?? colRes ?? []);

        // Load inquiries data
        const inquiriesData = inquiriesRes?.data ?? inquiriesRes ?? { inquiries: [], unreadCount: 0 };
        setInquiries(inquiriesData.inquiries || []);
        setUnreadInquiriesCount(inquiriesData.unreadCount || 0);

        // Media Library mock assets
        setMediaAssets([
          { name: "Banner Cover.png", url: storeData.coverBanner, folder: "Home" },
          { name: "Store Logo.png", url: storeData.logo, folder: "Logos" }
        ].filter(a => a.url));

      } catch (err) {
        console.error("Error loading workspace data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadBuilderWorkspace();
  }, []);

  // Deep-linking from notification click check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inquiryId = params.get("inquiryId");
    if (inquiryId) {
      setActiveTab("inquiries");
      setSelectedInquiryId(inquiryId);
    }
  }, []);

  // Load selected inquiry details and mark it as read
  useEffect(() => {
    if (selectedInquiryId) {
      const fetchInquiryDetails = async () => {
        try {
          const res = await api.get(`/vendor/store/inquiries/${selectedInquiryId}`);
          const data = res?.data ?? res;
          setSelectedInquiry(data);

          if (data && !data.isRead) {
            setUnreadInquiriesCount(prev => Math.max(0, prev - 1));
            setInquiries(prev => prev.map(inq => inq._id === selectedInquiryId ? { ...inq, isRead: true } : inq));
          }
        } catch (err) {
          toast.error("Failed to load inquiry details.");
          console.error(err);
        }
      };
      fetchInquiryDetails();
    } else {
      setSelectedInquiry(null);
    }
  }, [selectedInquiryId]);

  // Load inquiries list when activeTab is inquiries or search/filters/sort change
  useEffect(() => {
    if (activeTab === "inquiries") {
      const params = {};
      if (inquiryStatusFilter !== "all") params.status = inquiryStatusFilter;
      if (inquirySearch) params.search = inquirySearch;
      params.sort = inquirySort;
      fetchInquiries(params);
    }
  }, [activeTab, inquiryStatusFilter, inquirySearch, inquirySort]);

  // Save Storefront Settings
  const saveStoreSettings = async (payload) => {
    const val = validateStoreDetails(payload);
    if (!val.isValid) return toast.error(val.error);

    const safePayload = {
      storeName: payload.storeName,
      tagline: payload.businessInfo?.tagline,
      description: payload.description,
      logo: payload.logo,
      coverBanner: payload.coverBanner,
      businessInfo: payload.businessInfo,
      contact: payload.contact,
      socialLinks: payload.socialLinks,
      businessHours: payload.contact?.businessHours,
      responseTime: payload.businessInfo?.responseTime,
      establishedYear: payload.businessInfo?.establishedYear
    };

    setSaving(true);
    try {
        const res = await api.put("/vendor/store", safePayload);
        const updated = res?.data ?? res;
        setStore(updated);
      toast.success("Branding settings saved successfully!");
      } catch {
        // handled
      } finally {
        setSaving(false);
      }
    };

    // Publish Page Layout (Draft to live publishedSections)
    const handlePublishPage = async (pageKey) => {
      setSaving(true);
      try {
        const res = await api.post(`/vendor/store/pages/${pageKey}/publish`);
        const updatedPage = res?.data ?? res;
        setPages(prev => prev.map(p => p.pageKey === pageKey ? updatedPage : p));
        toast.success(`Published page layout successfully! (Version: ${updatedPage.publishVersion})`);
      } catch {
        // handled
      } finally {
        setSaving(false);
      }
    };

    // Visual Canvas Page editor opening
    const handleEditPage = (pageKey) => {
      const existing = pages.find(p => p.pageKey === pageKey);
      setEditingPageKey(pageKey);
      setCanvasSections(existing?.sections || []);
      setCanvasLayout(existing?.layout || { type: "fullWidth", maxWidth: "1440px" });
      setSelectedSectionIdx(null);
      setIsUnsaved(false);
      setPreviewMode("desktop");
    };

    // Save Draft Layout Page
    const handleSavePageDraft = async (shouldExit = false) => {
      setSaving(true);
      try {
        const targetPage = pages.find(p => p.pageKey === editingPageKey) || {
          pageKey: editingPageKey,
          pageSettings: { title: editingPageKey.toUpperCase() }
        };

        const res = await api.put(`/vendor/store/pages/${editingPageKey}`, {
          pageSettings: targetPage.pageSettings,
          layout: canvasLayout,
          sections: canvasSections
        });
        const saved = res?.data ?? res;

        setPages(prev => {
          const idx = prev.findIndex(p => p.pageKey === editingPageKey);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = saved;
            return next;
          }
          return [...prev, saved];
        });

        toast.success("Draft layout saved successfully.");
        setIsUnsaved(false);
        if (shouldExit) {
          setEditingPageKey(null);
        }
      } catch {
        // handled
      } finally {
        setSaving(false);
      }
    };

    const PAGE_TEMPLATES = {
      blank: [],
      faq: [
        { sectionType: "Text Block", title: "Frequently Asked Questions", subtitle: "Q: What is the delivery time?\nA: Typically 3-5 business days.\n\nQ: Do you offer refunds?\nA: Yes, within 7 days of purchase.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      offers: [
        { sectionType: "Banner", title: "Special Offers", subtitle: "Explore our limited-time discounts and seasonal deals.", bannerUrl: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200", layout: "carousel", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      careers: [
        { sectionType: "Text Block", title: "Careers at Our Store", subtitle: "We are always looking for talented individuals to join our team.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      shipping: [
        { sectionType: "Text Block", title: "Shipping Policy", subtitle: "We ship orders worldwide. Standard shipping takes 3-5 business days.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      privacy: [
        { sectionType: "Text Block", title: "Privacy Policy", subtitle: "Your privacy is important to us. We secure all personal transaction details.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      return: [
        { sectionType: "Text Block", title: "Return Policy", subtitle: "We offer easy returns within 30 days of purchase.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ],
      size_guide: [
        { sectionType: "Text Block", title: "Size Guide", subtitle: "Find the perfect fit with our comprehensive sizing charts.", order: 1, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } },
        { sectionType: "Image", title: "Measurement Instructions", subtitle: "How to measure yourself accurately.", order: 2, enabled: true, visibility: { desktop: true, tablet: true, mobile: true } }
      ]
    };

    const handleCreateCustomPage = async () => {
      const titleVal = validatePageName(newPageTitle);
      if (!titleVal.isValid) return toast.error(titleVal.error);

      const pageKey = slugify(titleVal.value);
      if (!pageKey) return toast.error("Invalid page title.");

      if (RESERVED_SLUGS.includes(pageKey.toLowerCase())) {
        return toast.error(`The slug "${pageKey}" is reserved for system use.`);
      }

      if (pages.some(p => p.pageKey === pageKey)) {
        return toast.error("A page with this name already exists.");
      }

      setSaving(true);
      try {
        const templateSections = PAGE_TEMPLATES[newPageTemplate] || [];
        const res = await api.put(`/vendor/store/pages/${pageKey}`, {
          pageSettings: { title: newPageTitle, enabled: true },
          layout: { type: "fullWidth", maxWidth: "1440px" },
          sections: templateSections
        });
        const savedPage = res?.data ?? res;
        setPages(prev => [...prev, savedPage]);
        setShowCreatePageModal(false);
        setNewPageTitle("");
        toast.success("Page created successfully from template!");
        handleEditPage(pageKey);
      } catch (err) {
        toast.error("Failed to create page.");
      } finally {
        setSaving(false);
      }
    };

    const handleCreateCollection = async () => {
      setSaving(true);
      try {
        const res = await api.post("/vendor/store/collections", {
          name: "New Collection",
          curationMode: "automatic",
          ruleGroups: [{ match: "all", conditions: [] }],
          products: [],
          enabled: true
        });
        const saved = res?.data ?? res;
        setCollections(prev => [...prev, saved]);
        setActiveCollectionId(saved._id || saved.id);
        toast.success("Collection created successfully!");
      } catch {
        toast.error("Failed to create collection.");
      } finally {
        setSaving(false);
      }
    };

    const handleSaveActiveCollection = async () => {
      if (activeCollectionIdx === null || !collections[activeCollectionIdx]) return;
      const col = collections[activeCollectionIdx];
      if (!col._id && !col.id) return;

      const nameVal = validateCollectionName(col.name);
      if (!nameVal.isValid) return toast.error(nameVal.error);

      setSaving(true);
      try {
        const res = await api.put(`/vendor/store/collections/${col._id || col.id}`, {
          name: col.name,
          curationMode: col.curationMode,
          ruleGroups: col.ruleGroups,
          products: col.products,
          image: col.image,
          enabled: col.enabled,
          order: col.order
        });
        const saved = res?.data ?? res;
        setCollections(prev => prev.map((c, i) => i === activeCollectionIdx ? saved : c));
        toast.success("Collection saved successfully!");
      } catch {
        toast.error("Failed to save collection.");
      } finally {
        setSaving(false);
      }
    };

    const handleDeleteActiveCollection = async () => {
      if (activeCollectionIdx === null || !collections[activeCollectionIdx]) return;
      if (!window.confirm("Are you sure you want to delete this collection?")) return;
      const col = collections[activeCollectionIdx];
      if (col._id || col.id) {
        setSaving(true);
        try {
          await api.delete(`/vendor/store/collections/${col._id || col.id}`);
          setCollections(prev => prev.filter((_, i) => i !== activeCollectionIdx));
          setActiveCollectionId(null);
          toast.success("Collection deleted successfully.");
        } catch {
          toast.error("Failed to delete collection.");
        } finally {
          setSaving(false);
        }
      } else {
        setCollections(prev => prev.filter((_, i) => i !== activeCollectionIdx));
        setActiveCollectionId(null);
      }
    };

    // Section manipulation actions on visual canvas
    const handleAddSectionToCanvas = (type) => {
      let sectionType = type;
      let title = `New ${type} Block`;
      let subtitle = "Customize parameters in properties panel";
      let defaultFields = {};

      if (type === "Hero Banner" || type === "Offer Banner" || type === "Image Banner") {
        sectionType = "Banner";
        title = type === "Hero Banner" ? "Welcome to Our Store" : type === "Offer Banner" ? "Summer Sale - 50% Off" : "Featured Promotion";
        subtitle = "Check out our newest drops of the season.";
        defaultFields = { bannerUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200", ctaText: "Shop Now", ctaLink: "/shop" };
      } else if (type === "Featured Products" || type === "New Arrivals" || type === "Best Sellers") {
        sectionType = "Product Grid";
        title = type;
        subtitle = type === "New Arrivals" ? "Hot off the press drops!" : "Curated selections just for you.";
        defaultFields = { displayLimit: 8, criteria: type === "New Arrivals" ? "latest" : type === "Best Sellers" ? "best_selling" : "latest" };
      } else if (type === "Product Collection") {
        sectionType = "Product Grid";
        title = "Curated Curation Collection";
        subtitle = "Handpicked collection pieces.";
        defaultFields = { displayLimit: 4, criteria: "manual" };
      } else if (type === "Shop by Category" || type === "Featured Categories") {
        sectionType = "Category Grid";
        title = type;
        subtitle = "Browse our high-quality catalog spaces.";
      } else if (type === "Text Section" || type === "FAQ" || type === "Contact Info") {
        sectionType = "Text Block";
        title = type === "FAQ" ? "Frequently Asked Questions" : type === "Contact Info" ? "Visit Us / Support" : "Brand Philosophy";
        subtitle = type === "FAQ" ? "Have questions? We have answers." : "We'd love to hear from you.";
      } else if (type === "Spacer") {
        sectionType = "Spacer";
      } else if (type === "Divider") {
        sectionType = "Divider";
      }

      const newSec = {
        _id: generateMongoObjectId(),
        sectionType: sectionType,
        title: title,
        subtitle: subtitle,
        layout: "grid",
        order: canvasSections.length + 1,
        enabled: true,
        visibility: { desktop: true, tablet: true, mobile: true },
        ...defaultFields
      };
      setCanvasSections([...canvasSections, newSec]);
      setSelectedSectionIdx(canvasSections.length);
      setIsUnsaved(true);
    };

    const handleMoveSection = (idx, dir) => {
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= canvasSections.length) return;

      const nextSecs = [...canvasSections];
      const temp = nextSecs[idx];
      nextSecs[idx] = nextSecs[targetIdx];
      nextSecs[targetIdx] = temp;

      // Synchronize order properties with array index sequence
      nextSecs.forEach((sec, index) => {
        sec.order = index + 1;
      });

      setCanvasSections(nextSecs);
      if (selectedSectionIdx === idx) setSelectedSectionIdx(targetIdx);
      else if (selectedSectionIdx === targetIdx) setSelectedSectionIdx(idx);
      setIsUnsaved(true);
    };

    const handleDuplicateSection = (idx) => {
      const original = canvasSections[idx];
      const dupe = {
        ...original,
        _id: generateMongoObjectId(),
        title: `${original.title} (Copy)`,
        order: canvasSections.length + 1
      };
      const next = [...canvasSections];
      next.splice(idx + 1, 0, dupe);
      setCanvasSections(next);
      setSelectedSectionIdx(idx + 1);
      setIsUnsaved(true);
    };

    const handleDeleteSection = (idx) => {
      setCanvasSections(canvasSections.filter((_, i) => i !== idx));
      setSelectedSectionIdx(null);
      setIsUnsaved(true);
    };

    // Navigation tab icon emoji mapping helper
    const handleEmojiSelect = (idx, val) => {
      const next = [...store.navigation];
      next[idx].iconName = val;
      setStore({ ...store, navigation: next });
    };



    // Media Library Folder Upload
    const handleFileUpload = async (e, folderName) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);
      formData.append("folder", `storefront/${folderName.toLowerCase()}`);

      try {
        const res = await api.post("/vendor/uploads/image", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        const uploaded = res?.data ?? res;

        const asset = {
          name: file.name,
          url: uploaded.url,
          folder: folderName
        };

        setMediaAssets(prev => [...prev, asset]);
        toast.success(`Uploaded file successfully to ${folderName}`);
      } catch {
        // handled
      }
    };

    // Real-time collection rules compiler previewer
    const fetchMatchingCollectionProducts = async (colIdx) => {
      setLoadingPreview(true);
      try {
        const col = collections[colIdx];
        let conditionsList = [];
        if (col.ruleGroups && col.ruleGroups[0]) {
          conditionsList = col.ruleGroups[0].conditions || [];
        }

        // Compile active conditions list and filter locally
        // Temporary client-side filtering (SB-014)
        let filtered = [...vendorProducts];
        const matchType = col.ruleGroups?.[0]?.match || "all";

        if (conditionsList.length > 0) {
          filtered = filtered.filter(p => {
            const results = conditionsList.map(cond => {
              if (cond.field === "price") {
                const price = p.price || p.basePrice || 0;
                const val = parseFloat(cond.value) || 0;
                if (cond.operator === "less_than") return price < val;
                if (cond.operator === "greater_than") return price > val;
                if (cond.operator === "equals") return price === val;
              }
              if (cond.field === "category") {
                const catStr = String(p.category || p.category?._id || p.category?.name || "");
                return catStr === String(cond.value);
              }
              if (cond.field === "rating") {
                const r = p.averageRating || p.rating || 0;
                const val = parseFloat(cond.value) || 0;
                if (cond.operator === "greater_than") return r > val;
                if (cond.operator === "less_than") return r < val;
              }
              if (cond.field === "discount") {
                const d = p.discount || 0;
                const val = parseFloat(cond.value) || 0;
                if (cond.operator === "greater_than") return d > val;
              }
              return false;
            });
            return matchType === "all" ? results.every(r => r) : results.some(r => r);
          });
        }

        setMatchedProducts(filtered);
      } catch (err) {
        console.error("Previewer fetch error:", err);
      } finally {
        setLoadingPreview(false);
      }
    };

    const handleUpdateCollectionRules = (colIdx, ruleGroups) => {
      const next = [...collections];
      next[colIdx].ruleGroups = ruleGroups;
      setCollections(next);
      fetchMatchingCollectionProducts(colIdx);
    };

    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* Header bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              Store Pages Builder
            </h1>
            <p className="text-sm text-slate-500 font-medium">Design pages with visual layouts canvas and publish versions.</p>
          </div>
          <div className="flex gap-2">
            {editingPageKey && (
              <>
                <button
                  type="button"
                  onClick={() => window.open(`/store/${store.slug}?preview=true`, "_blank")}
                  className="flex items-center gap-1.5 px-4 py-2 border rounded-xl text-xs font-bold hover:bg-gray-50 transition-all"
                >
                  <FiEye /> Preview Canvas
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSavePageDraft(false);
                    await handlePublishPage(editingPageKey);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 shadow-md transition-all"
                >
                  <FiCheckCircle /> Publish Live
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (editingPageKey) handleSavePageDraft();
                else saveStoreSettings(store);
              }}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 shadow-md font-bold text-sm transition-all"
            >
              <FiSave />
              {saving ? "Saving..." : editingPageKey ? "Save Draft Page" : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* Left Side menu */}
          {!editingPageKey && (
            <div className="w-full lg:w-64 bg-white rounded-2xl border p-2 lg:p-3 shadow-sm flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible space-x-1.5 lg:space-x-0 lg:space-y-1.5 shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {[
                { id: "dashboard", label: "Overview", icon: FiActivity },
                { id: "branding", label: "Store Details", icon: FiImage },
                { id: "pages", label: "Pages", icon: FiLayout },
                { id: "collections", label: "Collections", icon: FiFolder },
                { id: "navigation", label: "Navigation", icon: FiCompass },
                { type: "divider" },
                { id: "inquiries", label: "Inquiries", icon: FiMessageSquare }
              ].map((tab, tabIdx) => {
                if (tab.type === "divider") {
                  return <hr key={`div-${tabIdx}`} className="hidden lg:block border-slate-100 my-1.5 w-full" />;
                }
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                const hasBadge = tab.id === "inquiries" && unreadInquiriesCount > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.disabled) return;
                      setActiveTab(tab.id);
                    }}
                    disabled={tab.disabled}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs lg:text-sm transition-all whitespace-nowrap lg:w-full ${tab.disabled
                        ? "opacity-50 cursor-not-allowed text-slate-400"
                        : isSelected
                          ? "bg-purple-600 text-white shadow font-black"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="text-base shrink-0" />
                      <span>{tab.label}</span>
                      {hasBadge && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${isSelected
                            ? "bg-white text-purple-600"
                            : "bg-red-500 text-white"
                          }`}>
                          {unreadInquiriesCount}
                        </span>
                      )}
                    </div>
                    {tab.disabled && (
                      <span className="hidden lg:inline-block text-[8px] bg-slate-100 text-slate-400 border px-1.5 py-0.5 rounded uppercase font-black">Later</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Builder Workspace Panel */}
          <div className="flex-1 w-full bg-white rounded-2xl border p-6 shadow-sm min-h-[500px] min-w-0">

            {/* A. VENDOR-FRIENDLY DASHBOARD */}
            {activeTab === "dashboard" && !editingPageKey && store && (
              <div className="space-y-6">

                {/* Setup Progress Header Banner Card */}
                <div className="p-6 bg-gradient-to-r from-purple-900 to-indigo-800 rounded-3xl text-white shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <h3 className="text-lg font-black tracking-tight">Store Setup Progress</h3>
                      <p className="text-xs text-purple-200 font-semibold">Complete these steps to build a premium shopping experience.</p>
                    </div>
                    <span className="text-3xl font-black">{completionPercentage}% Complete</span>
                  </div>

                  {/* ProgressBar */}
                  <div className="w-full h-3 bg-purple-950/45 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Left Side: Performance, Quick Actions, Tips */}
                  <div className="lg:col-span-2 space-y-6">

                    {/* Performance Overview */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Store Performance</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-2xl bg-white shadow-sm flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-605 flex items-center justify-center text-lg font-bold"><FiActivity /></div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Visitors</span>
                            {analytics?.summary?.visitors > 0 ? (
                              <span className="text-base font-black text-slate-800">{analytics.summary.visitors}</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400">No data available</span>
                            )}
                          </div>
                        </div>
                        <div className="p-4 border rounded-2xl bg-white shadow-sm flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-605 flex items-center justify-center text-lg font-bold"><FiShoppingBag /></div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Orders</span>
                            {analytics?.summary?.orders > 0 ? (
                              <span className="text-base font-black text-slate-800">{analytics.summary.orders}</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400">No data available</span>
                            )}
                          </div>
                        </div>
                        <div className="p-4 border rounded-2xl bg-white shadow-sm flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-605 flex items-center justify-center text-lg font-bold"><FiLayout /></div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Published Pages</span>
                            <span className="text-base font-black text-slate-800">{pages.filter(p => p.status === "published").length}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions Panel */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Quick Actions Shortcuts</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Upload Store Logo", icon: FiImage, tab: "branding" },
                          { label: "Upload Cover Banner", icon: FiImage, tab: "branding" },
                          { label: "Customize Home Page", icon: FiLayout, tab: "pages", editPage: "home" },
                          { label: "Create Collection", icon: FiSettings, tab: "collections" },
                          { label: "Add Navigation Menu", icon: FiCompass, tab: "navigation" },
                          { label: "View Live Storefront", icon: FiEye, viewStore: true }
                        ].map((act, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (act.viewStore) {
                                window.open(`/store/${store.slug}`, "_blank");
                              } else if (act.editPage) {
                                setActiveTab("pages");
                                handleEditPage(act.editPage);
                              } else if (act.tab) {
                                setActiveTab(act.tab);
                              }
                            }}
                            className="flex items-center gap-2.5 p-3.5 bg-gray-50/50 hover:bg-purple-50 border hover:border-purple-200 rounded-2xl text-left text-xs font-bold text-slate-700 transition-all shadow-sm"
                          >
                            <act.icon className="text-purple-600 shrink-0 text-base" />
                            <span>{act.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tips & Recommendations */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tips & Recommendations</h4>
                      <div className="space-y-3">
                        {!store.logo && (
                          <div className="p-4 bg-amber-50/55 border border-amber-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <span className="text-[10px] font-black text-amber-600 block uppercase">Recommended Setup</span>
                              <p className="text-xs text-slate-600 font-semibold mt-0.5">Upload a store logo to build professional client identity.</p>
                            </div>
                            <button onClick={() => setActiveTab("branding")} className="px-3.5 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-bold shadow hover:bg-amber-700">Upload Logo</button>
                          </div>
                        )}
                        {!store.coverBanner && (
                          <div className="p-4 bg-blue-50/55 border border-blue-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <span className="text-[10px] font-black text-blue-600 block uppercase">Visual Tip</span>
                              <p className="text-xs text-slate-600 font-semibold mt-0.5">Upload a cover banner to make your storefront landing layout attractive.</p>
                            </div>
                            <button onClick={() => setActiveTab("branding")} className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold shadow hover:bg-blue-700">Upload Banner</button>
                          </div>
                        )}
                        {!store.description && (
                          <div className="p-4 bg-purple-50/55 border border-purple-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <span className="text-[10px] font-black text-purple-600 block uppercase">Trust Builder</span>
                              <p className="text-xs text-slate-600 font-semibold mt-0.5">Update your store description to explain your values and build trust.</p>
                            </div>
                            <button onClick={() => setActiveTab("branding")} className="px-3.5 py-1.5 bg-purple-600 text-white rounded-lg text-[10px] font-bold shadow hover:bg-purple-750">Update Info</button>
                          </div>
                        )}
                        {store.logo && store.coverBanner && store.description && (
                          <div className="text-center py-6 text-xs text-slate-450 uppercase font-black tracking-widest border border-dashed rounded-2xl">
                            All setup suggestions completed! Your store is optimized.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right Side: Store Preview, Checklist, Recent activity */}
                  <div className="space-y-6">

                    {/* Store Preview Card */}
                    <div className="border rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col">
                      <div className="w-full aspect-[21/9] bg-slate-100 relative">
                        {store.coverBanner ? (
                          <img src={store.coverBanner} className="w-full h-full object-cover" alt="Cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-r from-purple-800 to-indigo-800" />
                        )}
                        <div className="absolute -bottom-6 left-4 w-12 h-12 rounded-full border-2 border-white bg-white overflow-hidden shadow">
                          {store.logo ? (
                            <img src={store.logo} className="w-full h-full object-cover" alt="Logo" />
                          ) : (
                            <div className="w-full h-full bg-purple-600 text-white font-bold flex items-center justify-center">{store.storeName?.[0]}</div>
                          )}
                        </div>
                      </div>
                      <div className="p-4 pt-8 space-y-3">
                        <div>
                          <h5 className="font-black text-sm text-slate-800 truncate">{store.storeName}</h5>
                          <span className="text-[10px] text-slate-400 font-medium truncate block">URL: {`/store/${store.slug}`}</span>
                        </div>
                        <button
                          onClick={() => window.open(`/store/${store.slug}`, "_blank")}
                          className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold text-center hover:bg-slate-800 shadow transition-all"
                        >
                          View My Store
                        </button>
                      </div>
                    </div>

                    {/* Checklist Card */}
                    <div className="border rounded-2xl p-4 bg-white shadow-sm space-y-4">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Complete Your Store</h4>
                      <div className="space-y-2">
                        {setupSteps.map(step => (
                          <div
                            key={step.id}
                            onClick={() => {
                              if (!step.completed) {
                                if (step.editPage) {
                                  setActiveTab(step.tab);
                                  handleEditPage(step.editPage);
                                } else {
                                  setActiveTab(step.tab);
                                }
                              }
                            }}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all ${step.completed ? "text-slate-400" : "hover:bg-slate-50 cursor-pointer font-bold"
                              }`}
                          >
                            <span className="flex items-center gap-2">
                              {step.completed ? (
                                <span className="text-emerald-500 font-bold">✔</span>
                              ) : (
                                <span className="text-slate-300">○</span>
                              )}
                              <span className={step.completed ? "line-through" : ""}>{step.title}</span>
                            </span>
                            {!step.completed && (
                              <span className="text-[10px] text-purple-600 hover:underline">{step.actionLabel}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Activity Card */}
                    <div className="border rounded-2xl p-4 bg-white shadow-sm space-y-3">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Recent Activity</h4>
                      <div className="space-y-2 text-xs font-semibold text-slate-500">
                        <div className="flex justify-between border-b pb-1.5">
                          <span>Home Page Published</span>
                          <span className="text-[10px] text-slate-400">Just Now</span>
                        </div>
                        {store.logo && (
                          <div className="flex justify-between border-b pb-1.5">
                            <span>Store Logo Configured</span>
                            <span className="text-[10px] text-slate-400">Recently</span>
                          </div>
                        )}
                        {store.coverBanner && (
                          <div className="flex justify-between border-b pb-1.5">
                            <span>Cover Banner Configured</span>
                            <span className="text-[10px] text-slate-400">Recently</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* B. STORE INFORMATION DETAILS */}
            {activeTab === "branding" && !editingPageKey && store && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h3 className="text-lg font-black text-slate-800 border-b pb-2">Store Information</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Manage all dynamic business details, policies, and links.</p>
                </div>

                {/* 1. Basic Information */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border space-y-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">Basic Information</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Store Name</label>
                      <input
                        type="text"
                        value={store.storeName || ""}
                        onChange={e => setStore({ ...store, storeName: e.target.value })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">About Store Description</label>
                      <textarea
                        value={store.description || ""}
                        onChange={e => setStore({ ...store, description: e.target.value })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase block">Store Logo</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Logo URL"
                          value={store.logo || ""}
                          onChange={e => setStore({ ...store, logo: e.target.value })}
                          className="flex-1 px-4 py-2 border rounded-xl text-xs bg-white"
                        />
                        <input
                          type="file"
                          className="hidden"
                          id="store-logo-uploader"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("image", file);
                            formData.append("folder", "storefront/logos");
                            try {
                              const res = await api.post("/vendor/uploads/image", formData, {
                                headers: { "Content-Type": "multipart/form-data" }
                              });
                              const uploaded = res?.data ?? res;
                              setStore({ ...store, logo: uploaded.url });
                              toast.success("Store logo uploaded successfully!");
                            } catch (err) {
                              toast.error("Failed to upload store logo.");
                            }
                          }}
                        />
                        <label
                          htmlFor="store-logo-uploader"
                          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-purple-750 shrink-0 flex items-center justify-center transition-all"
                        >
                          Upload
                        </label>
                      </div>
                      {store.logo && (
                        <div className="mt-1 w-12 h-12 rounded-full overflow-hidden border">
                          <img src={store.logo} className="w-full h-full object-cover" alt="Logo Preview" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase block">Cover Banner</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Cover Banner URL"
                          value={store.coverBanner || ""}
                          onChange={e => setStore({ ...store, coverBanner: e.target.value })}
                          className="flex-1 px-4 py-2 border rounded-xl text-xs bg-white"
                        />
                        <input
                          type="file"
                          className="hidden"
                          id="store-cover-uploader"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("image", file);
                            formData.append("folder", "storefront/covers");
                            try {
                              const res = await api.post("/vendor/uploads/image", formData, {
                                headers: { "Content-Type": "multipart/form-data" }
                              });
                              const uploaded = res?.data ?? res;
                              setStore({ ...store, coverBanner: uploaded.url });
                              toast.success("Cover banner uploaded successfully!");
                            } catch (err) {
                              toast.error("Failed to upload cover banner.");
                            }
                          }}
                        />
                        <label
                          htmlFor="store-cover-uploader"
                          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-purple-750 shrink-0 flex items-center justify-center transition-all"
                        >
                          Upload
                        </label>
                      </div>
                      {store.coverBanner && (
                        <div className="mt-1 w-24 h-10 rounded-lg overflow-hidden border">
                          <img src={store.coverBanner} className="w-full h-full object-cover" alt="Cover Preview" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Business Information */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border space-y-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">Business Information</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Store Tagline</label>
                      <input
                        type="text"
                        placeholder="e.g. Premium uniforms for every profession"
                        value={store.businessInfo?.tagline || ""}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, tagline: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Established Year</label>
                      <input
                        type="number"
                        placeholder="e.g. 2025"
                        value={store.businessInfo?.establishedYear || 2025}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, establishedYear: Number(e.target.value) } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Response Time</label>
                      <input
                        type="text"
                        placeholder="e.g. Within 2 hours"
                        value={store.businessInfo?.responseTime || ""}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, responseTime: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">GSTIN (Private)</label>
                      <input
                        type="text"
                        placeholder="GST Number"
                        value={store.businessInfo?.gst || ""}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, gst: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Store status</label>
                      <select
                        value={store.businessInfo?.status || "open"}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, status: e.target.value } })}
                        className="w-full px-4 py-2.5 border rounded-xl text-xs bg-white focus:outline-none"
                      >
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="vacation">Vacation Mode</option>
                      </select>
                    </div>
                  </div>

                  {store.businessInfo?.status === "vacation" && (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="text-xs font-bold text-slate-600 uppercase">Vacation Return Message</label>
                      <input
                        type="text"
                        placeholder="e.g. Orders will resume on August 15th"
                        value={store.businessInfo?.vacationResumeDate || ""}
                        onChange={e => setStore({ ...store, businessInfo: { ...store.businessInfo, vacationResumeDate: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Contact Information */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border space-y-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">Contact Information</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Support Email</label>
                      <input
                        type="email"
                        value={store.contact?.email || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, email: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Phone Number</label>
                      <input
                        type="text"
                        value={store.contact?.phone || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, phone: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">WhatsApp Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 9999999999"
                        value={store.contact?.whatsapp || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, whatsapp: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Store Address</label>
                      <textarea
                        value={store.contact?.address || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, address: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Business Hours</label>
                      <textarea
                        placeholder="e.g. Mon - Fri: 9:00 AM - 6:00 PM"
                        value={store.contact?.businessHours || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, businessHours: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Google Maps URL</label>
                      <textarea
                        placeholder="https://maps.google.com/..."
                        value={store.contact?.mapsUrl || ""}
                        onChange={e => setStore({ ...store, contact: { ...store.contact, mapsUrl: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Social Links */}
                <div className="bg-slate-50/50 p-6 rounded-2xl border space-y-4">
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">Social Media Links</span>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Website URL</label>
                      <input
                        type="text"
                        placeholder="https://yourstore.com"
                        value={store.socialLinks?.website || ""}
                        onChange={e => setStore({ ...store, socialLinks: { ...store.socialLinks, website: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Facebook</label>
                      <input
                        type="text"
                        placeholder="https://facebook.com/..."
                        value={store.socialLinks?.facebook || ""}
                        onChange={e => setStore({ ...store, socialLinks: { ...store.socialLinks, facebook: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Instagram</label>
                      <input
                        type="text"
                        placeholder="https://instagram.com/..."
                        value={store.socialLinks?.instagram || ""}
                        onChange={e => setStore({ ...store, socialLinks: { ...store.socialLinks, instagram: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">Twitter</label>
                      <input
                        type="text"
                        placeholder="https://twitter.com/..."
                        value={store.socialLinks?.twitter || ""}
                        onChange={e => setStore({ ...store, socialLinks: { ...store.socialLinks, twitter: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase">YouTube</label>
                      <input
                        type="text"
                        placeholder="https://youtube.com/..."
                        value={store.socialLinks?.youtube || ""}
                        onChange={e => setStore({ ...store, socialLinks: { ...store.socialLinks, youtube: e.target.value } })}
                        className="w-full px-4 py-2 border rounded-xl text-xs bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* D. STORE PAGES & VISUAL CANVAS BUILDER */}
            {activeTab === "pages" && (
              <div className="space-y-6">
                {!editingPageKey ? (
                  <>
                    <div className="flex justify-between items-center border-b pb-3">
                      <div>
                        <h3 className="text-lg font-black text-slate-800">Store Pages</h3>
                        <p className="text-xs text-slate-400 font-semibold">Create and manage your storefront visual page layouts.</p>
                      </div>
                      <button
                        onClick={() => setShowCreatePageModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-750 shadow transition-all hover:scale-105 active:scale-95"
                      >
                        <FiPlus /> Create Page
                      </button>
                    </div>

                    {/* Pinned Home Section */}
                    <div className="border border-purple-200 bg-purple-50/20 p-5 rounded-2xl space-y-3">
                      <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block">Pinned Homepage</span>
                      {(() => {
                        const homePage = pages.find(p => p.pageKey === "home" || p.pageType === "home");
                        return (
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                              <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">🏠 Home Page</span>
                              <p className="text-xs text-slate-450 font-semibold mt-1">
                                Status: <span className="capitalize text-slate-600 font-bold">{homePage?.status || "Published"}</span> &bull; Last published: version {homePage?.publishVersion || 1}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditPage("home")}
                                className="px-4 py-2 border border-purple-200 bg-white rounded-xl text-xs font-bold hover:bg-purple-50 text-purple-700 flex items-center gap-1.5"
                              >
                                <FiEdit /> Edit Homepage
                              </button>
                              <button
                                onClick={() => handlePublishPage("home")}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                              >
                                <FiCheckCircle /> Publish
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Custom Pages */}
                    <div className="space-y-4 pt-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Standard Pages</span>
                      <div className="divide-y border rounded-2xl bg-white p-4 shadow-sm">
                        {pages.filter(p => p.pageKey !== "home" && p.pageType !== "home" && p.pageKey !== "about" && p.pageKey !== "contact" && p.pageKey !== "offers").map(p => (
                          <div key={p.pageKey} className="flex items-center justify-between py-3.5">
                            <div>
                              <span className="text-sm font-bold text-slate-800 capitalize">{p.title || p.pageKey}</span>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Slug: /{p.slug || p.pageKey} &bull; Status: {p.status}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditPage(p.pageKey)}
                                className="px-3.5 py-1.5 border rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1.5 text-slate-700"
                              >
                                <FiEdit /> Edit Page
                              </button>
                              <button
                                onClick={() => handlePublishPage(p.pageKey)}
                                className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                              >
                                <FiCheckCircle /> Publish
                              </button>
                              {p.pageKey !== "about" ? (
                                <button
                                  onClick={async () => {
                                    if (!window.confirm("Are you sure you want to delete this custom page?")) return;
                                    try {
                                      await api.delete(`/vendor/store/pages/${p.pageKey}`);
                                      setPages(prev => prev.filter(pageItem => pageItem.pageKey !== p.pageKey));
                                      toast.success("Page deleted successfully.");
                                    } catch (err) {
                                      toast.error("Failed to delete page.");
                                    }
                                  }}
                                  className="px-3 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 w-[38px] h-[30px]"
                                >
                                  <FiTrash2 />
                                </button>
                              ) : (
                                <div className="w-[38px] h-[30px] shrink-0" />
                              )}
                            </div>
                          </div>
                        ))}
                        {pages.filter(p => p.pageKey !== "home" && p.pageType !== "home").length === 0 && (
                          <div className="py-6 text-center text-xs text-slate-400 italic">No custom pages created yet. Click "+ Create Page" to add one!</div>
                        )}
                      </div>
                    </div>

                    {/* Create Page Modal */}
                    {showCreatePageModal && (
                      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6">
                          <div>
                            <h3 className="text-lg font-black text-slate-800">Create New Page</h3>
                            <p className="text-xs text-slate-405 font-medium mt-0.5">Select a template to kickstart page design.</p>
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Page Title</label>
                              <input
                                type="text"
                                value={newPageTitle}
                                onChange={e => setNewPageTitle(e.target.value)}
                                placeholder="e.g. Careers, Contact Us"
                                className="w-full px-4 py-2 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block">Select Layout Template</label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: "blank", label: "Blank Page" },
                                  { id: "faq", label: "FAQ Page" },
                                  { id: "offers", label: "Offers Page" },
                                  { id: "careers", label: "Careers Page" },
                                  { id: "shipping", label: "Shipping Page" },
                                  { id: "privacy", label: "Privacy Page" },
                                  { id: "return", label: "Return Policy Page" },
                                  { id: "size_guide", label: "Size Guide" }
                                ].map(tpl => (
                                  <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => setNewPageTemplate(tpl.id)}
                                    className={`p-3 border rounded-2xl text-left text-xs font-bold transition-all ${newPageTemplate === tpl.id
                                        ? "border-purple-650 bg-purple-50/40 text-purple-700"
                                        : "bg-white hover:bg-slate-50"
                                      }`}
                                  >
                                    {tpl.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowCreatePageModal(false);
                                setNewPageTitle("");
                              }}
                              className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleCreateCustomPage}
                              disabled={saving}
                              className="px-5 py-2 bg-purple-650 text-white rounded-xl text-xs font-bold hover:bg-purple-750 shadow-md disabled:opacity-50"
                            >
                              {saving ? "Creating..." : "Create Page"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-4 min-h-[70vh] -mx-6 -my-6 bg-slate-50 p-6 overflow-hidden">

                    {/* Top Editor Control Bar */}
                    <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border">
                      <div>
                        <button
                          onClick={() => setEditingPageKey(null)}
                          className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 mb-1 transition-all"
                        >
                          ← Back to Pages
                        </button>
                        <h3 className="text-lg font-black text-slate-800">Design Your Store Page</h3>
                        <p className="text-[10px] text-slate-400 font-semibold">Drag, arrange, and customize sections to create your storefront.</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Editing Mode</span>
                          <span className="text-xs font-black text-slate-800 capitalize">🏠 {editingPageKey} page</span>
                        </div>

                        <div className="border-l pl-4 flex items-center gap-3">
                          {isUnsaved ? (
                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-black px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block"></span> Unsaved Changes
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-550 border font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                              Draft Saved
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-4 items-stretch flex-1 overflow-hidden">

                      {/* Left Column: Sidebar panel (Add or Edit Section) */}
                      <div className="w-80 border rounded-2xl bg-white p-4 space-y-4 overflow-y-auto shrink-0 shadow-sm flex flex-col">
                        {selectedSectionIdx !== null && canvasSections[selectedSectionIdx] ? (
                          // PROPERTIES PANEL (EDIT SECTION MODE)
                          <div className="space-y-4 flex-1 flex flex-col">
                            <button
                              onClick={() => setSelectedSectionIdx(null)}
                              className="text-[10px] font-black text-purple-600 hover:text-purple-800 flex items-center gap-1 border-b pb-2 transition-all uppercase tracking-wider"
                            >
                              ← Back to Section List
                            </button>

                            <div className="border-b pb-2">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Editing Section</span>
                              <span className="text-xs font-black text-slate-800 uppercase">{canvasSections[selectedSectionIdx].sectionType}</span>
                            </div>

                            <div className="flex gap-2 border-b pb-2">
                              {["content", "style", "visibility"].map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => setInspectorTab(tab)}
                                  className={`text-[10px] font-black uppercase pb-1 border-b-2 ${inspectorTab === tab ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400"
                                    }`}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>

                            {/* Context-aware settings forms */}
                            {inspectorTab === "content" && (
                              <div className="space-y-4 flex-1">

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-550 uppercase">Section Title</label>
                                  <input
                                    type="text"
                                    value={canvasSections[selectedSectionIdx].title || ""}
                                    onChange={e => {
                                      const next = [...canvasSections];
                                      next[selectedSectionIdx].title = e.target.value;
                                      setCanvasSections(next);
                                      setIsUnsaved(true);
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-550 uppercase">Sub Heading / Text</label>
                                  <textarea
                                    value={canvasSections[selectedSectionIdx].subtitle || ""}
                                    onChange={e => {
                                      const next = [...canvasSections];
                                      next[selectedSectionIdx].subtitle = e.target.value;
                                      setCanvasSections(next);
                                      setIsUnsaved(true);
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                    rows={2}
                                  />
                                </div>

                                {canvasSections[selectedSectionIdx].sectionType === "Banner" && (
                                  <div className="space-y-3 border-t pt-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-550 uppercase block">Banner Image</label>
                                      <div className="flex gap-2">
                                        <input
                                          type="file"
                                          className="hidden"
                                          id={`banner-file-${selectedSectionIdx}`}
                                          onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            const formData = new FormData();
                                            formData.append("image", file);
                                            formData.append("folder", "storefront/banners");
                                            try {
                                              const res = await api.post("/vendor/uploads/image", formData, {
                                                headers: { "Content-Type": "multipart/form-data" }
                                              });
                                              const uploaded = res?.data ?? res;
                                              const next = [...canvasSections];
                                              next[selectedSectionIdx].bannerUrl = uploaded.url;
                                              setCanvasSections(next);
                                              setIsUnsaved(true);
                                              toast.success("Banner image uploaded successfully!");
                                            } catch (err) {
                                              toast.error("Failed to upload banner image.");
                                            }
                                          }}
                                        />
                                        <label
                                          htmlFor={`banner-file-${selectedSectionIdx}`}
                                          className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-purple-750 transition-all text-center"
                                        >
                                          {canvasSections[selectedSectionIdx].bannerUrl ? "Replace Image" : "Upload Banner"}
                                        </label>
                                        {canvasSections[selectedSectionIdx].bannerUrl && (
                                          <button
                                            onClick={() => {
                                              const next = [...canvasSections];
                                              next[selectedSectionIdx].bannerUrl = "";
                                              setCanvasSections(next);
                                              setIsUnsaved(true);
                                            }}
                                            className="px-3 py-1.5 border rounded-lg text-xs font-bold text-red-500 hover:bg-red-50"
                                          >
                                            Remove
                                          </button>
                                        )}
                                      </div>
                                      {canvasSections[selectedSectionIdx].bannerUrl && (
                                        <div className="mt-2 w-full aspect-[21/9] rounded-lg overflow-hidden border">
                                          <img src={canvasSections[selectedSectionIdx].bannerUrl} className="w-full h-full object-cover" alt="Preview" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-550 uppercase">Button Text</label>
                                      <input
                                        type="text"
                                        value={canvasSections[selectedSectionIdx].ctaText || ""}
                                        onChange={e => {
                                          const next = [...canvasSections];
                                          next[selectedSectionIdx].ctaText = e.target.value;
                                          setCanvasSections(next);
                                          setIsUnsaved(true);
                                        }}
                                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-555 uppercase">Button Link</label>
                                      <input
                                        type="text"
                                        value={canvasSections[selectedSectionIdx].ctaLink || ""}
                                        onChange={e => {
                                          const next = [...canvasSections];
                                          next[selectedSectionIdx].ctaLink = e.target.value;
                                          setCanvasSections(next);
                                          setIsUnsaved(true);
                                        }}
                                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                      />
                                    </div>
                                  </div>
                                )}

                                {(canvasSections[selectedSectionIdx].sectionType === "Product Grid" || canvasSections[selectedSectionIdx].sectionType === "Product Carousel") && (
                                  <div className="space-y-3 border-t pt-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-550 uppercase">Display Count Limit</label>
                                      <input
                                        type="number"
                                        value={canvasSections[selectedSectionIdx].displayLimit || 8}
                                        onChange={e => {
                                          const next = [...canvasSections];
                                          next[selectedSectionIdx].displayLimit = Number(e.target.value);
                                          setCanvasSections(next);
                                          setIsUnsaved(true);
                                        }}
                                        className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                        min={1}
                                        max={24}
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-550 uppercase block">Choose Products Mode</label>
                                      <select
                                        value={canvasSections[selectedSectionIdx].criteria === "manual" ? "manual" : "automatic"}
                                        onChange={e => {
                                          const next = [...canvasSections];
                                          next[selectedSectionIdx].criteria = e.target.value === "manual" ? "manual" : "latest";
                                          setCanvasSections(next);
                                          setIsUnsaved(true);
                                        }}
                                        className="w-full px-3 py-1.5 border rounded-lg bg-white text-xs"
                                      >
                                        <option value="automatic">Automatic Curation</option>
                                        <option value="manual">Manual Selection</option>
                                      </select>

                                      {canvasSections[selectedSectionIdx].criteria !== "manual" && (
                                        <div className="space-y-2 bg-slate-50 p-2 rounded-xl border">
                                          <label className="text-[9px] font-black text-slate-450 uppercase block">Curation Target Criteria</label>
                                          <div className="space-y-1.5">
                                            {[
                                              { label: "Latest Products", value: "latest" },
                                              { label: "Best Selling items", value: "best_selling" }
                                            ].map(opt => (
                                              <label key={opt.value} className="flex items-center gap-1.5 text-xs font-semibold">
                                                <input
                                                  type="radio"
                                                  name={`product-criteria-radio-${selectedSectionIdx}`}
                                                  value={opt.value}
                                                  checked={(canvasSections[selectedSectionIdx].criteria || "latest") === opt.value}
                                                  onChange={() => {
                                                    const next = [...canvasSections];
                                                    next[selectedSectionIdx].criteria = opt.value;
                                                    setCanvasSections(next);
                                                    setIsUnsaved(true);
                                                  }}
                                                />
                                                <span>{opt.label}</span>
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {canvasSections[selectedSectionIdx].criteria === "manual" && (
                                        <div className="space-y-3 bg-slate-50 p-3 rounded-xl border">
                                          <label className="text-[10px] font-bold text-slate-550 uppercase block">Choose Products Manually</label>
                                          <div className="bg-white border rounded-xl max-h-56 overflow-y-auto p-2 space-y-2">
                                            {vendorProducts.map(prod => {
                                              const selectedList = canvasSections[selectedSectionIdx].products || [];
                                              const prodId = prod._id || prod.id;
                                              const isChecked = selectedList.includes(prodId);
                                              return (
                                                <label key={prodId} className="flex items-center gap-3 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                                  <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                      const next = [...canvasSections];
                                                      let newList = [...selectedList];
                                                      if (e.target.checked) {
                                                        newList.push(prodId);
                                                      } else {
                                                        newList = newList.filter(id => id !== prodId);
                                                      }
                                                      next[selectedSectionIdx].products = newList;
                                                      setCanvasSections(next);
                                                      setIsUnsaved(true);
                                                    }}
                                                    className="rounded border-slate-300 text-purple-650 focus:ring-purple-500"
                                                  />
                                                  {prod.thumbnail || prod.images?.[0] ? (
                                                    <img
                                                      src={prod.thumbnail || prod.images[0]}
                                                      alt={prod.name}
                                                      className="w-8 h-8 rounded object-cover border"
                                                    />
                                                  ) : (
                                                    <div className="w-8 h-8 bg-slate-150 rounded flex items-center justify-center text-[10px] border">📦</div>
                                                  )}
                                                  <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-slate-700 truncate">{prod.name}</div>
                                                    <div className="text-[10px] font-black text-purple-650">${prod.price}</div>
                                                  </div>
                                                </label>
                                              );
                                            })}
                                            {vendorProducts.length === 0 && (
                                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block text-center py-6">
                                                No products found. Please add products to your catalog first.
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {canvasSections[selectedSectionIdx].sectionType === "Category Grid" && (() => {
                                  const activeCats = globalCategories.filter(cat =>
                                    (store.activeCategoryIds || []).includes(String(cat._id || cat.id))
                                  );
                                  return (
                                    <div className="space-y-3 border-t pt-3">
                                      <label className="text-[10px] font-bold text-slate-550 uppercase block">Choose Display Categories</label>
                                      <div className="bg-slate-50 border p-3 rounded-xl max-h-40 overflow-y-auto space-y-1.5">
                                        {activeCats.map(cat => {
                                          const selectedList = canvasSections[selectedSectionIdx].categories || [];
                                          const catId = cat._id || cat.id;
                                          const isChecked = selectedList.includes(catId);
                                          return (
                                            <label key={catId} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={e => {
                                                  const next = [...canvasSections];
                                                  let newList = [...selectedList];
                                                  if (e.target.checked) {
                                                    newList.push(catId);
                                                  } else {
                                                    newList = newList.filter(id => id !== catId);
                                                  }
                                                  next[selectedSectionIdx].categories = newList;

                                                  // Also maintain selectedCategories with names for backward compatibility
                                                  const nameList = globalCategories
                                                    .filter(c => newList.includes(c._id || c.id))
                                                    .map(c => c.name);
                                                  next[selectedSectionIdx].selectedCategories = nameList;

                                                  setCanvasSections(next);
                                                  setIsUnsaved(true);
                                                }}
                                              />
                                              <span>{cat.name}</span>
                                            </label>
                                          );
                                        })}
                                        {activeCats.length === 0 && (
                                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block text-center py-4">
                                            No categories with products found. Please add products to categories first.
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {inspectorTab === "style" && (
                              <div className="space-y-3 flex-1">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-550 uppercase">Display Mode</label>
                                  <select
                                    value={canvasSections[selectedSectionIdx].layout || "grid"}
                                    onChange={e => {
                                      const next = [...canvasSections];
                                      next[selectedSectionIdx].layout = e.target.value;
                                      setCanvasSections(next);
                                      setIsUnsaved(true);
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white"
                                  >
                                    <option value="grid">Grid Layout</option>
                                    <option value="carousel">Horizontal Slider Carousel</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-550 uppercase">Background Theme</label>
                                  <select
                                    value={canvasSections[selectedSectionIdx].themeMode || "light"}
                                    onChange={e => {
                                      const next = [...canvasSections];
                                      next[selectedSectionIdx].themeMode = e.target.value;
                                      setCanvasSections(next);
                                      setIsUnsaved(true);
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white"
                                  >
                                    <option value="light">Vanilla Light Mode</option>
                                    <option value="dark">Sleek Obsidian Dark</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-550 uppercase">Section Height Offset</label>
                                  <select
                                    value={canvasSections[selectedSectionIdx].heightSize || "medium"}
                                    onChange={e => {
                                      const next = [...canvasSections];
                                      next[selectedSectionIdx].heightSize = e.target.value;
                                      setCanvasSections(next);
                                      setIsUnsaved(true);
                                    }}
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white"
                                  >
                                    <option value="small">Small Padding</option>
                                    <option value="medium">Standard Medium Padding</option>
                                    <option value="large">Deep Widescreen Spacing</option>
                                  </select>
                                </div>
                              </div>
                            )}

                            {inspectorTab === "visibility" && (
                              <div className="space-y-3 flex-1">
                                <span className="text-[10px] font-bold text-slate-550 uppercase block border-b pb-1.5">Device Visibility</span>
                                <div className="space-y-2">
                                  {["desktop", "tablet", "mobile"].map(device => (
                                    <label key={device} className="flex items-center gap-2.5 text-xs font-bold text-slate-700 capitalize cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg border">
                                      <input
                                        type="checkbox"
                                        checked={canvasSections[selectedSectionIdx].visibility?.[device] !== false}
                                        onChange={e => {
                                          const next = [...canvasSections];
                                          if (!next[selectedSectionIdx].visibility) next[selectedSectionIdx].visibility = {};
                                          next[selectedSectionIdx].visibility[device] = e.target.checked;
                                          setCanvasSections(next);
                                          setIsUnsaved(true);
                                        }}
                                      />
                                      <span>Display layout on {device} monitors</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          // SECTIONS PRESENTS LIBRARY LIST
                          <div className="space-y-6 flex-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block border-b pb-2">Add Store Section</span>

                            {[
                              {
                                group: "Hero & Promotions",
                                items: ["Hero Banner", "Offer Banner", "Image Banner"]
                              },
                              {
                                group: "Products",
                                items: ["Featured Products", "New Arrivals", "Best Sellers", "Product Collection"]
                              },
                              {
                                group: "Categories",
                                items: ["Shop by Category", "Featured Categories"]
                              },
                              {
                                group: "Content",
                                items: ["Text Section", "FAQ", "Contact Info"]
                              },
                              {
                                group: "Layout",
                                items: ["Spacer", "Divider"]
                              }
                            ].map(grp => (
                              <div key={grp.group} className="space-y-1.5">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{grp.group}</span>
                                <div className="grid grid-cols-1 gap-1">
                                  {grp.items.map(item => (
                                    <button
                                      key={item}
                                      onClick={() => handleAddSectionToCanvas(item)}
                                      className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-purple-50 border hover:border-purple-300 rounded-xl text-left text-[11px] font-bold text-slate-700 transition-all shadow-sm hover:scale-[1.02]"
                                    >
                                      <span className="text-purple-650 font-black">+</span> {item}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Center Column: Visual Canvas Preview with viewport simulator */}
                      <div className="flex-1 border rounded-2xl bg-white p-6 overflow-y-auto flex flex-col justify-between shadow-sm relative">

                        {/* Viewport & Info Header */}
                        <div className="flex justify-between items-center border-b pb-3 mb-4">
                          <div>
                            <span className="text-xs font-black text-slate-800 capitalize">{editingPageKey} Page Layout</span>
                            <div className="flex gap-2 text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                              <span>Sections: {canvasSections.length}</span>
                              <span>•</span>
                              <span>Status: {pages.find(p => p.pageKey === editingPageKey)?.status || "Draft"}</span>
                            </div>
                          </div>

                          <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                              onClick={() => setPreviewMode("desktop")}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${previewMode === "desktop" ? "bg-white text-slate-800 shadow" : "text-slate-500"
                                }`}
                            >
                              🖥 Desktop
                            </button>
                            <button
                              onClick={() => setPreviewMode("mobile")}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${previewMode === "mobile" ? "bg-white text-slate-800 shadow" : "text-slate-550"
                                }`}
                            >
                              📱 Mobile
                            </button>
                          </div>
                        </div>

                        {/* Viewport Frame */}
                        <div className="flex-1 py-4">
                          <div className={
                            previewMode === "mobile"
                              ? "w-full max-w-[360px] mx-auto border-[10px] border-slate-900 rounded-[40px] overflow-y-auto bg-slate-50 h-[560px] p-3 shadow-2xl space-y-4"
                              : "space-y-4 w-full bg-slate-50 border rounded-2xl p-6 min-h-[400px]"
                          }>

                            {/* Bezel details for mobile mode */}
                            {previewMode === "mobile" && (
                              <div className="flex justify-between items-center px-4 text-[10px] text-slate-400 font-bold border-b pb-1 mb-2">
                                <span>9:41</span>
                                <div className="flex gap-1">⚡🔋📶</div>
                              </div>
                            )}

                            {canvasSections.map((sec, idx) => (
                              <div
                                key={sec._id}
                                onClick={() => setSelectedSectionIdx(idx)}
                                className={`group border-2 bg-white rounded-2xl overflow-hidden shadow-sm transition-all cursor-pointer relative ${selectedSectionIdx === idx ? "border-purple-600 ring-4 ring-purple-50" : "border-gray-200"
                                  }`}
                              >

                                {/* Visual Section Controls Header */}
                                <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between text-xs">
                                  <span className="font-black text-purple-750 uppercase text-[9px] tracking-wider">{sec.sectionType}</span>
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={(e) => { e.stopPropagation(); handleMoveSection(idx, -1); }} className="p-1 hover:bg-gray-250 rounded text-slate-550 flex items-center gap-0.5 font-bold text-[9px]"><FiChevronUp /> Up</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleMoveSection(idx, 1); }} className="p-1 hover:bg-gray-250 rounded text-slate-550 flex items-center gap-0.5 font-bold text-[9px]"><FiChevronDown /> Down</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDuplicateSection(idx); }} className="p-1 hover:bg-gray-250 rounded text-slate-550 flex items-center gap-0.5 font-bold text-[9px]"><FiCopy /> Copy</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(idx); }} className="p-1 text-red-500 hover:bg-red-55 rounded flex items-center gap-0.5 font-bold text-[9px]"><FiTrash2 /> Delete</button>
                                  </div>
                                </div>

                                {/* Graphical Simulation Card Previews */}
                                <div className="p-4 space-y-3">
                                  {sec.sectionType === "Banner" && (
                                    <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden border bg-purple-900 text-white flex flex-col justify-center p-6 text-left shadow-inner">
                                      {sec.bannerUrl ? (
                                        <img src={sec.bannerUrl} className="absolute inset-0 w-full h-full object-cover opacity-45" alt="Banner background preview" />
                                      ) : (
                                        <div className="absolute inset-0 bg-gradient-to-r from-purple-800 to-indigo-800 opacity-60" />
                                      )}
                                      <div className="relative z-10 space-y-1">
                                        <span className="text-[8px] font-black tracking-wider uppercase bg-white/20 px-2 py-0.5 rounded-full w-max block">Hero block</span>
                                        <h4 className="text-xs font-black truncate">{sec.title || "Welcome to Our Store"}</h4>
                                        <p className="text-[9px] text-slate-200 line-clamp-1">{sec.subtitle || "Browse our beautiful store catalog drops."}</p>
                                        {sec.ctaText && (
                                          <span className="mt-1.5 inline-block px-3 py-1 bg-white text-slate-900 rounded-lg text-[8px] font-bold shadow hover:bg-slate-100 transition-all w-max">{sec.ctaText}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {sec.sectionType === "Product Grid" && (
                                    <div className="p-3 rounded-xl border bg-slate-50 space-y-2 text-left">
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <h4 className="text-[10px] font-black text-slate-800">{sec.title || "Featured Products"}</h4>
                                          <span className="text-[8px] text-slate-400 font-semibold">{sec.subtitle || "Curated list of store catalog items"}</span>
                                        </div>
                                        <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border font-bold">Grid catalog</span>
                                      </div>
                                      <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                          { name: "Running Shoes", emoji: "👟", price: "$120" },
                                          { name: "Casual Shirt", emoji: "👕", price: "$45" },
                                          { name: "Leather Wallet", emoji: "👜", price: "$75" },
                                          { name: "Smart Watch", emoji: "⌚", price: "$299" }
                                        ].slice(0, sec.displayLimit || 4).map((p, pIdx) => (
                                          <div key={pIdx} className="bg-white border rounded-lg p-1.5 text-center space-y-1">
                                            <div className="w-full aspect-square rounded bg-slate-50 border flex items-center justify-center text-md shadow-inner">
                                              {p.emoji}
                                            </div>
                                            <span className="text-[8px] font-bold text-slate-750 truncate block">{p.name}</span>
                                            <span className="text-[8px] font-black text-purple-650 block">{p.price}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {sec.sectionType === "Product Carousel" && (
                                    <div className="p-3 rounded-xl border bg-slate-50 space-y-2 text-left">
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <h4 className="text-[10px] font-black text-slate-800">{sec.title || "Featured Products"}</h4>
                                          <span className="text-[8px] text-slate-400 font-semibold">{sec.subtitle || "Curated list of store catalog items"}</span>
                                        </div>
                                        <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border font-bold">Slider row</span>
                                      </div>
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {[
                                          { name: "Running Shoes", emoji: "👟", price: "$120" },
                                          { name: "Casual Shirt", emoji: "👕", price: "$45" },
                                          { name: "Leather Wallet", emoji: "👜", price: "$75" },
                                          { name: "Smart Watch", emoji: "⌚", price: "$299" }
                                        ].map((p, pIdx) => (
                                          <div key={pIdx} className="bg-white border rounded-lg p-1.5 text-center space-y-1 min-w-[65px] flex-1">
                                            <div className="w-7 h-7 mx-auto rounded bg-slate-50 border flex items-center justify-center text-xs shadow-inner">
                                              {p.emoji}
                                            </div>
                                            <span className="text-[7px] font-bold text-slate-750 truncate block">{p.name}</span>
                                            <span className="text-[7px] font-black text-purple-650 block">{p.price}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {sec.sectionType === "Category Grid" && (
                                    <div className="p-3 rounded-xl border bg-slate-50 space-y-2 text-left">
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <h4 className="text-[10px] font-black text-slate-800">{sec.title || "Shop by Category"}</h4>
                                          <span className="text-[8px] text-slate-400 font-semibold">{sec.subtitle || "Browse departments"}</span>
                                        </div>
                                        <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border font-bold">Circles</span>
                                      </div>
                                      <div className="flex gap-3 justify-center">
                                        {[
                                          { name: "Clothing", emoji: "👕" },
                                          { name: "Shoes", emoji: "👟" },
                                          { name: "Bags", emoji: "👜" },
                                          { name: "Watches", emoji: "⌚" }
                                        ].map((c, cIdx) => (
                                          <div key={cIdx} className="text-center space-y-1">
                                            <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-xs shadow-sm">
                                              {c.emoji}
                                            </div>
                                            <span className="text-[7px] font-bold text-slate-655 block">{c.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {sec.sectionType === "Text Block" && (
                                    <div className="p-3 rounded-xl border bg-slate-50 text-left space-y-1">
                                      <div className="flex justify-between items-center border-b pb-1">
                                        <h4 className="text-[10px] font-black text-slate-800">{sec.title || "Text Section"}</h4>
                                        <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-white text-slate-500 border font-bold">Text</span>
                                      </div>
                                      <p className="text-[9px] text-slate-500 font-semibold leading-relaxed line-clamp-2">{sec.subtitle || "Describe your brand promise, catalog story or support policies."}</p>
                                    </div>
                                  )}

                                  {sec.sectionType === "Spacer" && (
                                    <div className="py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-350 text-[8px] font-black uppercase text-center tracking-widest bg-slate-50">
                                      Space Spacer Offset ({sec.title || "16px"})
                                    </div>
                                  )}

                                  {sec.sectionType === "Divider" && (
                                    <div className="py-1 flex items-center justify-center">
                                      <div className="w-full border-t border-slate-300" />
                                    </div>
                                  )}
                                </div>

                              </div>
                            ))}

                            {canvasSections.length === 0 && (
                              <div className="border-2 border-dashed rounded-3xl p-8 text-center bg-slate-50">
                                <span className="text-3xl block mb-2">🎨</span>
                                <h4 className="text-xs font-black text-slate-700">Let's build your {editingPageKey.toUpperCase()} Page</h4>
                                <p className="text-[10px] text-slate-450 font-semibold mt-1 mb-4">Select one of these starting section templates:</p>
                                <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                                  {[
                                    { name: "Hero Banner", type: "Hero Banner", icon: "🖼" },
                                    { name: "Featured Products", type: "Featured Products", icon: "🛍" },
                                    { name: "Shop by Category", type: "Shop by Category", icon: "📂" },
                                    { name: "Offer Banner", type: "Offer Banner", icon: "🔥" }
                                  ].map(preset => (
                                    <button
                                      key={preset.name}
                                      onClick={() => handleAddSectionToCanvas(preset.type)}
                                      className="p-2 border bg-white rounded-xl text-left text-[10px] font-bold text-slate-700 hover:bg-purple-50 hover:border-purple-300 transition-all flex items-center gap-1.5 shadow-sm"
                                    >
                                      <span>{preset.icon}</span>
                                      <span>{preset.name}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {previewMode === "mobile" && (
                              <div className="w-16 h-1 bg-slate-300 rounded-full mx-auto mt-4" />
                            )}
                          </div>
                        </div>

                        {/* Add Section trigger */}
                        {canvasSections.length > 0 && (
                          <div className="mt-4 border-t pt-4 text-center">
                            <button
                              onClick={() => setShowSectionPickerModal(true)}
                              className="px-4 py-2 border-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-50 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 hover:scale-105 active:scale-95 shadow-sm"
                            >
                              <FiPlus /> Add Section Layout
                            </button>
                          </div>
                        )}

                        {/* Bottom Layout Control Save bar */}
                        <div className="mt-6 border-t pt-4 flex justify-between items-center gap-3">
                          <button
                            onClick={() => {
                              const existing = pages.find(p => p.pageKey === editingPageKey);
                              setCanvasSections(existing?.sections || []);
                              setCanvasLayout(existing?.layout || { type: "fullWidth", maxWidth: "1440px" });
                              setSelectedSectionIdx(null);
                              setIsUnsaved(false);
                              toast.info("Changes discarded.");
                            }}
                            className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all shadow-sm"
                          >
                            Discard
                          </button>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSavePageDraft(false)}
                              className="px-4 py-2 border border-purple-200 text-purple-700 bg-purple-50 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all shadow-sm"
                            >
                              Save Draft
                            </button>
                            <button
                              onClick={() => {
                                handleSavePageDraft(false);
                                window.open(`/store/${store.slug}?preview=true`, "_blank");
                              }}
                              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                            >
                              Preview
                            </button>
                            <button
                              onClick={async () => {
                                await handleSavePageDraft(false);
                                await handlePublishPage(editingPageKey);
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                            >
                              Publish Live Page
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>


                    {/* Grouped template Popover Modal Picker */}
                    {showSectionPickerModal && (
                      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-150 transform transition-all animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex justify-between items-center border-b pb-3">
                            <div>
                              <h4 className="font-black text-sm text-slate-800">Add a Section block</h4>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Choose layout elements to add to canvas</p>
                            </div>
                            <button
                              onClick={() => setShowSectionPickerModal(false)}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
                            {[
                              { name: "Hero Banner", type: "Hero Banner", desc: "Premium splash photo and CTA layout", icon: "🖼" },
                              { name: "Offer Banner", type: "Offer Banner", desc: "Show active campaigns & vouchers", icon: "🔥" },
                              { name: "Featured Products", type: "Featured Products", desc: "Show best or latest products grid", icon: "🛍" },
                              { name: "New Arrivals", type: "New Arrivals", desc: "Show slider of latest items", icon: "🆕" },
                              { name: "Best Sellers", type: "Best Sellers", desc: "Highlight most popular products", icon: "⭐" },
                              { name: "Shop by Category", type: "Shop by Category", desc: "Grid circles for category circles", icon: "📂" },
                              { name: "Text Section", type: "Text Section", desc: "General information content layout", icon: "📝" },
                              { name: "FAQ accordion", type: "FAQ", desc: "Accordion panel for standard guidelines", icon: "❓" }
                            ].map(item => (
                              <button
                                key={item.name}
                                onClick={() => {
                                  handleAddSectionToCanvas(item.type);
                                  setShowSectionPickerModal(false);
                                }}
                                className="p-3 border rounded-2xl text-left bg-slate-50/50 hover:bg-purple-50 hover:border-purple-300 transition-all flex items-start gap-2.5 shadow-sm hover:scale-[1.02]"
                              >
                                <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                                <div>
                                  <span className="text-xs font-bold text-slate-800 block">{item.name}</span>
                                  <span className="text-[9px] text-slate-400 font-semibold block leading-tight mt-0.5">{item.desc}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* E. DYNAMIC COLLECTIONS */}
            {activeTab === "collections" && !editingPageKey && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="text-lg font-black text-slate-800">Collections Manager</h3>
                  <button
                    onClick={handleCreateCollection}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
                  >
                    <FiPlus /> Create Collection
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">

                  {/* Collections lists */}
                  <div className="w-full lg:w-80 border rounded-2xl p-4 divide-y space-y-2 bg-slate-50/50">
                    {collections.map((col, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setActiveCollectionId(col._id || col.id);
                          fetchMatchingCollectionProducts(idx);
                        }}
                        className={`p-3 rounded-xl cursor-pointer flex justify-between items-center transition-all ${activeCollectionIdx === idx ? "bg-purple-100 text-purple-700 font-bold" : "hover:bg-white"
                          }`}
                      >
                        <span className="text-xs">{col.name}</span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white text-slate-450 border border-gray-150">{col.curationMode}</span>
                      </div>
                    ))}
                  </div>

                  {/* Rules Details editor + Real-time matching previewer */}
                  {activeCollectionIdx !== null && collections[activeCollectionIdx] && (
                    <div className="flex-1 border rounded-2xl p-6 bg-white space-y-6">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="font-bold text-sm text-slate-800">Edit Collection Rules: {collections[activeCollectionIdx].name}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleSaveActiveCollection}
                            disabled={saving}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-750 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all"
                          >
                            <FiSave /> Save Collection
                          </button>
                          <button
                            onClick={handleDeleteActiveCollection}
                            className="text-red-500 text-xs font-bold flex items-center gap-1 hover:underline"
                          >
                            <FiTrash2 /> Remove
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-455 uppercase">Name</label>
                          <input
                            type="text"
                            value={collections[activeCollectionIdx].name}
                            onChange={e => {
                              const next = [...collections];
                              next[activeCollectionIdx].name = e.target.value;
                              setCollections(next);
                            }}
                            className="w-full px-3 py-2 border rounded-xl text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-455 uppercase">Mode</label>
                          <select
                            value={collections[activeCollectionIdx].curationMode}
                            onChange={e => {
                              const next = [...collections];
                              next[activeCollectionIdx].curationMode = e.target.value;
                              setCollections(next);
                            }}
                            className="w-full px-3 py-2 border rounded-xl bg-white text-sm"
                          >
                            <option value="manual">Manual Select</option>
                            <option value="automatic">Automatic (Rules)</option>
                          </select>
                        </div>
                      </div>

                      {/* Collection Image Banner Uploader */}
                      <div className="space-y-2 border-t pt-4">
                        <label className="text-[10px] font-bold text-slate-455 uppercase block">Collection Banner Image</label>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            className="hidden"
                            id={`collection-image-uploader-${activeCollectionIdx}`}
                            onChange={async (e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              const formData = new FormData();
                              formData.append("image", file);
                              formData.append("folder", "storefront/collections");
                              try {
                                const res = await api.post("/vendor/uploads/image", formData, {
                                  headers: { "Content-Type": "multipart/form-data" }
                                });
                                const uploaded = res?.data ?? res;
                                const next = [...collections];
                                next[activeCollectionIdx].image = uploaded.url;
                                setCollections(next);
                                toast.success("Collection banner image uploaded successfully!");
                              } catch (err) {
                                toast.error("Failed to upload collection banner.");
                              }
                            }}
                          />
                          <label
                            htmlFor={`collection-image-uploader-${activeCollectionIdx}`}
                            className="flex-1 px-3 py-1.5 bg-purple-650 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-purple-700 transition-all text-center"
                          >
                            {collections[activeCollectionIdx].image ? "Replace Image" : "Upload Image"}
                          </label>
                          {collections[activeCollectionIdx].image && (
                            <button
                              onClick={() => {
                                const next = [...collections];
                                next[activeCollectionIdx].image = "";
                                setCollections(next);
                              }}
                              className="px-3 py-1.5 border rounded-lg text-xs font-bold text-red-500 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {collections[activeCollectionIdx].image && (
                          <div className="mt-2 w-full aspect-[21/9] max-w-sm rounded-xl overflow-hidden border">
                            <img src={collections[activeCollectionIdx].image} className="w-full h-full object-cover" alt="Collection Banner Preview" />
                          </div>
                        )}
                      </div>

                      {collections[activeCollectionIdx].curationMode === "automatic" && (
                        <div className="space-y-4 border-t pt-4">
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Rule criteria engine</h4>

                          {(collections[activeCollectionIdx].ruleGroups || []).map((group, groupIdx) => (
                            <div key={groupIdx} className="border p-4 rounded-2xl bg-gray-50 space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">Condition match:</span>
                                <select
                                  value={group.match}
                                  onChange={e => {
                                    const nextGroups = [...collections[activeCollectionIdx].ruleGroups];
                                    nextGroups[groupIdx].match = e.target.value;
                                    handleUpdateCollectionRules(activeCollectionIdx, nextGroups);
                                  }}
                                  className="px-2 py-1 border rounded-lg text-xs bg-white focus:outline-none"
                                >
                                  <option value="all">All Conditions</option>
                                  <option value="any">Any Condition</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                {(group.conditions || []).map((cond, condIdx) => (
                                  <div key={condIdx} className="grid grid-cols-3 gap-2 items-center">
                                    <select
                                      value={cond.field}
                                      onChange={e => {
                                        const nextGroups = [...collections[activeCollectionIdx].ruleGroups];
                                        nextGroups[groupIdx].conditions[condIdx].field = e.target.value;
                                        handleUpdateCollectionRules(activeCollectionIdx, nextGroups);
                                      }}
                                      className="px-2 py-1.5 border rounded-lg text-xs bg-white"
                                    >
                                      <option value="price">Price</option>
                                      <option value="discount">Discount</option>
                                      <option value="rating">Rating</option>
                                      <option value="category">Category</option>
                                    </select>
                                    <select
                                      value={cond.operator}
                                      onChange={e => {
                                        const nextGroups = [...collections[activeCollectionIdx].ruleGroups];
                                        nextGroups[groupIdx].conditions[condIdx].operator = e.target.value;
                                        handleUpdateCollectionRules(activeCollectionIdx, nextGroups);
                                      }}
                                      className="px-2 py-1.5 border rounded-lg text-xs bg-white"
                                    >
                                      <option value="greater_than">Greater than</option>
                                      <option value="less_than">Less than</option>
                                      <option value="equals">Equal to</option>
                                    </select>
                                    <input
                                      type="text"
                                      value={cond.value}
                                      onChange={e => {
                                        const nextGroups = [...collections[activeCollectionIdx].ruleGroups];
                                        nextGroups[groupIdx].conditions[condIdx].value = e.target.value;
                                        handleUpdateCollectionRules(activeCollectionIdx, nextGroups);
                                      }}
                                      className="px-2 py-1.5 border rounded-lg text-xs focus:outline-none"
                                    />
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextGroups = [...collections[activeCollectionIdx].ruleGroups];
                                    nextGroups[groupIdx].conditions.push({ field: "price", operator: "greater_than", value: "100" });
                                    handleUpdateCollectionRules(activeCollectionIdx, nextGroups);
                                  }}
                                  className="text-[10px] text-purple-650 font-bold hover:underline"
                                >
                                  + Add Condition parameter
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Real-time matching previewer catalog view */}
                          <div className="border-t pt-4 space-y-3">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">Live Product Matches ({matchedProducts.length})</span>
                            <p className="text-[9px] text-amber-600 font-medium italic mt-0 mb-3">Note: This is a temporary client-side preview matched against locally loaded products. Full catalog matches apply once published.</p>
                            {loadingPreview ? (
                              <div className="text-center py-6 text-xs text-slate-400">Loading Preview...</div>
                            ) : (
                              <div className="grid grid-cols-4 gap-2">
                                {matchedProducts.slice(0, 8).map(p => (
                                  <div key={p.id} className="border p-2 rounded-xl text-center space-y-1">
                                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-50 border">
                                      <img src={p.image} className="w-full h-full object-cover" alt="preview" />
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-700 truncate block">{p.name}</span>
                                  </div>
                                ))}
                                {matchedProducts.length === 0 && (
                                  <div className="col-span-full py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                                    No items match the active rules criteria.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* F. NAVIGATION MENU */}
            {activeTab === "navigation" && !editingPageKey && store && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Navigation Menu</h3>
                    <p className="text-xs text-slate-400 font-semibold">Organize storefront navigation link items.</p>
                  </div>
                </div>

                {["header"].map(menuType => {
                  const activeMenu = storeMenus.find(m => m.menuType === menuType) || { menuType, items: [] };
                  return (
                    <div key={menuType} className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="text-sm font-black text-slate-800 capitalize">{menuType} Menu</span>
                        <button
                          onClick={() => {
                            const nextMenus = [...storeMenus];
                            let idx = nextMenus.findIndex(m => m.menuType === menuType);
                            const newItem = {
                              label: "New Link",
                              iconName: menuType === "header" ? "🏠" : "🔒",
                              destination: { type: "page", path: "home" }
                            };
                            if (idx !== -1) {
                              nextMenus[idx].items.push(newItem);
                            } else {
                              nextMenus.push({ storeId: store.id, menuType, items: [newItem] });
                            }
                            setStoreMenus(nextMenus);
                            setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          + Add MenuItem
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(activeMenu.items || []).map((nav, idx) => (
                          <div key={idx} className="border p-4 rounded-2xl bg-slate-50/50 flex flex-col md:flex-row gap-3 items-stretch justify-between shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1 items-end">
                              <div>
                                <label className="text-[9px] font-black text-slate-400 block uppercase">Menu Name</label>
                                <input
                                  type="text"
                                  value={nav.label}
                                  onChange={e => {
                                    const nextMenus = [...storeMenus];
                                    let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                    nextMenus[menuIdx].items[idx].label = e.target.value;
                                    setStoreMenus(nextMenus);
                                    setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                  }}
                                  className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-black text-slate-400 block uppercase">Open</label>
                                <select
                                  value={nav.destination?.type || "page"}
                                  onChange={e => {
                                    const nextMenus = [...storeMenus];
                                    let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                    const destType = e.target.value;
                                    let defaultPath = "";
                                    let defaultLabel = nav.label || "New Link";
                                    if (destType === "page") {
                                      defaultPath = "home";
                                      defaultLabel = "Home";
                                    } else if (destType === "category") {
                                      defaultPath = globalCategories[0]?.name || "";
                                      defaultLabel = globalCategories[0]?.name || "Category Link";
                                    } else if (destType === "collection") {
                                      defaultPath = collections[0]?.slug || "";
                                      defaultLabel = collections[0]?.name || "Collection Link";
                                    } else if (destType === "custom") {
                                      defaultPath = "/";
                                      defaultLabel = "External Link";
                                    }

                                    nextMenus[menuIdx].items[idx].label = defaultLabel;
                                    nextMenus[menuIdx].items[idx].destination = {
                                      type: destType,
                                      path: defaultPath,
                                      destinationId: null
                                    };
                                    setStoreMenus(nextMenus);
                                    setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                  }}
                                  className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                >
                                  <option value="page">Store Page</option>
                                  <option value="category">Category</option>
                                  <option value="collection">Collection</option>
                                  <option value="custom">External Link</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[9px] font-black text-slate-400 block uppercase">Destination</label>
                                {nav.destination?.type === "page" && (
                                  <select
                                    value={nav.destination?.path || "home"}
                                    onChange={e => {
                                      const nextMenus = [...storeMenus];
                                      let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                      const pKey = e.target.value;
                                      const pObj = pages.find(page => page.pageKey === pKey);
                                      nextMenus[menuIdx].items[idx].destination.path = pKey;
                                      if (pObj) {
                                        nextMenus[menuIdx].items[idx].destination.destinationId = pObj._id || pObj.id;
                                        nextMenus[menuIdx].items[idx].label = pObj.title || pObj.pageKey;
                                      }
                                      setStoreMenus(nextMenus);
                                      setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                    }}
                                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                  >
                                    {pages.map(p => (
                                      <option key={p.pageKey} value={p.pageKey}>{p.title || p.pageKey}</option>
                                    ))}
                                  </select>
                                )}

                                {nav.destination?.type === "category" && (
                                  globalCategories.length === 0 ? (
                                    <div className="text-[10px] text-amber-600 font-bold mt-2">
                                      No categories available. Create them in Products.
                                    </div>
                                  ) : (
                                    <select
                                      value={nav.destination?.path || ""}
                                      onChange={e => {
                                        const nextMenus = [...storeMenus];
                                        let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                        const catName = e.target.value;
                                        const catObj = globalCategories.find(c => c.name === catName);
                                        nextMenus[menuIdx].items[idx].destination.path = catName;
                                        if (catObj) {
                                          nextMenus[menuIdx].items[idx].destination.destinationId = catObj._id || catObj.id;
                                          nextMenus[menuIdx].items[idx].label = catObj.name;
                                        }
                                        setStoreMenus(nextMenus);
                                        setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                      }}
                                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                    >
                                      {globalCategories.map(c => (
                                        <option key={c.id || c._id} value={c.name}>{c.name}</option>
                                      ))}
                                    </select>
                                  )
                                )}

                                {nav.destination?.type === "collection" && (
                                  collections.length === 0 ? (
                                    <div className="text-[10px] text-amber-600 font-bold mt-2">
                                      No collections found. Create one from Collections.
                                    </div>
                                  ) : (
                                    <select
                                      value={nav.destination?.path || ""}
                                      onChange={e => {
                                        const nextMenus = [...storeMenus];
                                        let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                        const colSlug = e.target.value;
                                        const colObj = collections.find(c => c.slug === colSlug);
                                        nextMenus[menuIdx].items[idx].destination.path = colSlug;
                                        if (colObj) {
                                          nextMenus[menuIdx].items[idx].destination.destinationId = colObj._id || colObj.id;
                                          nextMenus[menuIdx].items[idx].label = colObj.name;
                                        }
                                        setStoreMenus(nextMenus);
                                        setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                      }}
                                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                    >
                                      {collections.map(c => (
                                        <option key={c._id || c.id} value={c.slug}>{c.name}</option>
                                      ))}
                                    </select>
                                  )
                                )}

                                {nav.destination?.type === "custom" && (
                                  <input
                                    type="text"
                                    value={nav.destination?.path || ""}
                                    onChange={e => {
                                      const nextMenus = [...storeMenus];
                                      let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                      nextMenus[menuIdx].items[idx].destination.path = e.target.value;
                                      setStoreMenus(nextMenus);
                                      setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                    }}
                                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white focus:outline-none"
                                    placeholder="https://example.com"
                                  />
                                )}
                              </div>

                              <div>
                                <label className="text-[9px] font-black text-slate-400 block uppercase">Visible In</label>
                                <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-slate-650">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={nav.visibility?.desktop !== false}
                                      onChange={e => {
                                        const nextMenus = [...storeMenus];
                                        let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                        if (!nextMenus[menuIdx].items[idx].visibility) {
                                          nextMenus[menuIdx].items[idx].visibility = { desktop: true, mobile: true, footer: false };
                                        }
                                        nextMenus[menuIdx].items[idx].visibility.desktop = e.target.checked;
                                        setStoreMenus(nextMenus);
                                        setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                      }}
                                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-550 w-3.5 h-3.5"
                                    />
                                    <span>Desk</span>
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={nav.visibility?.mobile !== false}
                                      onChange={e => {
                                        const nextMenus = [...storeMenus];
                                        let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                        if (!nextMenus[menuIdx].items[idx].visibility) {
                                          nextMenus[menuIdx].items[idx].visibility = { desktop: true, mobile: true, footer: false };
                                        }
                                        nextMenus[menuIdx].items[idx].visibility.mobile = e.target.checked;
                                        setStoreMenus(nextMenus);
                                        setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                      }}
                                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-550 w-3.5 h-3.5"
                                    />
                                    <span>Mob</span>
                                  </label>
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextMenus = [...storeMenus];
                                    let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                    if (idx > 0) {
                                      const temp = nextMenus[menuIdx].items[idx];
                                      nextMenus[menuIdx].items[idx] = nextMenus[menuIdx].items[idx - 1];
                                      nextMenus[menuIdx].items[idx - 1] = temp;
                                      setStoreMenus(nextMenus);
                                      setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                    }
                                  }}
                                  className="p-2 border rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
                                >
                                  <FiChevronUp />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextMenus = [...storeMenus];
                                    let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                    if (idx < nextMenus[menuIdx].items.length - 1) {
                                      const temp = nextMenus[menuIdx].items[idx];
                                      nextMenus[menuIdx].items[idx] = nextMenus[menuIdx].items[idx + 1];
                                      nextMenus[menuIdx].items[idx + 1] = temp;
                                      setStoreMenus(nextMenus);
                                      setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                    }
                                  }}
                                  className="p-2 border rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
                                >
                                  <FiChevronDown />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextMenus = [...storeMenus];
                                    let menuIdx = nextMenus.findIndex(m => m.menuType === menuType);
                                    nextMenus[menuIdx].items = nextMenus[menuIdx].items.filter((_, i) => i !== idx);
                                    setStoreMenus(nextMenus);
                                    setDirtyMenus(prev => ({ ...prev, [menuType]: true }));
                                  }}
                                  className="p-2 border rounded-lg text-red-500 hover:bg-red-50 transition-all"
                                >
                                  <FiTrash2 />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(activeMenu.items || []).length === 0 && (
                          <div className="py-6 text-center text-xs text-slate-400 italic">No links added to menu yet.</div>
                        )}
                      </div>

                      <div className="flex justify-end pt-2 items-center gap-3">
                        {dirtyMenus[menuType] && (
                          <span className="text-xs text-amber-500 font-medium italic">● Unsaved changes</span>
                        )}
                        <button
                          onClick={async () => {
                            for (const item of activeMenu.items) {
                              const val = validateNavigationLabel(item.label);
                              if (!val.isValid) return toast.error(`Invalid link: ${val.error}`);
                            }
                            setSaving(true);
                            try {
                              await api.put(`/vendor/store/menus/${menuType}`, { items: activeMenu.items });
                              setDirtyMenus(prev => ({ ...prev, [menuType]: false }));
                              toast.success(`${menuType.charAt(0).toUpperCase() + menuType.slice(1)} menu updated successfully!`);
                            } catch (err) {
                              toast.error("Failed to save menu changes.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="px-5 py-2 bg-purple-600 hover:bg-purple-750 text-white rounded-xl text-xs font-bold shadow transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : `Save ${menuType} Menu`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "inquiries" && !editingPageKey && (
              <div className="space-y-6">
                {!selectedInquiryId ? (
                  <>
                    {/* List Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3">
                      <div>
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                          📥 Customer Inquiries
                          {unreadInquiriesCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-650 border border-red-200">
                              {unreadInquiriesCount} Unread
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400 font-semibold">Read and reply to direct storefront inquiries from your customers.</p>
                      </div>
                    </div>

                    {/* Filters, Search & Sorting Panel */}
                    <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                      {/* Search */}
                      <div className="relative w-full md:w-80">
                        <FiSearch className="absolute left-3.5 top-3 text-slate-400 text-sm" />
                        <input
                          type="text"
                          placeholder="Search customer name or message..."
                          value={inquirySearch}
                          onChange={e => setInquirySearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      {/* Filter Tabs */}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 overflow-x-auto w-full md:w-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {[
                          { id: "all", label: "All" },
                          { id: "new", label: "New" },
                          { id: "in_progress", label: "In Progress" },
                          { id: "replied", label: "Replied" },
                          { id: "closed", label: "Closed" }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setInquiryStatusFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${inquiryStatusFilter === tab.id
                                ? "bg-purple-100 text-purple-755 font-black"
                                : "text-slate-500 hover:bg-slate-50"
                              }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Sorting */}
                      <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                        <span className="text-[10px] font-black uppercase text-slate-400">Sort</span>
                        <select
                          value={inquirySort}
                          onChange={e => setInquirySort(e.target.value)}
                          className="p-2 border rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="newest">Newest Activity</option>
                          <option value="oldest">Oldest Activity</option>
                        </select>
                      </div>
                    </div>

                    {/* Inquiries Table */}
                    <div className="border rounded-2xl bg-white shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-[800px] w-full divide-y divide-slate-100 text-left">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                              <th className="px-5 py-3">Customer</th>
                              <th className="px-5 py-3">Message Preview</th>
                              <th className="px-5 py-3">Status</th>
                              <th className="px-5 py-3">Last Active</th>
                              <th className="px-5 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-xs font-semibold text-slate-700">
                            {inquiries.map(inq => {
                              const isUnread = !inq.isRead;
                              return (
                                <tr key={inq._id} className={`hover:bg-slate-50/50 transition-all ${isUnread ? "bg-purple-50/10 font-bold" : ""}`}>
                                  <td className="px-5 py-3.5">
                                    <div className="flex flex-col">
                                      <span className="text-slate-800 font-bold flex items-center gap-1.5">
                                        {isUnread && <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />}
                                        {inq.customerName}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-semibold">{inq.customerEmail}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 max-w-[280px] truncate">
                                    <span className="text-slate-600">
                                      {inq.message?.length > 70 ? `${inq.message.substring(0, 70)}...` : inq.message}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    {inq.status === "new" && (
                                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-650 border border-orange-200">
                                        New
                                      </span>
                                    )}
                                    {inq.status === "in_progress" && (
                                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-650 border border-blue-200">
                                        In Progress
                                      </span>
                                    )}
                                    {inq.status === "replied" && (
                                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-50 text-green-650 border border-green-200">
                                        Replied
                                      </span>
                                    )}
                                    {inq.status === "closed" && (
                                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                                        Closed
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-slate-400 text-[10px]">
                                    {new Date(inq.lastActivityAt).toLocaleString()}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <button
                                      onClick={() => setSelectedInquiryId(inq._id)}
                                      className="px-3.5 py-1.5 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 font-bold transition-all text-xs"
                                    >
                                      View
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {inquiries.length === 0 && (
                        <div className="py-12 text-center text-xs text-slate-400 italic bg-white">
                          No storefront inquiries found matching your parameters.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Detail Header */}
                    <div className="flex items-center gap-3 border-b pb-3 mb-6">
                      <button
                        onClick={() => setSelectedInquiryId(null)}
                        className="px-3 py-1.5 border hover:bg-slate-50 rounded-xl text-xs font-bold transition-all text-slate-600 flex items-center gap-1"
                      >
                        &larr; Back
                      </button>
                      <div>
                        <h3 className="text-lg font-black text-slate-800">Inquiry Conversation</h3>
                        <p className="text-xs text-slate-400 font-semibold">Reply directly to customer inquiry via branded email.</p>
                      </div>
                    </div>

                    {!selectedInquiry ? (
                      <div className="py-12 text-center text-xs text-slate-400 italic">
                        Loading inquiry details...
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Left: Message Thread & Reply Form */}
                        <div className="lg:col-span-2 space-y-6">
                          {/* Conversation Thread */}
                          <div className="bg-slate-50/50 border border-slate-150 p-5 rounded-2xl space-y-4">
                            {/* Customer Inquiry */}
                            <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-2">
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                <span>Customer Inquiry</span>
                                <span>{new Date(selectedInquiry.createdAt).toLocaleString()}</span>
                              </div>
                              <span className="text-sm font-black text-slate-800 block">{selectedInquiry.customerName}</span>
                              <span className="text-[10px] font-semibold text-slate-450 block">{selectedInquiry.customerEmail}</span>
                              <div className="border-t pt-2 mt-2 text-xs text-slate-650 leading-relaxed whitespace-pre-line">
                                {selectedInquiry.message}
                              </div>
                            </div>

                            {/* Replies */}
                            {(selectedInquiry.replies || []).map((rep, idx) => (
                              <div key={idx} className="bg-purple-50/20 border border-purple-100 p-4 rounded-xl shadow-sm space-y-2 ml-6">
                                <div className="flex justify-between items-center text-[10px] text-purple-400 font-bold">
                                  <span>Replied by Store</span>
                                  <span>{new Date(rep.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                                  {rep.message}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Reply Textarea Card */}
                          {selectedInquiry.status !== "closed" && (
                            <div className="border p-5 rounded-2xl space-y-3 bg-white shadow-sm">
                              <span className="text-xs font-black text-slate-800 block">Send Email Reply</span>
                              <textarea
                                rows={5}
                                placeholder="Write your professional response here... (This reply will be emailed directly to the customer)."
                                value={inquiryReplyText}
                                onChange={e => setInquiryReplyText(e.target.value)}
                                className="w-full border rounded-xl p-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-50/50"
                              />
                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={async () => {
                                    if (!inquiryReplyText.trim()) return toast.error("Reply message cannot be empty.");
                                    setSendingReply(true);
                                    try {
                                      const res = await api.post(`/vendor/store/inquiries/${selectedInquiryId}/replies`, { message: inquiryReplyText });
                                      toast.success("Reply successfully sent and emailed to customer.");
                                      setSelectedInquiry(res?.data ?? res);
                                      setInquiryReplyText("");
                                      // Refresh list
                                      const listParams = {};
                                      if (inquiryStatusFilter !== "all") listParams.status = inquiryStatusFilter;
                                      if (inquirySearch) listParams.search = inquirySearch;
                                      listParams.sort = inquirySort;
                                      fetchInquiries(listParams);
                                    } catch (err) {
                                      toast.error("Failed to send reply.");
                                      console.error(err);
                                    } finally {
                                      setSendingReply(false);
                                    }
                                  }}
                                  disabled={sendingReply}
                                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                                >
                                  {sendingReply ? "Sending..." : "Send Reply"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Metadata & Sidebar Actions */}
                        <div className="lg:col-span-1 space-y-6">
                          {/* Customer Metadata Card */}
                          <div className="border p-5 rounded-2xl bg-white shadow-sm space-y-4">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Customer Info</span>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Name</span>
                              <span className="text-xs font-bold text-slate-800">{selectedInquiry.customerName}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold uppercase">Email</span>
                              <span className="text-xs font-bold text-purple-700">{selectedInquiry.customerEmail}</span>
                            </div>
                            <hr className="border-slate-100" />

                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block">Operational Status</span>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-1.5">Change Status</span>
                              <select
                                value={selectedInquiry.status}
                                onChange={async e => {
                                  try {
                                    const res = await api.patch(`/vendor/store/inquiries/${selectedInquiryId}/status`, { status: e.target.value });
                                    toast.success("Status successfully updated.");
                                    setSelectedInquiry(res?.data ?? res);
                                    // Refresh list
                                    const listParams = {};
                                    if (inquiryStatusFilter !== "all") listParams.status = inquiryStatusFilter;
                                    if (inquirySearch) listParams.search = inquirySearch;
                                    listParams.sort = inquirySort;
                                    fetchInquiries(listParams);
                                  } catch (err) {
                                    toast.error("Failed to update status.");
                                  }
                                }}
                                className="w-full text-xs font-bold border rounded-xl p-2.5 bg-slate-50 border-slate-200 focus:outline-none"
                              >
                                <option value="new">New</option>
                                <option value="in_progress">In Progress</option>
                                <option value="replied">Replied</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                            <hr className="border-slate-100" />

                            {/* Quick Actions */}
                            <div className="space-y-2">
                              {selectedInquiry.status !== "closed" ? (
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/vendor/store/inquiries/${selectedInquiryId}/status`, { status: "closed" });
                                      toast.success("Inquiry closed successfully.");
                                      setSelectedInquiry(res?.data ?? res);
                                      // Refresh list
                                      const listParams = {};
                                      if (inquiryStatusFilter !== "all") listParams.status = inquiryStatusFilter;
                                      if (inquirySearch) listParams.search = inquirySearch;
                                      listParams.sort = inquirySort;
                                      fetchInquiries(listParams);
                                    } catch (err) {
                                      toast.error("Failed to close inquiry.");
                                    }
                                  }}
                                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all text-center block"
                                >
                                  Close Inquiry
                                </button>
                              ) : (
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/vendor/store/inquiries/${selectedInquiryId}/status`, { status: "in_progress" });
                                      toast.success("Inquiry re-opened successfully.");
                                      setSelectedInquiry(res?.data ?? res);
                                      // Refresh list
                                      const listParams = {};
                                      if (inquiryStatusFilter !== "all") listParams.status = inquiryStatusFilter;
                                      if (inquirySearch) listParams.search = inquirySearch;
                                      listParams.sort = inquirySort;
                                      fetchInquiries(listParams);
                                    } catch (err) {
                                      toast.error("Failed to re-open inquiry.");
                                    }
                                  }}
                                  className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-xl text-xs transition-all text-center block"
                                >
                                  Re-open Inquiry
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    );
  };

  export default VendorStoreManager;
