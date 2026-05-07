import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, formatDate, formatPeso } from "../../api.js";
import {
  MdSearch, MdFilterList, MdFileDownload, MdAdd,
  MdVisibility, MdEdit, MdDelete, MdUnfoldMore,
  MdChevronLeft, MdChevronRight,
} from "react-icons/md";
import "./Products.css";

const PAGE_SIZE = 10;

const COLOR_MAP = {
  pink: "#ffb6c1", blue: "#4a90d9", black: "#333", white: "#ddd",
  red: "#e53935", navy: "#1a237e", gray: "#9e9e9e", green: "#43a047",
};

export default function Products() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathTab = location.pathname.split("/").pop();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [deleteId, setDeleteId] = useState(null);
  const [stockId, setStockId] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    Promise.all([apiGet("/products"), apiGet("/products/meta/lookups")])
      .then(([productData, lookupData]) => {
        if (!isMounted) return;
        setProducts(productData.filter((product) => !product.isDeleted));
        setCategories(lookupData.categories ?? []);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const tabs = useMemo(() => [
    { label: "All", slug: "all" },
    ...categories.map((category) => ({
      label: category.name,
      slug: category.slug,
    })),
  ], [categories]);

  const activeTab = tabs.find((tab) => tab.slug === pathTab) ?? tabs[0];

  const tabCounts = useMemo(() => {
    const counts = { all: products.length };

    categories.forEach((category) => {
      counts[category.slug] = products.filter((product) => product.categorySlug === category.slug).length;
    });

    return counts;
  }, [categories, products]);

  const filtered = products.filter(p => {
    const matchesSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.id?.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab.slug === "all" || p.categorySlug === activeTab.slug;

    return matchesSearch && matchesTab;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const toggleAll = () =>
    setSelected(selected.length === paginated.length ? [] : paginated.map(p => p.id));

  const handleDelete = async () => {
    await apiDelete(`/products/${deleteId}`);
    setProducts((current) => current.filter((product) => product.id !== deleteId));
    setDeleteId(null);
  };

  const markOutOfStock = async (product) => {
    const fullProduct = await apiGet(`/products/${product.id}`);
    const payload = {
      name: fullProduct.name,
      description: fullProduct.description ?? null,
      brand: fullProduct.brand ?? null,
      categoryId: fullProduct.categoryId,
      genderId: fullProduct.genderId ?? null,
      sizeId: fullProduct.sizeId ?? null,
      garmentTypeId: fullProduct.garmentTypeId ?? null,
      measurements: fullProduct.measurements ?? [],
      colorId: fullProduct.colorId ?? null,
      colorName: fullProduct.colorName ?? null,
      colorHex: fullProduct.colorHex ?? null,
      price: Number(fullProduct.price),
      quantity: 0,
      imageUrls: fullProduct.images?.map((image) => image.imageUrl) ?? [],
      isActive: fullProduct.isActive,
    };

    await apiPatch(`/products/${product.id}`, payload);
    setProducts((current) => current.map((item) => (
      item.id === product.id ? { ...item, qty: 0 } : item
    )));
    setStockId(null);
  };

  const handleTabClick = (tab) => {
    navigate(`/products/${tab.slug}`);
    setPage(1);
  };

  return (
    <div className="products-page">

      {/* Header — outside the card */}
      <div className="products-header">
        <h1 className="products-title">Product</h1>
        <p className="products-breadcrumb">
          Dashboard <span>›</span> Product <span>›</span>{" "}
          <strong>{activeTab.label}</strong>
        </p>
      </div>

      {/* ── ONE white card ── */}
      <div className="products-table-wrap">

        {/* Toolbar */}
        <div className="products-toolbar">
          <div className="products-search">
            <MdSearch size={16} color="#aaa" />
            <input
              type="text"
              placeholder="Search for id, name product"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="products-actions">
            <button className="btn-outline"><MdFilterList size={16} /> Filter</button>
            <button className="btn-outline"><MdFileDownload size={16} /> Export</button>
            <button className="btn-primary" onClick={() => navigate("/products/add")}>
              <MdAdd size={16} /> New Product
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="products-tabs">
          {tabs.map(tab => (
            <button
              key={tab.slug}
              className={`products-tab ${activeTab.slug === tab.slug ? "active" : ""}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab.label} ({tabCounts[tab.slug] ?? 0})
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading && <p className="table-state">Loading products...</p>}
        {error && <p className="table-state table-state--error">{error}</p>}

        {!isLoading && !error && <table className="products-table">
          <thead>
            <tr>
              <th><input type="checkbox" onChange={toggleAll} checked={selected.length === paginated.length && paginated.length > 0} /></th>
              <th>Product <MdUnfoldMore size={13} /></th>
              <th>Color <MdUnfoldMore size={13} /></th>
              <th>Price <MdUnfoldMore size={13} /></th>
              <th>Size <MdUnfoldMore size={13} /></th>
              <th>QTY <MdUnfoldMore size={13} /></th>
              <th>Date <MdUnfoldMore size={13} /></th>
              <th>Status <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((product) => {
              const status = product.isActive && product.qty > 0 ? "Available" : "Out of Stock";

              return (
              <tr key={product.id} className={selected.includes(product.id) ? "row-selected" : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(product.id)}
                    onChange={() => toggleSelect(product.id)}
                  />
                </td>
                <td>
                  <div className="product-cell">
                    <div className="product-thumb">
                      {product.imageUrl ? <img src={product.imageUrl} alt="" /> : "SW"}
                    </div>
                    <div>
                      <p className="product-id">{product.id}</p>
                      <p className="product-name">{product.name}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="color-cell">
                    <span className="color-dot" style={{ background: product.colorHex || COLOR_MAP[product.color?.toLowerCase()] || "#ccc" }} />
                    {product.colorName || product.color || "-"}
                    {product.colorName && product.color ? <small>{product.color}</small> : null}
                  </div>
                </td>
                <td>{formatPeso(product.price)}</td>
                <td>{product.size || "-"}</td>
                <td>{product.qty}</td>
                <td className="date-cell">{formatDate(product.createdAt, { hour: "numeric", minute: "2-digit" })}</td>
                <td>
                  <span className={`status-badge ${status === "Available" ? "status-available" : "status-out"}`}>
                    {status}
                  </span>
                </td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn" title="View"><MdVisibility size={17} /></button>
                    <button
                      className="action-btn"
                      title="Edit"
                      onClick={() => navigate(`/products/edit/${product.id}`)}
                    >
                      <MdEdit size={17} />
                    </button>
                    <button
                      className="action-btn action-btn--stock"
                      title="Mark Out of Stock"
                      onClick={() => setStockId(product.id)}
                      disabled={product.qty <= 0}
                    >
                      0
                    </button>
                    <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteId(product.id)}><MdDelete size={17} /></button>
                  </div>
                </td>
              </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan="9" className="empty-row">No products found.</td>
              </tr>
            )}
          </tbody>
        </table>}

        {/* Pagination */}
        <div className="products-pagination">
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
      {/* ── end white card ── */}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Product?</h3>
            <p>Are you sure you want to delete <strong>"{products.find((product) => product.id === deleteId)?.name ?? "this product"}"</strong>?</p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {stockId && (
        <div className="modal-overlay" onClick={() => setStockId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Mark Out of Stock?</h3>
            <p>This will set <strong>"{products.find((product) => product.id === stockId)?.name ?? "this product"}"</strong> quantity to 0.</p>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setStockId(null)}>Cancel</button>
              <button
                className="btn-danger"
                onClick={() => {
                  const product = products.find((item) => item.id === stockId);
                  if (product) markOutOfStock(product).catch((err) => setError(err.message));
                }}
              >
                Out of Stock
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
