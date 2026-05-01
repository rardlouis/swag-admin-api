import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MdArrowBack } from "react-icons/md";
import "./CustomersForm.css";

const initialCustomer = {
  customerId: "00000321",
  name: "Yuri Andrei Santiago",
  email: "yuriandrei@workmail.com",
  mobile: "098765413213",
  houseNumber: "719",
  street: "Acasia lane, Columbia",
  barangay: "Taguig City",
  province: "Metro Manila",
  zipCode: "1630",
  landmark: "Kapares Romnick , City Hall",
  status: "Verified",
};

export default function CustomersEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(initialCustomer);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const discardChanges = () => {
    setForm(initialCustomer);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log("Edited customer:", { id, ...form });
    navigate("/customers/all-customers");
  };

  return (
    <div className="customer-form-page">
      <button className="customer-form-back" onClick={() => navigate(-1)} type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="customer-form-header">
        <h1>Customer</h1>
        <p>
          Dashboard <span>›</span> Customers <span>›</span> <strong>Edit</strong>
        </p>
      </div>

      <form className="customer-edit-layout" onSubmit={handleSubmit}>
        <section className="customer-form-card">
          <div className="customer-card-title-row">
            <h2>Customer Information</h2>
            <span>Orders: 2</span>
          </div>

          <div className="customer-profile-photo">
            <div className="customer-profile-img">Y</div>
            <p>Profile Picture</p>
          </div>

          <label className="customer-field">
            <span>Customer ID</span>
            <input value={form.customerId} onChange={(e) => updateField("customerId", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>Customer Name</span>
            <input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>Email</span>
            <input value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>Mobile Number</span>
            <input value={form.mobile} onChange={(e) => updateField("mobile", e.target.value)} />
          </label>

          <div className="customer-account-status">
            <span>Account Status</span>
            <div>
              <button className="customer-status-pill" type="button">{form.status}</button>
              <button
                className="customer-change-btn"
                onClick={() => updateField("status", form.status === "Verified" ? "Unverified" : "Verified")}
                type="button"
              >
                Change
              </button>
            </div>
          </div>
        </section>

        <section className="customer-form-card">
          <h2>Customer Address</h2>

          <label className="customer-field">
            <span>House Number</span>
            <input value={form.houseNumber} onChange={(e) => updateField("houseNumber", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>Street Name</span>
            <input value={form.street} onChange={(e) => updateField("street", e.target.value)} />
          </label>

          <label className="customer-field">
            <span>Barangay, City/Municipality</span>
            <input value={form.barangay} onChange={(e) => updateField("barangay", e.target.value)} />
          </label>

          <div className="customer-form-row">
            <label className="customer-field">
              <span>Province</span>
              <input value={form.province} onChange={(e) => updateField("province", e.target.value)} />
            </label>

            <label className="customer-field">
              <span>Zip Code</span>
              <input value={form.zipCode} onChange={(e) => updateField("zipCode", e.target.value)} />
            </label>
          </div>

          <label className="customer-field">
            <span>Landmark</span>
            <input value={form.landmark} onChange={(e) => updateField("landmark", e.target.value)} />
          </label>

          <div className="customer-form-actions">
            <button className="customer-discard-btn" onClick={discardChanges} type="button">
              Discard Changes
            </button>
            <button className="customer-save-btn" type="submit">
              Save Changes
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
