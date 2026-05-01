import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdChat,
  MdLogout,
  MdNotifications,
  MdSearch,
  MdSettings,
} from "react-icons/md";
import { apiGet } from "../api.js";
import { useChatContext } from "../context/ChatContext.jsx";
import { clearStoredAdminSession, getAdminDisplayName, getAdminInitial, getAdminPhotoUrl, getAdminRole, getStoredAdminUser } from "../session.js";
import "./Topbar.css";

export default function Topbar() {
  const navigate = useNavigate();
  const topbarActionsRef = useRef(null);
  const { conversations, floatingOpen, setFloatingOpen } = useChatContext();
  const [adminUser, setAdminUser] = useState(getStoredAdminUser());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifiedUnread, setNotifiedUnread] = useState(0);

  const unreadTotal = conversations.reduce((total, conv) => total + conv.unread, 0);

  useEffect(() => {
    const syncAdminUser = () => setAdminUser(getStoredAdminUser());

    window.addEventListener("swag_admin_user_updated", syncAdminUser);
    window.addEventListener("storage", syncAdminUser);
    return () => {
      window.removeEventListener("swag_admin_user_updated", syncAdminUser);
      window.removeEventListener("storage", syncAdminUser);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    apiGet("/admin/notifications")
      .then((items) => {
        if (isMounted) setNotifications(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (isMounted) setNotifications([]);
      });

    return () => {
      isMounted = false;
    };
  }, [unreadTotal]);

  useEffect(() => {
    if (
      unreadTotal > notifiedUnread &&
      document.hidden &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      const latestUnread = conversations.find((conv) => conv.unread > 0);

      if (latestUnread) {
        new Notification("New SWAG chat message", {
          body: `${latestUnread.name}: ${latestUnread.lastMsg}`,
          tag: "swag-chat",
        });
      }
    }

    setNotifiedUnread(unreadTotal);
  }, [conversations, notifiedUnread, unreadTotal]);

  useEffect(() => {
    const closeMenus = (event) => {
      if (!topbarActionsRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  return (
    <div className="topbar">
      <div className="topbar-search">
        <MdSearch size={18} color="#888" />
        <input type="text" placeholder="Search product" />
      </div>

      <div className="topbar-right" ref={topbarActionsRef}>
        <button
          className={`topbar-icon-btn topbar-chat-btn ${floatingOpen ? "active" : ""}`}
          onClick={() => {
            setFloatingOpen(!floatingOpen);
            setNotificationsOpen(false);
            setProfileOpen(false);
          }}
          type="button"
        >
          <MdChat size={20} color="currentColor" />
          {unreadTotal > 0 && <span className="topbar-badge">{unreadTotal}</span>}
        </button>

        <div className="topbar-menu-wrap">
          <button
            className={`topbar-icon-btn ${notificationsOpen ? "active" : ""}`}
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setProfileOpen(false);
            }}
            type="button"
          >
            <MdNotifications size={20} color="currentColor" />
            {notifications.length > 0 && <span className="topbar-badge">{notifications.length}</span>}
          </button>

          {notificationsOpen && (
            <div className="topbar-dropdown topbar-notifications">
              <div className="topbar-dropdown-head">
                <strong>Notifications</strong>
                <span>{notifications.length} new</span>
              </div>

              <div className="topbar-notification-list">
                {notifications.length === 0 && (
                  <div className="topbar-notification-empty">No new notifications</div>
                )}

                {notifications.map((item) => (
                  <button className="topbar-notification-item" key={item.id} type="button">
                    <span className="topbar-notification-dot" />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                    <small>{item.time}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="topbar-menu-wrap">
          <button
            className={`topbar-admin ${profileOpen ? "active" : ""}`}
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotificationsOpen(false);
            }}
            type="button"
          >
            <div className="topbar-admin-avatar">
              {getAdminPhotoUrl(adminUser) ? (
                <img src={getAdminPhotoUrl(adminUser)} alt="" />
              ) : (
                getAdminInitial(adminUser)
              )}
            </div>
          </button>

          {profileOpen && (
            <div className="topbar-dropdown topbar-profile-menu">
              <div className="topbar-profile-head">
                <div className="topbar-admin-avatar">
                  {getAdminPhotoUrl(adminUser) ? (
                    <img src={getAdminPhotoUrl(adminUser)} alt="" />
                  ) : (
                    getAdminInitial(adminUser)
                  )}
                </div>
                <div>
                  <strong>{getAdminDisplayName(adminUser)}</strong>
                  <span>{getAdminRole(adminUser)}</span>
                </div>
              </div>

              <button onClick={() => navigate("/settings")} type="button">
                <MdSettings size={18} />
                Account Settings
              </button>
              <button
                className="logout"
                onClick={() => {
                  clearStoredAdminSession();
                  navigate("/login");
                }}
                type="button"
              >
                <MdLogout size={18} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
