import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  MdArrowBack,
  MdFavoriteBorder,
  MdOutlineImage,
  MdSend,
  MdThumbUpOffAlt,
} from "react-icons/md";
import "./Reviews.css";

export default function ReviewsReply() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [reply, setReply] = useState("");
  const [reviewLoved, setReviewLoved] = useState(false);
  const [replyLoved, setReplyLoved] = useState(false);

  const sendReply = () => {
    if (!reply.trim()) return;
    console.log("Review reply:", { id, reply });
    setReply("");
  };

  return (
    <div className="reviews-page">
      <button className="reviews-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="reviews-header">
        <h1 className="reviews-title">Reviews</h1>
        <p className="reviews-breadcrumb">
          Dashboard <span>›</span> Reviews <span>›</span> <strong>Reviews Reply</strong>
        </p>
      </div>

      <section className="review-reply-card">
        <h2>Order Review</h2>

        <div className="review-customer-row">
          <div className="review-avatar">Y</div>
          <strong>Yuri Santiago</strong>
          <span>AFD00017234</span>
        </div>

        <div className="review-photo-row">
          <div className="review-photo-filled">🥼</div>
          <div className="review-photo-filled">🥼</div>
          <div className="review-photo-box">
            <MdOutlineImage size={22} />
            <span>Photo 3</span>
          </div>
          <div className="review-photo-box">
            <MdOutlineImage size={22} />
            <span>Photo 4</span>
          </div>
        </div>

        <h3>Vintage Jacket • XL</h3>

        <div className="review-message">
          Absolutely love this top! The floral pattern is so unique and the fabric feels premium.
          I ordered size S and it fits perfectly — not too tight, not loose. Wore it to a garden event
          and got so many compliments.
        </div>

        <div className="review-engagement">
          <button
            className={reviewLoved ? "active" : ""}
            onClick={() => setReviewLoved((prev) => !prev)}
            type="button"
          >
            <MdFavoriteBorder size={18} /> {reviewLoved ? 12 : 11}
          </button>
          <small>15 m</small>
        </div>

        <div className="review-admin-reply">
          <div className="review-brand-avatar">A</div>
          <div>
            <strong>A'FRO DRY GOODS</strong>
            <p>
              So glad you loved it! We're happy the fit and quality were just right for you.
              Sounds like you rocked that garden event — thanks for sharing your experience!
            </p>
          </div>
        </div>

        <div className="review-engagement review-engagement-reply">
          <button
            className={replyLoved ? "active" : ""}
            onClick={() => setReplyLoved((prev) => !prev)}
            type="button"
          >
            <MdFavoriteBorder size={18} /> {replyLoved ? 4 : 3}
          </button>
          <small>11 s</small>
        </div>

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
    </div>
  );
}
