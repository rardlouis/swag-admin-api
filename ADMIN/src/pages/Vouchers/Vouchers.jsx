import { useEffect, useState } from "react";
import { MdAdd, MdDelete, MdEdit, MdSearch } from "react-icons/md";
import { apiDelete, apiGet, apiPatch, apiPost, formatPeso } from "../../api.js";
import "./Vouchers.css";

const blankVoucher = () => ({ code: "", discountType: "percentage", discountAmount: "", minimumOrderAmount: "0", usageLimit: "", startAt: new Date().toISOString().slice(0, 16), endAt: "", isActive: true });
const localDate = (value) => value ? new Date(value).toISOString().slice(0, 16) : "";

export default function Vouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankVoucher());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); apiGet("/admin/vouchers").then((data) => setVouchers(Array.isArray(data) ? data : [])).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing("new"); setForm(blankVoucher()); setError(""); };
  const openEdit = (voucher) => { setEditing(voucher.id); setForm({ ...voucher, discountAmount: String(voucher.discountAmount), minimumOrderAmount: String(voucher.minimumOrderAmount), usageLimit: voucher.usageLimit ?? "", startAt: localDate(voucher.startAt), endAt: localDate(voucher.endAt) }); setError(""); };
  const save = async (event) => {
    event.preventDefault(); setError("");
    try { editing === "new" ? await apiPost("/admin/vouchers", form) : await apiPatch(`/admin/vouchers/${editing}`, form); setEditing(null); load(); }
    catch (err) { setError(err.message || "Unable to save voucher"); }
  };
  const toggle = async (voucher) => { try { await apiPatch(`/admin/vouchers/${voucher.id}`, { ...voucher, isActive: !voucher.isActive }); load(); } catch (err) { setError(err.message); } };
  const remove = async (voucher) => { if (!window.confirm(`Delete voucher ${voucher.code}?`)) return; try { await apiDelete(`/admin/vouchers/${voucher.id}`); load(); } catch (err) { setError(err.message); } };
  const filtered = vouchers.filter((voucher) => voucher.code.toLowerCase().includes(search.toLowerCase()));

  return <div className="vouchers-page">
    <div className="vouchers-header"><div><h1>Voucher Management</h1><p>Dashboard <span>›</span> <strong>Vouchers</strong></p></div><button className="voucher-primary" onClick={openNew}><MdAdd /> Create voucher</button></div>
    <div className="vouchers-card">
      <div className="voucher-toolbar"><div className="voucher-search"><MdSearch /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search voucher code" /></div></div>
      {error && !editing && <p className="voucher-error">{error}</p>}
      {loading ? <p className="voucher-note">Loading vouchers…</p> : <table><thead><tr><th>Code</th><th>Discount</th><th>Minimum order</th><th>Usage</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filtered.map((voucher) => <tr key={voucher.id}><td><b>{voucher.code}</b></td><td>{voucher.discountType === "percentage" ? `${voucher.discountAmount}% OFF` : `${formatPeso(voucher.discountAmount)} OFF`}</td><td>{formatPeso(voucher.minimumOrderAmount)}</td><td>{voucher.usageCount}{voucher.usageLimit === null ? " / ∞" : ` / ${voucher.usageLimit}`}</td><td>{new Date(voucher.startAt).toLocaleDateString("en-PH")} – {voucher.endAt ? new Date(voucher.endAt).toLocaleDateString("en-PH") : "No end date"}</td><td><span className={`voucher-badge ${voucher.status.toLowerCase()}`}>{voucher.status}</span></td><td className="voucher-actions"><button onClick={() => toggle(voucher)}>{voucher.isActive ? "Deactivate" : "Activate"}</button><button title="Edit" onClick={() => openEdit(voucher)}><MdEdit /></button><button title="Delete" onClick={() => remove(voucher)}><MdDelete /></button></td></tr>)}
        {!filtered.length && <tr><td colSpan="7" className="voucher-empty">No vouchers found.</td></tr>}
      </tbody></table>}
    </div>
    {editing && <div className="voucher-modal"><form onSubmit={save}><div className="voucher-modal-title"><h2>{editing === "new" ? "Create voucher" : "Edit voucher"}</h2><button type="button" onClick={() => setEditing(null)}>×</button></div>{error && <p className="voucher-error">{error}</p>}<label>Voucher code<input required maxLength="50" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="AFRO10" /></label><div className="voucher-fields"><label>Discount type<select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label>Discount amount<input required min="0.01" step="0.01" type="number" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} /></label></div><div className="voucher-fields"><label>Minimum order amount<input required min="0" step="0.01" type="number" value={form.minimumOrderAmount} onChange={(e) => setForm({ ...form, minimumOrderAmount: e.target.value })} /></label><label>Usage limit <small>(blank = unlimited)</small><input min="0" step="1" type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></label></div><div className="voucher-fields"><label>Start date<input required type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></label><label>End date <small>(optional)</small><input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></label></div><label className="voucher-check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label><div className="voucher-form-actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="voucher-primary" type="submit">Save voucher</button></div></form></div>}
  </div>;
}
