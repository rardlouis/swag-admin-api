import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  MdArrowBack,
  MdFavoriteBorder,
  MdOutlineImage,
  MdSend,
  MdThumbUpOffAlt,
} from "react-icons/md";
import { apiGet, apiPost, formatDate, imageUrl } from "../../api.js";
import { containsProfanity, PROFANITY_ERROR } from "../../profanity.js";
import "./Reviews.css";

const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000000";

export default function ReviewsReply() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [reply, setReply] = useState("");
  const [review, setReview] = useState(null);
  const [zoomPhoto, setZoomPhoto] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReview = () => {
    setIsLoading(true);
    setError("");
    apiGet(`/reviews/${id}`)
      .then(setReview)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadReview();
  }, [id]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    if (containsProfanity(reply)) {
      setError(PROFANITY_ERROR);
      return;
    }
    try {
      await apiPost(`/reviews/${id}/replies`, { userId: ADMIN_USER_ID, comment: reply.trim() });
      setReply("");
      loadReview();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="reviews-page">
      <button className="reviews-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="reviews-header">
        <h1 className="reviews-title">Reviews</h1>
        <p className="reviews-breadcrumb">
          Dashboard <span>›</span> Reviews <span>›</span> <strong>Review Details</strong>
        </p>
      </div>

      {isLoading && <p className="table-state">Loading review...</p>}
      {error && <p className="table-state table-state--error">{error}</p>}

      {!isLoading && review && (
        <section className="review-reply-card">
          <h2>Order Review</h2>

          <div className="review-customer-row">
            <div className="review-avatar">{review.userName?.charAt(0) || "U"}</div>
            <strong>{review.userName || "Customer"}</strong>
            <span>{review.productName}</span>
          </div>

          <div className="review-photo-row">
            {(review.photos || []).slice(0, 4).map((photo) => (
              <button
                className="review-photo-button"
                key={photo}
                onClick={() => setZoomPhoto(imageUrl(photo))}
                title="Zoom image"
                type="button"
              >
                <img className="review-photo-filled" src={imageUrl(photo)} alt="Review upload" />
              </button>
            ))}
          </div>

          <h3>{review.productName} • {review.rating} Star</h3>

          <div className="review-message">
            {review.comment || "No written comment added."}
          </div>

          <div className="review-engagement">
            <button type="button">
              <MdThumbUpOffAlt size={18} /> {review.likeCount || 0}
            </button>
            <button type="button">
              <MdFavoriteBorder size={18} /> {review.heartCount || 0}
            </button>
            <small>{formatDate(review.createdAt, { hour: "numeric", minute: "2-digit" })}</small>
          </div>

          {(review.replies || []).map((item) => (
            <div className="review-admin-reply" key={item.id}>
              <div className="review-brand-avatar">{item.userName?.charAt(0) || "A"}</div>
              <div>
                <strong>{item.userName || "A'FRO"}</strong>
                <p>{item.comment}</p>
                <small>{formatDate(item.createdAt, { hour: "numeric", minute: "2-digit" })}</small>
              </div>
            </div>
          ))}

          <div className="review-reply-input">
            <button type="button">
              <MdOutlineImage size={18} />
            </button>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder="Write a comment ..."
            />
            <button onClick={sendReply} type="button">
              <MdSend size={18} />
            </button>
          </div>
        </section>
      )}

      {zoomPhoto && (
        <div className="review-zoom-overlay" onClick={() => setZoomPhoto("")}>
          <div className="review-zoom-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="review-zoom-close" onClick={() => setZoomPhoto("")} type="button">
              Close
            </button>
            <img src={zoomPhoto} alt="Zoomed review upload" />
          </div>
        </div>
      )}
    </div>
  );
}
