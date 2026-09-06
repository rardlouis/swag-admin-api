import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api.js";
import { containsProfanity, PROFANITY_ERROR } from "../profanity.js";

const ChatContext = createContext(null);

export const useChatContext = () => useContext(ChatContext);

const MOCK_CONVERSATIONS = [
  {
    id: "AFD05202610",
    name: "Mark Jason Cahanding",
    lastMsg: "Yes! Your order was shipped via JRS Express.",
    time: "10:22 AM",
    unread: 2,
    mode: "ai",
    messages: [
      { id: 1, from: "ai",      text: "Hi Mala! Thanks for shopping with A·FRO. How can we help you today?", time: "10:20 AM" },
      { id: 2, from: "customer", text: "Hi! I just wanted to check on my order — the Vintage Brown Jacket. Is it already shipped?", time: "10:21 AM" },
      { id: 3, from: "ai",      text: "Yes! Your order AFD05202610 was shipped earlier today via JRS Express.", time: "10:22 AM" },
    ],
    product: { name: "Vintage Jacket", price: "₱380", orderId: "Order AFD05202610", emoji: "🧥" },
  },
  {
    id: "AFD06234513",
    name: "Leslie Alexander",
    lastMsg: "AI: Hey!",
    time: "55m",
    unread: 0,
    mode: "ai",
    messages: [
      { id: 1, from: "ai", text: "Hi Leslie! How can I help you today?", time: "9:05 AM" },
      { id: 2, from: "customer", text: "I want to return my item.", time: "9:06 AM" },
    ],
    product: null,
  },
  {
    id: "AFD35566234",
    name: "Natalie Reynolds",
    lastMsg: "You: Hey!",
    time: "55m",
    unread: 1,
    mode: "human",
    messages: [
      { id: 1, from: "admin", text: "Hey Natalie! What can I do for you?", time: "8:50 AM" },
      { id: 2, from: "customer", text: "My package hasn't arrived.", time: "8:52 AM" },
    ],
    product: null,
  },
  {
    id: "AFD23546734",
    name: "Moo Moo Dizon",
    lastMsg: "You: Yes",
    time: "55m",
    unread: 0,
    mode: "human",
    messages: [
      { id: 1, from: "admin", text: "Hello! How can we assist?", time: "8:00 AM" },
    ],
    product: null,
  },
  {
    id: "AFD23456234",
    name: "Tel Malacruz",
    lastMsg: "Customer: Hey!",
    time: "55m",
    unread: 3,
    mode: "ai",
    messages: [
      { id: 1, from: "customer", text: "Hey! I need help.", time: "7:45 AM" },
    ],
    product: null,
  },
  {
    id: "AFD23454563",
    name: "Guy Hawkins",
    lastMsg: "AI: Hey!",
    time: "6m",
    unread: 0,
    mode: "ai",
    messages: [
      { id: 1, from: "ai", text: "Hi Guy! What can I help you with?", time: "11:54 AM" },
    ],
    product: null,
  },
];

export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId]           = useState(null);
  const [floatingOpen, setFloatingOpen]   = useState(false);
  const [filter, setFilter]               = useState("All");
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");

  const activeConv = conversations.find((c) => c.id === activeId);

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await apiGet("/admin/chats");

      if (Array.isArray(data)) {
        setConversations(data);
        setActiveId((current) => (data.some((conv) => conv.id === current) ? current : data[0]?.id ?? null));
      }
    } catch (err) {
      setError(err.message || "Unable to load chats");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations(true);
    }, 4000);

    return () => clearInterval(timer);
  }, [loadConversations]);

  const selectConversation = (convId) => {
    setActiveId(convId);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId ? { ...c, unread: 0 } : c
      )
    );

    apiPost(`/admin/chats/${convId}/read`, {})
      .then((data) => {
        if (Array.isArray(data)) {
          setConversations(data);
        }
      })
      .catch(() => undefined);
  };

  const sendMessage = async (text, convId = activeId) => {
    if (containsProfanity(text)) {
      setError(PROFANITY_ERROR);
      return false;
    }

    const optimisticMessage = {
      id: `local-${Date.now()}`,
      from: "admin",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId
          ? c
          : {
              ...c,
              unread: 0,
              lastMsg: `You: ${text}`,
              time: "now",
              messages: [...c.messages, optimisticMessage],
            }
      )
    );

    try {
      const data = await apiPost(`/admin/chats/${convId}/messages`, { text });

      if (Array.isArray(data) && data.length > 0) {
        setConversations(data);
      }
    } catch (err) {
      setError(err.message || "Unable to send message");
      return false;
    }

    return true;
  };

  const toggleMode = async (convId = activeId) => {
    const conversation = conversations.find((item) => item.id === convId);
    if (!conversation) return false;

    const nextMode = conversation.mode === "ai" ? "human" : "ai";

    setConversations((prev) =>
      prev.map((c) =>
        c.id !== convId ? c : { ...c, mode: nextMode, type: nextMode, isAi: nextMode === "ai" }
      )
    );

    try {
      const data = await apiPatch(`/admin/chats/${convId}/mode`, { mode: nextMode });

      if (Array.isArray(data)) {
        setConversations(data);
      }
    } catch (err) {
      setError(err.message || "Unable to update chat mode");
      loadConversations(true);
      return false;
    }

    return true;
  };

  const deleteChat = async (convId = activeId) => {
    if (!convId) return false;

    const nextConversations = conversations.filter((conversation) => conversation.id !== convId);
    setConversations(nextConversations);
    setActiveId((current) => (current === convId ? nextConversations[0]?.id ?? null : current));

    try {
      await apiDelete(`/admin/chats/${convId}`);
    } catch (err) {
      setError(err.message || "Unable to delete chat");
      loadConversations(true);
      return false;
    }

    return true;
  };

  return (
    <ChatContext.Provider value={{ conversations, activeId, setActiveId: selectConversation, activeConv, sendMessage, toggleMode, deleteChat, floatingOpen, setFloatingOpen, filter, setFilter, loading, error, refreshChats: loadConversations }}>
      {children}
    </ChatContext.Provider>
  );
}
