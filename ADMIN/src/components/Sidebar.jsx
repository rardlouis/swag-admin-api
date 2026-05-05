import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiGet } from "../api.js";
import { getAdminDisplayName, getAdminInitial, getAdminPhotoUrl, getAdminRole, getStoredAdminUser } from "../session.js";
import {
  MdDashboard, MdInventory, MdShoppingCart, MdChat, MdPeople,
  MdStar, MdLocalShipping, MdSettings, MdBarChart, MdHelp,
  MdExpandMore, MdExpandLess,
} from "react-icons/md";
import "./Sidebar.css";

const baseNavItems = [
  { label: "Dashboard", icon: <MdDashboard />, path: "/dashboard" },
  { label: "Orders",       icon: <MdShoppingCart />,   path: "/orders" },
  { label: "Sales Report", icon: <MdBarChart />,        path: "/salesreport" },
  { label: "Chats",        icon: <MdChat />,            path: "/chats" },
  { label: "Customers",    icon: <MdPeople />,          path: "/customers" },
  { label: "Reviews",      icon: <MdStar />,            path: "/reviews" },
  { label: "Supplier",     icon: <MdLocalShipping />,   path: "/supplier" },
];

const toolItems = [
  { label: "Account & Settings", icon: <MdSettings />, path: "/settings" },
  { label: "Help",               icon: <MdHelp />,     path: "/help" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminUser, setAdminUser] = useState(getStoredAdminUser());
  const [productOpen, setProductOpen] = useState(false);
  const [productSubItems, setProductSubItems] = useState([
    { label: "All", path: "/products/all" },
  ]);

  useEffect(() => {
    apiGet("/products/meta/lookups")
      .then((lookups) => {
        const categoryItems = (lookups.categories ?? []).map((category) => ({
          label: category.name,
          path: `/products/${category.slug}`,
        }));

        setProductSubItems([{ label: "All", path: "/products/all" }, ...categoryItems]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const syncAdminUser = () => setAdminUser(getStoredAdminUser());

    window.addEventListener("swag_admin_user_updated", syncAdminUser);
    window.addEventListener("storage", syncAdminUser);
    return () => {
      window.removeEventListener("swag_admin_user_updated", syncAdminUser);
      window.removeEventListener("storage", syncAdminUser);
    };
  }, []);

  const navItems = [
    baseNavItems[0],
    {
      label: "Product",
      icon: <MdInventory />,
      path: "/products",
      subItems: productSubItems,
    },
    ...baseNavItems.slice(1),
  ];

  // ← checks if current path starts with the item's path
  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img src="/afro-logo.png" alt="A'FRO logo" />
        </div>
        <span>A'FRO DRY GOODS</span>
      </div>

      {/* General Nav */}
      <p className="sidebar-section-label">GENERAL</p>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <div key={item.label}>
            <div
              className={`sidebar-item ${isActive(item.path) ? "active" : ""}`}
              onClick={() => {
                if (item.subItems) {
                  setProductOpen(!productOpen);
                  navigate(item.path); // ← also navigate to /products
                } else {
                  navigate(item.path);
                }
              }}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
              {item.subItems && (
                <span className="sidebar-arrow">
                  {productOpen ? <MdExpandLess /> : <MdExpandMore />}
                </span>
              )}
            </div>

            {/* Sub Items */}
            {item.subItems && productOpen && (
              <div className="sidebar-subitems">
                {item.subItems.map((sub) => (
                  <div
                    key={sub.label}
                    className={`sidebar-subitem ${location.pathname === sub.path ? "active" : ""}`}
                    onClick={() => navigate(sub.path)}
                  >
                    {sub.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Tools */}
      <p className="sidebar-section-label">TOOLS</p>
      <nav className="sidebar-nav">
        {toolItems.map((item) => (
          <div
            key={item.label}
            className={`sidebar-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {getAdminPhotoUrl(adminUser) ? (
            <img src={getAdminPhotoUrl(adminUser)} alt="" />
          ) : (
            getAdminInitial(adminUser)
          )}
        </div>
        <div className="sidebar-user-info">
          <p className="sidebar-user-name">{getAdminDisplayName(adminUser)}</p>
          <p className="sidebar-user-role">{getAdminRole(adminUser)}</p>
        </div>
      </div>
    </div>
  );
}
