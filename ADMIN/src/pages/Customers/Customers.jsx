import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../api.js";
import {
  MdSearch,
  MdFilterList,
  MdFileDownload,
  MdEdit,
  MdArrowOutward,
  MdVisibility,
  MdDelete,
  MdChevronLeft,
  MdChevronRight,
  MdUnfoldMore,
} from "react-icons/md";
import "./Customers.css";

const PAGE_SIZE_OPTIONS = [10, 20, 30];

export default function Customer() {
  const navigate = useNavigate();
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState([]);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(10);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [customers, setCustomers]   = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    apiGet("/admin/customers")
      .then(setCustomers)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleRow = (i) =>
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

  const toggleAll = () =>
    setSelected(selected.length === paginated.length ? [] : paginated.map((_, i) => i));

  const handleDelete = () => {
    if (deleteTarget === null) return;
    const globalIdx = (page - 1) * pageSize + deleteTarget;
    setCustomers((prev) => prev.filter((_, i) => i !== globalIdx));
    setDeleteTarget(null);
    setSelected([]);
  };

  return (
    <div className="customers-page">
      {/* Header */}
      <div className="customers-header">
        <h1 className="customers-title">Customer</h1>
        <p className="customers-breadcrumb">
          Dashboard <span>▶</span> <strong>Customer</strong>
        </p>
      </div>

      {/* Toolbar */}
      <div className="customers-toolbar">
        <div className="customers-search">
          <MdSearch size={16} color="#aaa" />
          <input
            placeholder="Search for id, name Customer"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="customers-actions">
          <button className="btn-outline"><MdFilterList size={15} /> Filter</button>
          <button className="btn-outline"><MdFileDownload size={15} /> Export</button>
          <button className="btn-primary" onClick={() => navigate("/customers/manage")}>
            <MdEdit size={15} /> Manage Customer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="customers-table-wrap">
        {isLoading && <p className="table-state">Loading customers...</p>}
        {error && <p className="table-state table-state--error">{error}</p>}

        {!isLoading && !error && <table className="customers-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.length === paginated.length && paginated.length > 0} onChange={toggleAll} /></th>
              <th>Name Customer <MdUnfoldMore size={13} /></th>
              <th>Contact <MdUnfoldMore size={13} /></th>
              <th>Status <MdUnfoldMore size={13} /></th>
              <th>Order QTY <MdUnfoldMore size={13} /></th>
              <th>Address <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((c, i) => (
              <tr key={i} className={selected.includes(i) ? "row-selected" : ""}>
                <td><input type="checkbox" checked={selected.includes(i)} onChange={() => toggleRow(i)} /></td>
                <td>
                  <div className="customer-cell">
                    <div className="customer-avatar">{c.name[0]}</div>
                    <div>
                      <p className="customer-id">ID {c.id.slice(0, 8)}</p>
                      <p className="customer-name">{c.name}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <p className="contact-email">{c.email}</p>
                  <p className="contact-phone">{c.phone}</p>
                </td>
                <td>
                  <span className={`status-badge ${c.status === "Verified" ? "status-verified" : "status-unverified"}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.orders} Order{c.orders !== 1 ? "s" : ""}</td>
                <td className="address-cell">{c.address}</td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn" title="View"><MdVisibility size={15} /></button>
                    <button
                      className="action-btn"
                      title="Edit"
                    onClick={() => navigate(`/customers/edit/${c.id}`)}
                    >
                      <MdEdit size={15} />
                    </button>
                    <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteTarget(i)}><MdDelete size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-row">No customers found.</td>
              </tr>
            )}
          </tbody>
        </table>}

        {/* Pagination */}
        <div className="customers-pagination">
          <span>{(page - 1) * pageSize + 1} – {Math.min(page * pageSize, filtered.length)} of {Math.ceil(filtered.length / pageSize)} Pages</span>
          <div className="pagination-controls">
            <span className="pagination-label">The page on</span>
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
            <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><MdChevronLeft size={16} /></button>
            <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}><MdChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteTarget !== null && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Customer</h3>
            <p>Are you sure you want to delete <strong>{paginated[deleteTarget]?.name}</strong>? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
