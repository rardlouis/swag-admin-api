import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPatch, formatDate, formatPeso, imageUrl } from "../../api.js";
import {
  MdSearch, MdFilterList, MdFileDownload,
  MdVisibility, MdEdit, MdDelete, MdUnfoldMore,
  MdChevronLeft, MdChevronRight,
} from "react-icons/md";
import "./Orders.css";

const TABS = ["All Orders", "Shipping", "Completed", "Cancel"];
const ORDER_STATUSES = ["Order Placed", "Order Confirmed", "Order Processed", "Ready to Ship", "Delivered", "Cancelled"];
const SHIPPING_STATUSES = ["order placed", "order confirmed", "order processed", "ready to ship", "confirmed", "shipped", "shipping"];
const PAGE_SIZE = 10;

export default function Orders() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathTab = location.pathname.split("/").pop();
  const activeTab = TABS.find(t => t.toLowerCase().replace(" ", "-") === pathTab) || "All Orders";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [deleteId, setDeleteId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrderItems, setSelectedOrderItems] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/admin/orders")
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const tabCounts = useMemo(() => ({
    "All Orders": orders.length,
    Shipping: orders.filter((o) => SHIPPING_STATUSES.includes(o.status?.toLowerCase())).length,
    Completed: orders.filter((o) => ["delivered", "completed"].includes(o.status?.toLowerCase())).length,
    Cancel: orders.filter((o) => ["cancelled", "cancel"].includes(o.status?.toLowerCase())).length,
  }), [orders]);

  const filtered = orders.filter(o => {
    const normalizedStatus = o.status?.toLowerCase();
    const matchesTab =
      activeTab === "All Orders" ||
      (activeTab === "Shipping" && SHIPPING_STATUSES.includes(normalizedStatus)) ||
      (activeTab === "Completed" && ["delivered", "completed"].includes(normalizedStatus)) ||
      (activeTab === "Cancel" && ["cancelled", "cancel"].includes(normalizedStatus));

    return matchesTab && (
      o.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.id?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const toggleAll = () =>
    setSelected(selected.length === paginated.length ? [] : paginated.map(o => o.id));

  const handleTabClick = (tab) => {
    navigate(`/orders/${tab.toLowerCase().replace(" ", "-")}`);
    setPage(1);
  };

  const handleStatusChange = async (orderId, status) => {
    const previousOrders = orders;
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status } : order)));

    try {
      await apiPatch(`/admin/orders/${orderId}/status`, { status });
    } catch (err) {
      setOrders(previousOrders);
      setError(err.message);
    }
  };

  const handleOrderItemSelect = (orderId, orderItemId) => {
    setSelectedOrderItems((current) => ({ ...current, [orderId]: orderItemId }));
  };

  return (
    <div className="orders-page">

      {/* Header */}
      <div className="orders-header">
        <h1 className="orders-title">Orders</h1>
        <p className="orders-breadcrumb">
          Dashboard <span>›</span> Orders <span>›</span>{" "}
          <strong>{activeTab}</strong>
        </p>
      </div>

      {/* White Card */}
      <div className="orders-table-wrap">

        {/* Toolbar */}
        <div className="orders-toolbar">
          <div className="orders-search">
            <MdSearch size={16} color="#aaa" />
            <input
              type="text"
              placeholder="Search for id, name order"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="orders-actions">
            <button className="btn-outline"><MdFilterList size={16} /> Filter</button>
            <button className="btn-outline"><MdFileDownload size={16} /> Export</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="orders-tabs">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`orders-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab} ({tabCounts[tab]})
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading && <p className="table-state">Loading orders...</p>}
        {error && <p className="table-state table-state--error">{error}</p>}

        {!isLoading && !error && <table className="orders-table">
          <thead>
            <tr>
              <th><input type="checkbox" onChange={toggleAll} checked={selected.length === paginated.length && paginated.length > 0} /></th>
              <th>Orders <MdUnfoldMore size={13} /></th>
              <th>Customer <MdUnfoldMore size={13} /></th>
              <th>Price <MdUnfoldMore size={13} /></th>
              <th>Date <MdUnfoldMore size={13} /></th>
              <th>Payment <MdUnfoldMore size={13} /></th>
              <th>Status <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((order) => {
              const selectedItem =
                order.items?.find((item) => item.orderItemId === selectedOrderItems[order.id]) ||
                order.items?.[0];
              const displayName = selectedItem?.name ?? order.name;
              const displayColor = selectedItem?.color ?? order.color;
              const displayImage = selectedItem?.imageUrl ?? order.imageUrl;

              return (
              <tr key={order.id} className={selected.includes(order.id) ? "row-selected" : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(order.id)}
                    onChange={() => toggleSelect(order.id)}
                  />
                </td>
                <td>
                  <div className="orders-cell">
                    <div className="orders-thumb">{displayImage ? <img src={imageUrl(displayImage)} alt="" /> : "SW"}</div>
                    <div>
                      <p className="orders-id">{order.id}</p>
                      <p className="orders-name">{displayName} ({displayColor})</p>
                      {order.items?.length > 1 && (
                        <select
                          className="order-item-select"
                          value={selectedItem?.orderItemId ?? ""}
                          onChange={(event) => handleOrderItemSelect(order.id, event.target.value)}
                        >
                          {order.items.map((item) => (
                            <option key={item.orderItemId} value={item.orderItemId}>
                              {item.name} - {item.size} - Qty {item.quantity}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </td>
                <td>{order.customer}</td>
                <td>{formatPeso(order.price)}</td>
                <td className="date-cell">{formatDate(order.date)}</td>
                <td>
                  <span className={`status-badge ${order.payment === "Paid" ? "payment-paid" : "payment-unpaid"}`}>
                    {order.payment}
                  </span>
                </td>
                <td>
                  <select
                    className={`status-select status-${order.status?.toLowerCase().replaceAll(" ", "-")}`}
                    value={order.status}
                    onChange={(event) => handleStatusChange(order.id, event.target.value)}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn" title="View"><MdVisibility size={17} /></button>
                    <button className="action-btn" title="Edit"><MdEdit size={17} /></button>
                    <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteId(order.id)}><MdDelete size={17} /></button>
                  </div>
                </td>
              </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan="8" className="empty-row">No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>}

        {/* Pagination */}
        <div className="orders-pagination">
          <span className="pagination-info">
            {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} Pages
          </span>
          <div className="pagination-controls">
            <span className="pagination-label">The page on</span>
            <select value={page} onChange={e => setPage(Number(e.target.value))}>
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
            <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <MdChevronLeft size={18} />
            </button>
            <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <MdChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>

      {/* Delete Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Order?</h3>
            <p>Are you sure you want to delete <strong>{deleteId}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => setDeleteId(null)}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
