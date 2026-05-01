import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MdArrowBack, MdKeyboardArrowDown, MdOutlineImage } from "react-icons/md";
import "./CustomersForm.css";

const initialVerification = {
  idType: "National ID",
  idNumber: "1234-5678-9101-1213",
  name: "Juan Dela Cruz",
  status: "Unverified",
};

export default function CustomersVerify() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(initialVerification);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleVerify = (event) => {
    event.preventDefault();
    console.log("Customer verification:", { id, ...form });
    navigate("/customers/manage");
  };

  return (
    <div className="customer-form-page">
      <button className="customer-form-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="customer-form-header">
        <h1>Customer</h1>
        <p>
          Dashboard <span>›</span> Customers <span>›</span> Manage Customer <span>›</span>{" "}
          <strong>Verify Customer</strong>
        </p>
      </div>

      <form className="customer-verify-card" onSubmit={handleVerify}>
        <h2>Customer Verification</h2>
        <p className="customer-proof-label">Proof of legitimacy</p>

        <div className="customer-proof-grid">
          <div className="customer-proof-uploaded">ID</div>
          <div className="customer-proof-box">
            <MdOutlineImage size={24} />
            <span>Photo 2</span>
          </div>
        </div>

        <div className="customer-form-row">
          <label className="customer-field">
            <span>ID Type</span>
            <input value={form.idType} onChange={(e) => updateField("idType", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>ID Number</span>
            <input value={form.idNumber} onChange={(e) => updateField("idNumber", e.target.value)} />
          </label>
        </div>

        <label className="customer-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
        </label>

        <label className="customer-field customer-select">
          <span>Status</span>
          <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
            <option value="Unverified">Unverified</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
          <MdKeyboardArrowDown size={20} />
        </label>

        <div className="customer-form-actions">
          <button className="customer-reject-btn" type="button">
            Reject Verification
          </button>
          <button className="customer-save-btn" type="submit">
            Verify
          </button>
        </div>
      </form>
    </div>
  );
}
