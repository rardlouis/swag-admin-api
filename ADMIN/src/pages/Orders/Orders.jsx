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
const ORDER_STATUSES = ["Order Placed", "Payment Confirmed", "Order Confirmed", "Order Processed", "Ready to Ship", "In Transit", "Out for Delivery", "Delivered", "Cancelled"];
const SHIPPING_STATUSES = ["order placed", "order confirmed", "order processed", "ready to ship", "in transit", "out for delivery", "confirmed", "shipped", "shipping"];
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
  const [detailOrder, setDetailOrder] = useState(null);
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');

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
      const draft = trackingDrafts[orderId] ?? {};
      await apiPatch(`/admin/orders/${orderId}/status`, { status, trackingNumber: draft.trackingNumber, trackingUrl: draft.trackingUrl });
      return true;
    } catch (err) {
      setOrders(previousOrders);
      setError(err.message);
      return false;
    }
  };

  const handleStatusSelect = (orderId, status) => {
    setError("");
    if (status === "In Transit") {
      setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, status } : order)));
      return;
    }
    if (status === 'Cancelled') { setCancelOrder(orderId); setCancellationReason(''); return; }
    void handleStatusChange(orderId, status);
  };

  const confirmPayment = async (order) => {
    if (!window.confirm(`Confirm the payment for order ${order.id}?`)) return;
    setError("");
    try {
      await apiPatch(`/admin/orders/${order.id}/status`, { status: "Payment Confirmed" });
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, payment: "Confirmed", status: "Payment Confirmed" }
        : item));
      setDetailOrder((current) => current?.id === order.id
        ? { ...current, payment: "Confirmed", status: "Payment Confirmed" }
        : current);
    } catch (err) {
      setError(err.message || "Could not confirm this payment.");
    }
  };

  const confirmCancellation = async () => {
    if (!cancellationReason.trim()) { setError('Enter a cancellation reason.'); return; }
    const saved = await apiPatch(`/admin/orders/${cancelOrder}/status`, { status: 'Cancelled', cancellationReason });
    if (saved) { setOrders((current) => current.map((order) => order.id === cancelOrder ? { ...order, status: 'Cancelled' } : order)); setCancelOrder(null); }
  };

  const saveTracking = async (orderId) => {
    const order = orders.find((item) => item.id === orderId);
    const draft = trackingDrafts[orderId] ?? {};
    const trackingNumber = draft.trackingNumber ?? order?.trackingNumber ?? '';
    const trackingUrl = draft.trackingUrl ?? order?.trackingUrl ?? '';
    if (!trackingNumber.trim() || !trackingUrl.trim()) {
      setError("Enter both the tracking number and tracking link before saving.");
      return;
    }
    setTrackingDrafts((current) => ({ ...current, [orderId]: { trackingNumber, trackingUrl } }));
    const saved = await handleStatusChange(orderId, "In Transit");
    if (saved) setOrders((current) => current.map((item) => item.id === orderId ? { ...item, trackingNumber, trackingUrl, status: 'In Transit' } : item));
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

        {!isLoading && <table className="orders-table">
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
                  <div className="payment-verification">
                    <span className={`status-badge ${order.payment === "Confirmed" ? "payment-paid" : "payment-unpaid"}`}>
                      {order.payment}
                    </span>
                    {order.payment === "Pending verification" ? (
                      <button className="payment-verify-button" type="button" onClick={() => void confirmPayment(order)}>
                        Verify
                      </button>
                    ) : null}
                  </div>
                </td>
                <td>
                  <select
                    className={`status-select status-${order.status?.toLowerCase().replaceAll(" ", "-")}`}
                    value={order.status}
                    onChange={(event) => handleStatusSelect(order.id, event.target.value)}
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  {order.status === "In Transit" ? (
                    <div className="tracking-fields">
                      <input placeholder="J&T tracking ID" value={trackingDrafts[order.id]?.trackingNumber ?? order.trackingNumber ?? ""} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.id]: { ...current[order.id], trackingNumber: event.target.value } }))} />
                      <input placeholder="https://www.jtexpress.ph/..." value={trackingDrafts[order.id]?.trackingUrl ?? order.trackingUrl ?? ""} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.id]: { ...current[order.id], trackingUrl: event.target.value } }))} />
                      <button className="tracking-save-button" type="button" onClick={() => saveTracking(order.id)}>{order.trackingNumber && order.trackingUrl ? 'Edit Tracking' : 'Save Tracking'}</button>
                    </div>
                  ) : null}
                </td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn" title="View" onClick={() => setDetailOrder(order)}><MdVisibility size={17} /></button>
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
      {cancelOrder && <div className="modal-overlay" onClick={() => setCancelOrder(null)}><div className="modal" onClick={(event) => event.stopPropagation()}><h3>Cancel order</h3><p>Tell the customer why this order is being cancelled.</p><textarea className="cancellation-reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Cancellation reason" /><div className="modal-actions"><button className="btn-outline" onClick={() => setCancelOrder(null)}>Back</button><button className="btn-danger" onClick={() => void confirmCancellation()}>Cancel order</button></div></div></div>}
      {detailOrder && (
        <div className="modal-overlay" onClick={() => setDetailOrder(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Order details</h3>
            <p><strong>Customer:</strong> {detailOrder.customer}</p>
            <p><strong>Payment:</strong> {detailOrder.payment} {detailOrder.paymentReference ? `(${detailOrder.paymentReference})` : ''}</p>
            {detailOrder.payment === "Pending verification" ? <button className="tracking-save-button" type="button" onClick={() => void confirmPayment(detailOrder)}>Confirm payment</button> : null}
            <p><strong>Status:</strong> {detailOrder.status}</p>
            {detailOrder.trackingNumber ? <p><strong>Tracking:</strong> {detailOrder.trackingNumber}</p> : null}
            {detailOrder.trackingUrl ? <p><a href={detailOrder.trackingUrl} target="_blank" rel="noreferrer">Open J&T tracking</a></p> : null}
            {detailOrder.receiptUrl ? <p><a href={imageUrl(detailOrder.receiptUrl)} target="_blank" rel="noreferrer">View uploaded GCash receipt</a></p> : null}
            <div className="modal-actions"><button className="btn-outline" onClick={() => setDetailOrder(null)}>Close</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
