import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiPlus,
  FiChevronRight,
  FiAlertCircle,
  FiSend,
  FiArrowLeft,
  FiPhone,
  FiMail,
  FiTag,
  FiCopy,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "../../../shared/components/PageTransition";
import MobileLayout from "../components/Layout/MobileLayout";
import * as supportService from "../services/supportService";
import toast from "react-hot-toast";
import { getSocket, joinRoom, leaveRoom } from "../../../shared/utils/socket";
import { useAuthStore } from "../../../shared/store/authStore";

const Support = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const scrollToBottom = (force = false) => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (force) {
      container.scrollTop = container.scrollHeight;
    } else {
      const threshold = 150; // pixels from bottom
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        threshold;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  useEffect(() => {
    if (selectedTicket) {
      const messages = selectedTicket.messages || [];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderType === "user") {
          scrollToBottom(true);
        } else {
          scrollToBottom(false);
        }
      } else {
        scrollToBottom(true);
      }
    }
  }, [selectedTicket?.messages]);

  useEffect(() => {
    if (selectedTicket?._id) {
      scrollToBottom(true);
    }
  }, [selectedTicket?._id]);

  useEffect(() => {
    const activeTicketId = sessionStorage.getItem("active_ticket_id");
    if (activeTicketId && tickets.length > 0) {
      const found = tickets.find((t) => t._id === activeTicketId);
      if (found) {
        if (
          !selectedTicket ||
          JSON.stringify(selectedTicket.messages) !==
            JSON.stringify(found.messages) ||
          selectedTicket.status !== found.status
        ) {
          setSelectedTicket(found);
        }
      }
    }
  }, [tickets]);

  const { user } = useAuthStore();

  // Connect to user room on mount
  useEffect(() => {
    const token =
      localStorage.getItem("token") || localStorage.getItem("user-token");
    if (!token || !user?.id) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`user_${user.id}`);

    const handleNewSupportMessage = (msg) => {
      const ticketId = msg.ticketId;
      if (!ticketId) return;

      // Normalize message fields
      const rawDate = msg.createdAt;
      const parsedDate = new Date(rawDate);
      const isValidDate = rawDate && !isNaN(parsedDate.getTime());

      const normalizedMsg = {
        ...msg,
        _id: msg._id || `temp-${Date.now()}-${Math.random()}`,
        createdAt: isValidDate ? rawDate : new Date().toISOString(),
      };

      // Update the tickets list in real-time
      setTickets((prev) =>
        prev.map((t) => {
          if (t._id === ticketId) {
            const messages = t.messages || [];
            const exists = messages.some((m) => m._id === normalizedMsg._id);
            const merged = exists ? messages : [...messages, normalizedMsg];
            const sorted = [...merged].sort(
              (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
            );
            return {
              ...t,
              status: normalizedMsg.status || t.status,
              updatedAt: normalizedMsg.updatedAt || t.updatedAt,
              messages: sorted,
            };
          }
          return t;
        }),
      );

      // If we are currently viewing this ticket
      if (selectedTicket && selectedTicket._id === ticketId) {
        setSelectedTicket((prev) => {
          if (!prev || prev._id !== ticketId) return prev;
          const messages = prev.messages || [];
          const exists = messages.some((m) => m._id === normalizedMsg._id);
          if (exists) return prev;
          const sorted = [...messages, normalizedMsg].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          );
          return {
            ...prev,
            status: normalizedMsg.status || prev.status,
            updatedAt: normalizedMsg.updatedAt || prev.updatedAt,
            messages: sorted,
          };
        });
      } else {
        // Background notification toast (only if not viewing the ticket)
        const senderName =
          normalizedMsg.senderType === "admin" ? "Admin Support" : "Support";
        toast.success(
          `New message on Ticket #${ticketId.slice(-6).toUpperCase()} from ${senderName}: "${normalizedMsg.message}"`,
        );
      }
    };

    socket.on("new_support_message", handleNewSupportMessage);

    return () => {
      socket.off("new_support_message", handleNewSupportMessage);
      leaveRoom(`user_${user.id}`);
    };
  }, [user?.id, selectedTicket?._id]);

  // Join specific ticket room on selection
  useEffect(() => {
    if (!selectedTicket?._id) return;

    joinRoom(`ticket_${selectedTicket._id}`);

    return () => {
      leaveRoom(`ticket_${selectedTicket._id}`);
    };
  }, [selectedTicket?._id]);

  // New Ticket Form State
  const [newTicket, setNewTicket] = useState({
    subject: "",
    ticketTypeId: "",
    message: "",
    priority: "low",
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [ticketsRes, typesRes] = await Promise.all([
        supportService.getUserTickets(),
        supportService.getTicketTypes(),
      ]);
      setTickets(ticketsRes?.tickets || ticketsRes?.data?.tickets || []);
      setTicketTypes(typesRes?.data || typesRes || []);
    } catch (error) {
      toast.error("Failed to load support data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    const trimmedSubject = String(newTicket.subject || "").trim();
    const trimmedMessage = String(newTicket.message || "").trim();

    if (!trimmedSubject || !trimmedMessage || !newTicket.ticketTypeId) {
      toast.error("Please fill all required fields");
      return;
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
      toast.error("Subject must be between 3 and 100 characters");
      return;
    }

    if (trimmedMessage.length < 3 || trimmedMessage.length > 1000) {
      toast.error("Message must be between 3 and 1000 characters");
      return;
    }

    setIsSending(true);
    try {
      await supportService.createTicket({
        subject: trimmedSubject,
        message: trimmedMessage,
        ticketTypeId: newTicket.ticketTypeId,
        priority: newTicket.priority,
      });
      toast.success("Ticket created successfully");
      setNewTicket({
        subject: "",
        ticketTypeId: "",
        message: "",
        priority: "low",
      });
      setIsCreating(false);
      fetchInitialData();
    } catch (error) {
      toast.error(error.message || "Failed to create ticket");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendReply = async (e) => {
    e?.preventDefault();
    const trimmedReply = String(replyMessage || "").trim();
    if (!trimmedReply) return;

    setIsSending(true);
    try {
      const res = await supportService.addTicketMessage(
        selectedTicket._id,
        trimmedReply,
      );
      const newMsg = res?.data || res;

      // Normalize message fields
      const rawDate = newMsg.createdAt;
      const parsedDate = new Date(rawDate);
      const isValidDate = rawDate && !isNaN(parsedDate.getTime());

      const normalizedNewMsg = {
        ...newMsg,
        _id: newMsg._id || `temp-${Date.now()}-${Math.random()}`,
        createdAt: isValidDate ? rawDate : new Date().toISOString(),
      };

      setSelectedTicket((prev) => {
        if (!prev) return prev;
        const messages = prev.messages || [];
        const exists = messages.some((m) => m._id === normalizedNewMsg._id);
        if (exists) return prev;
        const sorted = [...messages, normalizedNewMsg].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        );
        return {
          ...prev,
          messages: sorted,
        };
      });
      setReplyMessage("");
      // Update in list
      setTickets((prev) =>
        prev.map((t) =>
          t._id === selectedTicket._id ? { ...t, updatedAt: new Date() } : t,
        ),
      );
    } catch (error) {
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply(e);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open":
        return "bg-green-100 text-green-700 border-green-200";
      case "in_progress":
        return "bg-yellow-100 text-yellow-750 border-yellow-200";
      case "resolved":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "closed":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "urgent":
        return "text-purple-650";
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-700";
      case "low":
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  const getRelativeTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const renderMessagesWithDates = (messages) => {
    const elements = [];

    if (selectedTicket) {
      elements.push(
        <div
          key="ticket-metadata-header"
          className="bg-gray-100/70 border border-gray-200 rounded-xl p-3 mb-4 text-center text-xs text-gray-600 space-y-1 mx-2"
        >
          <p className="font-semibold">
            Ticket Created:{" "}
            {new Date(selectedTicket.createdAt).toLocaleString()}
          </p>
          <p className="text-[10px] uppercase font-bold text-gray-400">
            Priority:{" "}
            <span
              className={`font-extrabold ${getPriorityColor(selectedTicket.priority)}`}
            >
              {selectedTicket.priority}
            </span>
          </p>
        </div>,
      );
    }

    if (!messages || messages.length === 0)
      return elements.length > 0 ? elements : null;
    let lastDateStr = null;

    messages.forEach((msg, idx) => {
      const date = new Date(msg.createdAt);
      const dateStr = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const todayStr = new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      let separatorText = dateStr;
      if (dateStr === todayStr) separatorText = "Today";
      else if (dateStr === yesterdayStr) separatorText = "Yesterday";

      if (dateStr !== lastDateStr) {
        elements.push(
          <div key={`sep-${idx}`} className="flex justify-center my-3">
            <span className="text-[9px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              {separatorText}
            </span>
          </div>,
        );
        lastDateStr = dateStr;
      }

      elements.push(
        <div
          key={idx}
          className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            onDoubleClick={() => copyToClipboard(msg.message)}
            title="Double-click to copy"
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm cursor-pointer select-none ${
              msg.senderType === "user"
                ? "bg-blue-600 text-white rounded-tr-none"
                : "bg-gray-150 text-gray-900 rounded-tl-none"
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {msg.message}
            </p>
            <p
              className={`text-[9px] mt-1 text-right ${msg.senderType === "user" ? "text-blue-200" : "text-gray-400"}`}
            >
              {date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>,
      );
    });

    return elements;
  };

  return (
    <PageTransition>
      <MobileLayout
        showBottomNav={!selectedTicket}
        showCartBar={!selectedTicket}
      >
        <div
          className={`min-h-screen bg-gray-50 ${selectedTicket ? "pb-0" : "pb-20"}`}
        >
          {/* Header */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => {
                  if (selectedTicket) {
                    setSelectedTicket(null);
                    sessionStorage.removeItem("active_ticket_id");
                  } else if (isCreating) {
                    setIsCreating(false);
                  } else {
                    navigate(-1);
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              >
                <FiArrowLeft className="text-xl" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-gray-800 truncate leading-tight">
                  {selectedTicket
                    ? selectedTicket.subject
                    : isCreating
                      ? "Create New Ticket"
                      : "Contact Us"}
                </h1>
                {selectedTicket && (
                  <p className="text-[10px] text-gray-500 font-semibold truncate leading-none mt-0.5">
                    Ticket #{selectedTicket._id.slice(-6).toUpperCase()} •{" "}
                    <span
                      className={`uppercase font-bold ${selectedTicket.status === "open" ? "text-green-600" : selectedTicket.status === "closed" ? "text-gray-500" : "text-blue-600"}`}
                    >
                      {selectedTicket.status.replace("_", " ")}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div
            className={
              selectedTicket
                ? "max-w-3xl mx-auto p-0 sm:p-4"
                : "max-w-3xl mx-auto p-4"
            }
          >
            {isCreating ? (
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between mb-2 px-2">
                  <h2 className="text-lg font-bold text-gray-800">
                    Create New Ticket
                  </h2>
                  <button
                    onClick={() => setIsCreating(false)}
                    className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <form
                  onSubmit={handleCreateTicket}
                  className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
                >
                  {/* Subject */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-bold text-gray-700">
                        Subject *
                      </label>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {newTicket.subject.length} / 100
                      </span>
                    </div>
                    <input
                      type="text"
                      value={newTicket.subject}
                      maxLength={100}
                      onChange={(e) =>
                        setNewTicket({ ...newTicket, subject: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none transition-all text-sm"
                      placeholder="What is the issue?"
                      required
                    />
                  </div>

                  {/* Category and Priority */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Select Category *
                      </label>
                      <select
                        value={newTicket.ticketTypeId}
                        onChange={(e) =>
                          setNewTicket({
                            ...newTicket,
                            ticketTypeId: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none bg-white text-sm"
                        required
                      >
                        <option value="">Select Category</option>
                        {ticketTypes.map((type) => (
                          <option key={type._id} value={type._id}>
                            {type.icon || "❓"} {type.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Priority (optional)
                      </label>
                      <select
                        value={newTicket.priority}
                        onChange={(e) =>
                          setNewTicket({
                            ...newTicket,
                            priority: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none bg-white text-sm uppercase font-semibold"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-bold text-gray-700">
                        Description *
                      </label>
                      <span className="text-[10px] text-gray-400 font-semibold">
                        {newTicket.message.length} / 1000
                      </span>
                    </div>
                    <textarea
                      value={newTicket.message}
                      maxLength={1000}
                      onChange={(e) =>
                        setNewTicket({ ...newTicket, message: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none h-32 resize-none text-sm"
                      placeholder="Describe your issue in detail..."
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-100"
                  >
                    {isSending ? "Submitting..." : "Submit Ticket"}
                  </button>
                </form>
              </div>
            ) : selectedTicket ? (
              <div className="sm:space-y-4 sm:pt-4">
                <div className="bg-white rounded-none sm:rounded-2xl shadow-sm sm:border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-60px)] sm:h-[600px]">
                  {/* Chat Messages */}
                  <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-55"
                  >
                    {renderMessagesWithDates(selectedTicket.messages)}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply form / Disabled closure banner */}
                  {selectedTicket.status === "closed" ? (
                    <div className="border-t border-gray-100 p-6 text-center space-y-3 bg-gray-50/80">
                      <p className="text-sm font-bold text-gray-500">
                        This ticket has been closed. Replies are disabled.
                      </p>
                      <p className="text-xs text-gray-400">
                        Need further help?
                      </p>
                      <button
                        onClick={() => {
                          setSelectedTicket(null);
                          sessionStorage.removeItem("active_ticket_id");
                          setIsCreating(true);
                        }}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-colors"
                      >
                        Create New Ticket
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSendReply}
                      className="p-3 border-t border-gray-100 bg-white flex gap-2"
                    >
                      <textarea
                        value={replyMessage}
                        onChange={(e) => {
                          setReplyMessage(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.target.style.height = "auto";
                          }
                          handleKeyDown(e);
                        }}
                        placeholder="Type a reply..."
                        rows="1"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none resize-none min-h-[44px] max-h-[120px] text-sm bg-gray-50 overflow-y-auto"
                      />
                      <button
                        type="submit"
                        disabled={isSending || !replyMessage.trim()}
                        className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center shadow-md shadow-blue-150"
                      >
                        <FiSend />
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center mb-4 px-2">
                  <h2 className="text-lg font-bold text-gray-800">
                    Your Tickets
                  </h2>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
                  >
                    <FiPlus /> New Ticket
                  </button>
                </div>

                {/* Tickets List */}
                <div className="space-y-3">
                  {isLoading ? (
                    <div className="text-center py-12 text-gray-500 text-sm">
                      Loading tickets...
                    </div>
                  ) : tickets.length > 0 ? (
                    tickets.map((ticket) => (
                      <div
                        key={ticket._id}
                        onClick={() => {
                          setSelectedTicket(ticket);
                          sessionStorage.setItem(
                            "active_ticket_id",
                            ticket._id,
                          );
                        }}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <h3 className="font-bold text-gray-800 text-sm truncate">
                            {ticket.subject}
                          </h3>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            #{ticket._id}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getStatusColor(ticket.status)}`}
                            >
                              {ticket.status.replace("_", " ")}
                            </span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider bg-gray-50 border-gray-250 ${getPriorityColor(ticket.priority)}`}
                            >
                              {ticket.priority}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              Last Reply: {getRelativeTime(ticket.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <FiChevronRight className="text-gray-400 flex-shrink-0" />
                      </div>
                    ))
                  ) : (
                    <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
                      <FiAlertCircle className="mx-auto mb-3 text-4xl text-gray-300" />
                      <p className="text-gray-700 font-bold">
                        No support tickets found.
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Create your first ticket if you need any assistance.
                      </p>
                    </div>
                  )}
                </div>

                <h2 className="text-lg font-bold text-gray-800 mt-8 mb-4 px-2">
                  Get in Touch
                </h2>

                {/* Mobile Phone */}
                <a href="tel:+919876543210" className="block">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-blue-200 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FiPhone className="text-xl" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-sm">
                        Mobile Phone
                      </h3>
                      <p className="text-gray-500 text-sm">+91 98765 43210</p>
                    </div>
                    <FiChevronRight className="text-gray-400" />
                  </motion.div>
                </a>

                {/* Gmail */}
                <a href="mailto:support@Porutkal.com" className="block">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-blue-200 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-red-650 flex items-center justify-center">
                      <FiMail className="text-xl" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-sm">Gmail</h3>
                      <p className="text-gray-500 text-sm">
                        support@Porutkal.com
                      </p>
                    </div>
                    <FiChevronRight className="text-gray-400" />
                  </motion.div>
                </a>

                {/* Collaboration Request */}
                <a
                  href="mailto:collab@Porutkal.com?subject=Collaboration Request"
                  className="block"
                >
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:border-blue-200 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-650 flex items-center justify-center">
                      <FiTag className="text-xl" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-sm">
                        Collaboration Request
                      </h3>
                      <p className="text-gray-500 text-sm">Partner with us</p>
                    </div>
                    <FiChevronRight className="text-gray-400" />
                  </motion.div>
                </a>

                <div className="mt-12 text-center px-6">
                  <p className="text-sm text-gray-400">
                    Our team typically responds within 24 hours during business
                    days.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default Support;
