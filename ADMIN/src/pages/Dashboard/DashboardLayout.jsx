import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import FloatingChat from "../../components/FloatingChat";
import { ChatProvider } from "../../context/ChatContext.jsx";
import "./DashboardLayout.css";
 
export default function DashboardLayout() {
  return (
    <ChatProvider>
      <div className="layout">
        <Sidebar />
        <div className="layout-main">
          <Topbar />
          <div className="layout-content">
            <Outlet />
          </div>
        </div>

        <FloatingChat />
      </div>
    </ChatProvider>
  );
}
