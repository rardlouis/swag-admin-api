import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login/Login";
import DashboardLayout from "./pages/Dashboard/DashboardLayout";
import Dashboard from "./pages/Dashboard/Dashboard";
import Products from "./pages/Products/Products";
import Orders from "./pages/Orders/Orders";
import Customers from "./pages/Customers/Customers";
import CustomersEdit from "./pages/Customers/CustomersEdit";
import CustomersManage from "./pages/Customers/CustomersManage";
import CustomersVerify from "./pages/Customers/CustomersVerify";
import Chats from "./pages/Chats/Chats";
import ProductsAdd from "./pages/Products/ProductsAdd";
import ProductsEdit from "./pages/Products/ProductsEdit";
import Suppliers from "./pages/Suppliers/Suppliers";
import SuppliersAdd from "./pages/Suppliers/SuppliersAdd";
import SuppliersEdit from "./pages/Suppliers/SuppliersEdit";
import Reviews from "./pages/Reviews/Reviews";
import ReviewsReply from "./pages/Reviews/ReviewsReply";
import SalesReport from "./pages/SalesReport/SalesReport";
import Settings from "./pages/Settings/Settings";
import Help from "./pages/Help/Help";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Navigate to="/products/all" replace />} />
          <Route path="/products/add" element={<ProductsAdd />} />
          <Route path="/products/edit/:id" element={<ProductsEdit />} />
          <Route path="/products/:tab" element={<Products />} />
          <Route path="/orders" element={<Navigate to="/orders/all-orders" replace />} />
          <Route path="/orders/:tab" element={<Orders />} />
          <Route path="/salesreport" element={<SalesReport />} />
          <Route path="/chats" element={<Navigate to="/chats/all-chats" replace />} />
          <Route path="/chats/:tab" element={<Chats />} />
          <Route path="/customers" element={<Navigate to="/customers/all-customers" replace />} />
          <Route path="/customers/manage" element={<CustomersManage />} />
          <Route path="/customers/edit/:id" element={<CustomersEdit />} />
          <Route path="/customers/verify/:id" element={<CustomersVerify />} />
          <Route path="/customers/:tab" element={<Customers />} />
          <Route path="/supplier" element={<Suppliers />} />
          <Route path="/supplier/add" element={<SuppliersAdd />} />
          <Route path="/supplier/edit/:id" element={<SuppliersEdit />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/reply/:id" element={<ReviewsReply />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;
 
