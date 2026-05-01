import { useEffect, useState } from "react";
import { MdChatBubbleOutline, MdClose, MdSearch, MdSend, MdSmartToy, MdPerson } from "react-icons/md";
import { useChatContext } from "../context/ChatContext.jsx";
import "./FloatingChat.css";

export default function FloatingChat() {
  const {
    conversations,
    activeId,
    setActiveId,
    sendMessage,
    floatingOpen,
    setFloatingOpen,
  } = useChatContext();

  const [inputs, setInputs] = useState({});
  const [search, setSearch] = useState("");
  const [openChatIds, setOpenChatIds] = useState([]);

  useEffect(() => {
    if (conversations.length === 0) {
      setOpenChatIds([]);
      setSearch("");
    }
  }, [conversations.length]);

  const filtered = conversations.filter((conv) =>
    `${conv.name} ${conv.id}`.toLowerCase().includes(search.toLowerCase())
  );

  const openChatbox = (convId) => {
    setActiveId(convId);
    setOpenChatIds((prev) => {
      const withoutCurrent = prev.filter((id) => id !== convId);
      return [convId, ...withoutCurrent].slice(0, 3);
    });
  };

  const closeChatbox = (convId) => {
    setOpenChatIds((prev) => prev.filter((id) => id !== convId));
  };

  const handleInputChange = (convId, value) => {
    setInputs((prev) => ({ ...prev, [convId]: value }));
  };

  const handleSend = (convId) => {
    const text = inputs[convId]?.trim();
    if (!text) return;

    sendMessage(text, convId);
    setInputs((prev) => ({ ...prev, [convId]: "" }));
  };

  return (
    <>
      {floatingOpen && (
        <div className="floating-chat-logs">
          <div className="floating-chat-header">
            <div>
              <strong>Chats</strong>
              <span>{conversations.length} conversations</span>
            </div>

            <button onClick={() => setFloatingOpen(false)} type="button">
              <MdClose size={18} />
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="floating-chat-empty">
              <div className="floating-chat-empty-icon">
                <MdChatBubbleOutline size={26} />
              </div>
              <strong>No chats yet</strong>
              <span>Customer conversations will appear here.</span>
            </div>
          ) : (
            <>
              <div className="floating-chat-search">
                <MdSearch size={15} />
                <input
                  placeholder="Search Messenger"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="floating-chat-tabs">
                <button className="active" type="button">All</button>
                <button type="button">Unread</button>
                <button type="button">AI</button>
                <button type="button">Human</button>
              </div>

              <div className="floating-chat-threads">
                {filtered.length === 0 && (
                  <div className="floating-chat-empty compact">
                    <strong>No matching chats</strong>
                    <span>Try a different name or order ID.</span>
                  </div>
                )}

                {filtered.map((conv) => (
                  <button
                    key={conv.id}
                    className={`floating-thread ${conv.id === activeId ? "active" : ""}`}
                    onClick={() => openChatbox(conv.id)}
                    type="button"
                  >
                    <div className="floating-thread-avatar">
                      {conv.name[0]}

                      <span className={conv.mode === "ai" ? "thread-dot ai" : "thread-dot human"}>
                        {conv.mode === "ai" ? <MdSmartToy size={8} /> : <MdPerson size={8} />}
                      </span>
                    </div>

                    <div className="floating-thread-info">
                      <div className="floating-thread-top">
                        <strong>{conv.name}</strong>
                        <span>{conv.time}</span>
                      </div>

                      <p>{conv.lastMsg}</p>
                    </div>

                    {conv.unread > 0 && (
                      <span className="floating-thread-badge">{conv.unread}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {openChatIds
        .map((chatId) => conversations.find((conv) => conv.id === chatId))
        .filter(Boolean)
        .map((conv, index) => (
          <section
            key={conv.id}
            className={`floating-chat-room ${floatingOpen ? "logs-open" : "logs-closed"}`}
            style={{ "--chat-index": index }}
          >
            <div className="floating-room-top">
              <div className="floating-room-left">
                <div className="floating-room-avatar">{conv.name[0]}</div>

                <div>
                  <strong>{conv.name}</strong>
                  <span>{conv.mode === "ai" ? "AI Mode" : "Human Mode"}</span>
                </div>
              </div>

              <button onClick={() => closeChatbox(conv.id)} type="button">
                <MdClose size={18} />
              </button>
            </div>

            <div className="floating-room-messages">
              {conv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`floating-msg-wrap ${msg.from === "customer" ? "left" : "right"}`}
                >
                  <div className={`floating-msg floating-msg--${msg.from}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="floating-room-input">
              <input
                placeholder="Type a message..."
                value={inputs[conv.id] || ""}
                onChange={(e) => handleInputChange(conv.id, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend(conv.id)}
              />

              <button onClick={() => handleSend(conv.id)} type="button">
                <MdSend size={17} />
              </button>
            </div>
          </section>
        ))}
    </>
  );
}
