import { useState, useRef, useEffect } from "react";
import { useChatContext } from "../../context/ChatContext.jsx";
import { MdSearch, MdSend, MdAttachFile, MdSmartToy, MdPerson, MdEdit } from "react-icons/md";
import "./Chats.css";

const FILTERS = ["All", "Unread", "AI", "Human", "Ongoing", "Complete"];

function ConvItem({ conv, active, onClick }) {
  return (
    <div className={`conv-item ${active ? "conv-item--active" : ""}`} onClick={onClick}>
      <div className="conv-avatar">
        <span>{conv.name[0]}</span>
        <div className={`conv-mode-dot ${conv.mode === "ai" ? "dot-ai" : "dot-human"}`}>
          {conv.mode === "ai" ? <MdSmartToy size={8} /> : <MdPerson size={8} />}
        </div>
      </div>
      <div className="conv-info">
        <p className="conv-id">{conv.product?.name ?? conv.id}</p>
        <p className="conv-name">{conv.name}</p>
        <p className="conv-last">{conv.lastMsg}</p>
      </div>
      <div className="conv-meta">
        <span className="conv-time">{conv.time}</span>
        {conv.unread > 0 && <span className="conv-badge">{conv.unread}</span>}
      </div>
    </div>
  );
}

export default function Chats() {
  const { conversations, activeId, setActiveId, activeConv, sendMessage, toggleMode, filter, setFilter, loading, error } = useChatContext();
  const [input, setInput]     = useState("");
  const [search, setSearch]   = useState("");
  const bottomRef             = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  const filtered = conversations.filter((c) => {
    const query = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(query) ||
      c.product?.name?.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query);
    if (!matchSearch) return false;
    if (filter === "All")     return true;
    if (filter === "Unread")  return c.unread > 0;
    if (filter === "AI")      return c.mode === "ai";
    if (filter === "Human")   return c.mode === "human";
    return true;
  });

  return (
    <div className="chats-page">
      {/* Header */}
      <div className="chats-header">
        <h1 className="chats-title">Chats</h1>
        <p className="chats-breadcrumb">Dashboard <span>▶</span> <strong>Chats</strong></p>
        {(loading || error) && (
          <p className={error ? "chat-status chat-status--error" : "chat-status"}>
            {error || "Loading chats..."}
          </p>
        )}
      </div>

      <div className="chats-layout">
        {/* ── Center: Main Chat ── */}
        <div className="chat-main">
          {activeConv ? (
            <>
              {/* Chat top bar */}
              <div className="chat-topbar">
                <div className="chat-topbar-left">
                  <div className="chat-topbar-avatar">{activeConv.name[0]}</div>
                  <span className="chat-topbar-name">{activeConv.name}</span>
                </div>
                <div className="chat-topbar-right">
                  <button
                    className={`mode-toggle-btn ${activeConv.mode === "ai" ? "mode-ai" : "mode-human"}`}
                    onClick={() => toggleMode()}
                    title={activeConv.mode === "ai" ? "Switch to Human" : "Switch to AI"}
                  >
                    {activeConv.mode === "ai" ? <MdSmartToy size={18} /> : <MdPerson size={18} />}
                    <span>{activeConv.mode === "ai" ? "AI Mode" : "Human Mode"}</span>
                  </button>
                </div>
              </div>

              {/* Linked product card */}
              {activeConv.product && (
                <div className="chat-product-card">
                  <div className="chat-product-emoji">{activeConv.product.emoji}</div>
                  <div className="chat-product-info">
                    <p className="chat-product-name">{activeConv.product.name}</p>
                    <p className="chat-product-price">{activeConv.product.price}</p>
                    <p className="chat-product-order">{activeConv.product.orderId}</p>
                  </div>
                  <button className="chat-product-edit"><MdEdit size={16} /></button>
                </div>
              )}

              {/* Messages */}
              <div className="chat-messages">
                <div className="chat-date-divider">Today, April 11</div>
                {activeConv.messages.map((msg) => (
                  <div key={msg.id} className={`chat-bubble-wrap chat-bubble-wrap--${msg.from === "customer" ? "left" : "right"}`}>
                    {msg.from === "customer" && (
                      <div className="chat-bubble-avatar">{activeConv.name[0]}</div>
                    )}
                    <div className={`chat-bubble chat-bubble--${msg.from}`}>
                      {msg.text}
                    </div>
                    <span className="chat-bubble-time">{msg.time}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="chat-input-bar">
                <button className="chat-attach-btn"><MdAttachFile size={20} /></button>
                <input
                  className="chat-input"
                  placeholder="Type a message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <button className="chat-send-btn" onClick={handleSend}><MdSend size={18} /></button>
              </div>
            </>
          ) : (
            <div className="chat-empty">Select a conversation to start chatting</div>
          )}
        </div>

        {/* ── Right: Conversation List ── */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-search">
            <MdSearch size={15} color="#aaa" />
            <input placeholder="Search Chats" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="chat-filter-tabs">
            {FILTERS.map((f) => (
              <button key={f} className={`chat-filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="conv-list">
            {filtered.map((c) => (
              <ConvItem key={c.id} conv={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
