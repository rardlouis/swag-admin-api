import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdDelete,
  MdEdit,
  MdFileDownload,
  MdFilterList,
  MdSearch,
  MdUnfoldMore,
  MdVisibility,
} from "react-icons/md";
import { apiDelete, apiGet } from "../../api.js";
import "./Suppliers.css";

export default function Suppliers() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSuppliers = () => {
    setLoading(true);
    setError("");

    apiGet("/admin/suppliers")
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || "Unable to load suppliers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filtered = suppliers.filter((supplier) => {
    const matchesSearch = `${supplier.id} ${supplier.name} ${supplier.email} ${supplier.store} ${supplier.address}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || supplier.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelected(selected.length === filtered.length ? [] : filtered.map((supplier) => supplier.id));
  };

  const deleteSupplier = async (supplier) => {
    const confirmed = window.confirm(`Delete supplier ${supplier.name}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await apiDelete(`/admin/suppliers/${supplier.id}`);
      setSuppliers((prev) => prev.filter((item) => item.id !== supplier.id));
      setSelected((prev) => prev.filter((id) => id !== supplier.id));
    } catch (err) {
      setError(err.message || "Unable to delete supplier");
    }
  };

  const exportSuppliers = () => {
    const headers = ["ID", "Supplier Name", "Email", "Phone", "Status", "Store Name", "Address"];
    const rows = filtered.map((supplier) => [
      supplier.id,
      supplier.name,
      supplier.email,
      supplier.phone,
      supplier.status,
      supplier.store,
      supplier.address,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "swag-suppliers.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="suppliers-page">
      <div className="suppliers-header">
        <h1 className="suppliers-title">Supplier</h1>
        <p className="suppliers-breadcrumb">
          Dashboard <span>›</span> <strong>Supplier</strong>
        </p>
      </div>

      <div className="suppliers-table-wrap">
        <div className="suppliers-toolbar">
          <div className="suppliers-search">
            <MdSearch size={16} color="#aaa" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for id, name Supplier"
            />
          </div>

          <div className="suppliers-actions">
            <label className="supplier-filter">
              <MdFilterList size={16} />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
            <button className="supplier-btn-outline" onClick={exportSuppliers} type="button">
              Export <MdFileDownload size={16} />
            </button>
            <button
              className="supplier-btn-primary"
              onClick={() => navigate("/supplier/add")}
              type="button"
            >
              Add Supplier <MdAdd size={17} />
            </button>
          </div>
        </div>

        {(loading || error) && (
          <p className={error ? "suppliers-status error" : "suppliers-status"}>
            {error || "Loading suppliers..."}
          </p>
        )}

        <table className="suppliers-table">
          <thead>
            <tr>
              <th>
                <input
                  checked={selected.length === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              <th>Name Supplier <MdUnfoldMore size={13} /></th>
              <th>Contact <MdUnfoldMore size={13} /></th>
              <th>Status <MdUnfoldMore size={13} /></th>
              <th>Store Name <MdUnfoldMore size={13} /></th>
              <th>Address <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((supplier) => (
              <tr key={supplier.id} className={selected.includes(supplier.id) ? "row-selected" : ""}>
                <td>
                  <input
                    checked={selected.includes(supplier.id)}
                    onChange={() => toggleSelect(supplier.id)}
                    type="checkbox"
                  />
                </td>
                <td>{supplier.name}</td>
                <td>
                  <p className="supplier-contact">{supplier.email}</p>
                  <p className="supplier-contact">{supplier.phone}</p>
                </td>
                <td>
                  <span className={`supplier-status ${supplier.status === "Active" ? "active" : "inactive"}`}>
                    {supplier.status}
                  </span>
                </td>
                <td>{supplier.store}</td>
                <td>{supplier.address}</td>
                <td>
                  <div className="supplier-action-btns">
                    <button
                      className="supplier-action-btn"
                      onClick={() => navigate(`/supplier/edit/${supplier.id}`)}
                      title="View"
                      type="button"
                    >
                      <MdVisibility size={17} />
                    </button>
                    <button
                      className="supplier-action-btn"
                      onClick={() => navigate(`/supplier/edit/${supplier.id}`)}
                      title="Edit"
                      type="button"
                    >
                      <MdEdit size={17} />
                    </button>
                    <button
                      className="supplier-action-btn"
                      onClick={() => deleteSupplier(supplier)}
                      title="Delete"
                      type="button"
                    >
                      <MdDelete size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td className="supplier-empty" colSpan={7}>
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="suppliers-pagination">
          <span><strong>{filtered.length}</strong> supplier{filtered.length === 1 ? "" : "s"}</span>
          <div className="suppliers-page-controls">
            <span>The page on</span>
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
              <option value={1}>1</option>
            </select>
            <button type="button"><MdChevronLeft size={18} /></button>
            <button type="button"><MdChevronRight size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
