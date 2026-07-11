import { useState, useEffect } from "react";
import { FiSave, FiBell, FiSearch, FiMail } from "react-icons/fi";
import { motion } from "framer-motion";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import AnimatedSelect from "../../components/AnimatedSelect";
import toast from "react-hot-toast";

const NotificationsSEOSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [emailData, setEmailData] = useState({});
  const [notificationsData, setNotificationsData] = useState({});
  const [seoData, setSeoData] = useState({});
  const [activeSection, setActiveSection] = useState("notifications");

  useEffect(() => {
    initialize();
    if (settings) {
      if (settings.notifications) setNotificationsData(settings.notifications);
      if (settings.seo) setSeoData(settings.seo);
    }
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.notifications) setNotificationsData(settings.notifications);
      if (settings.seo) setSeoData(settings.seo);
    }
  }, [settings]);

  const handleNotificationToggle = (category, setting) => {
    setNotificationsData({
      ...notificationsData,
      [category]: {
        ...notificationsData[category],
        [setting]: !notificationsData[category]?.[setting],
      },
    });
  };

  const handleSEOChange = (e) => {
    const { name, value } = e.target;
    setSeoData({
      ...seoData,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings("notifications", notificationsData);
    updateSettings("seo", seoData);
    toast.success("Settings saved successfully");
  };

  const sections = [
    { id: "notifications", label: "Notifications", icon: FiBell },
    { id: "seo", label: "SEO Settings", icon: FiSearch },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Notifications & SEO
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Configure email, notifications, and SEO settings
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${
                    activeSection === section.id
                      ? "border-primary-600 text-primary-600 font-semibold"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                  }`}>
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">


          {/* Notifications Section */}
          {activeSection === "notifications" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Email Notifications
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Order Confirmation
                      </h4>
                      <p className="text-xs text-gray-600">
                        Send email when order is placed
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={
                          notificationsData.email?.orderConfirmation !== false
                        }
                        onChange={() =>
                          handleNotificationToggle("email", "orderConfirmation")
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Shipping Update
                      </h4>
                      <p className="text-xs text-gray-600">
                        Send email when order is shipped
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={
                          notificationsData.email?.shippingUpdate !== false
                        }
                        onChange={() =>
                          handleNotificationToggle("email", "shippingUpdate")
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Delivery Update
                      </h4>
                      <p className="text-xs text-gray-600">
                        Send email when order is delivered
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={
                          notificationsData.email?.deliveryUpdate !== false
                        }
                        onChange={() =>
                          handleNotificationToggle("email", "deliveryUpdate")
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Other Notifications
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        SMS Notifications
                      </h4>
                      <p className="text-xs text-gray-600">
                        Send SMS notifications to customers
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={notificationsData.smsEnabled || false}
                        onChange={(e) =>
                          setNotificationsData({
                            ...notificationsData,
                            smsEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Push Notifications
                      </h4>
                      <p className="text-xs text-gray-600">
                        Send push notifications to app users
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={notificationsData.pushEnabled || false}
                        onChange={(e) =>
                          setNotificationsData({
                            ...notificationsData,
                            pushEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Admin Notifications
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        New Orders
                      </h4>
                      <p className="text-xs text-gray-600">
                        Notify admin when new order is placed
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={notificationsData.admin?.newOrders !== false}
                        onChange={() =>
                          handleNotificationToggle("admin", "newOrders")
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800">
                        Low Stock Alerts
                      </h4>
                      <p className="text-xs text-gray-600">
                        Notify admin when products are low in stock
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 sm:ml-4">
                      <input
                        type="checkbox"
                        checked={notificationsData.admin?.lowStock !== false}
                        onChange={() =>
                          handleNotificationToggle("admin", "lowStock")
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SEO Section */}
          {activeSection === "seo" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Meta Title
                </label>
                <input
                  type="text"
                  name="metaTitle"
                  value={seoData.metaTitle || ""}
                  onChange={handleSEOChange}
                  maxLength={60}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {seoData.metaTitle?.length || 0}/60 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Meta Description
                </label>
                <textarea
                  name="metaDescription"
                  value={seoData.metaDescription || ""}
                  onChange={handleSEOChange}
                  rows={3}
                  maxLength={160}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {seoData.metaDescription?.length || 0}/160 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Meta Keywords
                </label>
                <input
                  type="text"
                  name="metaKeywords"
                  value={seoData.metaKeywords || ""}
                  onChange={handleSEOChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Open Graph Image URL
                  </label>
                  <input
                    type="text"
                    name="ogImage"
                    value={seoData.ogImage || ""}
                    onChange={handleSEOChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="data/logos/og-image.png"
                  />
                  {seoData.ogImage && (
                    <img
                      src={seoData.ogImage}
                      alt="OG Preview"
                      className="mt-4 w-32 h-32 object-cover rounded-lg border border-gray-200"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Canonical URL
                  </label>
                  <input
                    type="url"
                    name="canonicalUrl"
                    value={seoData.canonicalUrl || ""}
                    onChange={handleSEOChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="https://yourstore.com"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm sm:text-base w-full sm:w-auto">
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default NotificationsSEOSettings;
