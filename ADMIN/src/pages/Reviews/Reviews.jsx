import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, formatDate } from "../../api.js";
import {
  MdChevronLeft,
  MdChevronRight,
  MdDelete,
  MdFileDownload,
  MdFilterList,
  MdModeComment,
  MdSearch,
  MdUnfoldMore,
  MdVisibility,
} from "react-icons/md";
import "./Reviews.css";

export default function Reviews() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/admin/reviews")
      .then(setReviews)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = reviews.filter((review) =>
    `${review.customer} ${review.orderNumber} ${review.product}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelected(selected.length === filtered.length ? [] : filtered.map((review) => review.id));
  };

  return (
    <div className="reviews-page">
      <div className="reviews-header">
        <h1 className="reviews-title">Reviews</h1>
        <p className="reviews-breadcrumb">
          Dashboard <span>›</span> <strong>Reviews</strong>
        </p>
      </div>

      <div className="reviews-table-wrap">
        <div className="reviews-toolbar">
          <div className="reviews-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for Order Number, name Customer"
            />
            <MdSearch size={16} color="#666" />
          </div>

          <div className="reviews-actions">
            <button className="reviews-btn-outline" type="button">
              Filter <MdFilterList size={15} />
            </button>
            <button className="reviews-btn-outline" type="button">
              Export <MdFileDownload size={15} />
            </button>
          </div>
        </div>

        {isLoading && <p className="table-state">Loading reviews...</p>}
        {error && <p className="table-state table-state--error">{error}</p>}

        {!isLoading && !error && <table className="reviews-table">
          <thead>
            <tr>
              <th>
                <input
                  checked={selected.length === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              <th>Name Customer <MdUnfoldMore size={13} /></th>
              <th>Order Number <MdUnfoldMore size={13} /></th>
              <th>Rating <MdUnfoldMore size={13} /></th>
              <th>Date Reviewed <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((review) => (
              <tr key={review.id} className={selected.includes(review.id) ? "row-selected" : ""}>
                <td>
                  <input
                    checked={selected.includes(review.id)}
                    onChange={() => toggleSelect(review.id)}
                    type="checkbox"
                  />
                </td>
                <td>{review.customer}</td>
                <td>{review.orderNumber.slice(0, 8)}</td>
                <td>{review.rating}</td>
                <td>{formatDate(review.date, { hour: "numeric", minute: "2-digit" })}</td>
                <td>
                  <div className="reviews-action-btns">
                    <button
                      className="reviews-action-btn"
                      onClick={() => navigate(`/reviews/reply/${review.id}`)}
                      title="View"
                      type="button"
                    >
                      <MdVisibility size={17} />
                    </button>
                    <button
                      className="reviews-action-btn"
                      onClick={() => navigate(`/reviews/reply/${review.id}`)}
                      title="Reply"
                      type="button"
                    >
                      <MdModeComment size={17} />
                    </button>
                    <button className="reviews-action-btn" title="Delete" type="button">
                      <MdDelete size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-row">No reviews found.</td>
              </tr>
            )}
          </tbody>
        </table>}

        <div className="reviews-pagination">
          <span><strong>{filtered.length ? 1 : 0}</strong> - {filtered.length} of 1 Page</span>
          <div className="reviews-page-controls">
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
