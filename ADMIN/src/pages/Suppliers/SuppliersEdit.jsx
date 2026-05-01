import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MdArrowBack, MdKeyboardArrowDown } from "react-icons/md";
import { apiGet, apiPatch } from "../../api.js";
import "./SuppliersForm.css";

const initialForm = {
  supplierName: "",
  shopName: "",
  email: "",
  contactNumber: "",
  status: "Active",
  address: "",
};

export default function SuppliersEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(initialForm);
  const [originalForm, setOriginalForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiGet(`/admin/suppliers/${id}`)
      .then((supplier) => {
        setForm(supplier);
        setOriginalForm(supplier);
      })
      .catch((err) => setError(err.message || "Unable to load supplier"));
  }, [id]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const discardChanges = () => {
    setForm(originalForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await apiPatch(`/admin/suppliers/${id}`, form);
      navigate("/supplier");
    } catch (err) {
      setError(err.message || "Unable to save supplier");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="supplier-form-page">
      <button className="supplier-form-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="supplier-form-header">
        <h1>Supplier</h1>
        <p>
          Dashboard <span>›</span> Supplier <span>›</span> <strong>Edit</strong>
        </p>
      </div>

      <form className="supplier-form-card" onSubmit={handleSubmit}>
        <div className="supplier-form-card-head">
          <h2>Supplier Information</h2>
          <p>Supplier details and contact information.</p>
        </div>

        <label className="supplier-field supplier-field-full">
          <span>Supplier Name</span>
          <input
            value={form.supplierName}
            onChange={(e) => updateField("supplierName", e.target.value)}
          />
        </label>

        <label className="supplier-field supplier-field-full">
          <span>Shop Name</span>
          <input
            value={form.shopName}
            onChange={(e) => updateField("shopName", e.target.value)}
          />
        </label>

        <div className="supplier-form-row">
          <label className="supplier-field">
            <span>Email</span>
            <input value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          </label>

          <label className="supplier-field">
            <span>Contact Number</span>
            <input
              value={form.contactNumber}
              onChange={(e) => updateField("contactNumber", e.target.value)}
            />
          </label>
        </div>

        <label className="supplier-field supplier-field-full supplier-select">
          <span>Status</span>
          <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <MdKeyboardArrowDown size={20} />
        </label>

        <label className="supplier-field supplier-field-full">
          <span>Address</span>
          <input value={form.address} onChange={(e) => updateField("address", e.target.value)} />
        </label>

        <div className="supplier-form-actions supplier-form-actions-edit">
          {error && <p className="supplier-form-error">{error}</p>}
          <button className="supplier-discard-btn" onClick={discardChanges} type="button">
            Discard Changes
          </button>
          <button className="supplier-submit-btn" disabled={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
