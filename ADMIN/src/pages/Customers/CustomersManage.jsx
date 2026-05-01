import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdChevronLeft,
  MdChevronRight,
  MdDelete,
  MdFilterList,
  MdHowToReg,
  MdSearch,
  MdUnfoldMore,
  MdVisibility,
} from "react-icons/md";
import "./CustomersManage.css";

const CUSTOMERS = [
  { id: "ID 12451", name: "Leslie Alexander", email: "georgia@examp...", phone: "+63 819 1314 1435", status: "Verified", proof: "Photo uploaded" },
  { id: "ID 12452", name: "Guy Hawkins", email: "guys@examp.com", phone: "+63 819 1314 1435", status: "Unverified", proof: "Photo not uploaded" },
  { id: "ID 12453", name: "Kristin Watson", email: "kristin@examp...", phone: "+63 819 1314 1435", status: "Unverified", proof: "Photo not uploaded" },
  { id: "ID 12453", name: "Kristin Watson", email: "kristin@examp...", phone: "+63 819 1314 1435", status: "Unverified", proof: "Photo not uploaded" },
  { id: "ID 12452", name: "Guy Hawkins", email: "guys@examp.com", phone: "+63 819 1314 1435", status: "Unverified", proof: "Photo not uploaded" },
  { id: "ID 12451", name: "Leslie Alexander", email: "georgia@examp...", phone: "+63 819 1314 1435", status: "Verified", proof: "Photo uploaded" },
  { id: "ID 12453", name: "Kristin Watson", email: "kristin@examp...", phone: "+63 819 1314 1435", status: "Verified", proof: "Photo uploaded" },
  { id: "ID 12451", name: "Leslie Alexander", email: "georgia@examp...", phone: "+63 819 1314 1435", status: "Verified", proof: "Photo uploaded" },
];

export default function CustomersManage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);

  const filtered = CUSTOMERS.filter((customer) =>
    `${customer.id} ${customer.name} ${customer.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelected(selected.length === filtered.length ? [] : filtered.map((customer) => customer.id));
  };

  return (
    <div className="customers-manage-page">
      <button className="customer-form-back" onClick={() => navigate(-1)} type="button">
        <span>←</span>
      </button>

      <div className="customer-form-header">
        <h1>Customer</h1>
        <p>
          Dashboard <span>›</span> Customers <span>›</span> <strong>Manage Customer</strong>
        </p>
      </div>

      <div className="customers-manage-card">
        <div className="customers-manage-toolbar">
          <div className="customers-manage-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for id, name Customer"
            />
            <MdSearch size={16} />
          </div>

          <button className="customers-manage-filter" type="button">
            Filter <MdFilterList size={16} />
          </button>
        </div>

        <table className="customers-manage-table">
          <thead>
            <tr>
              <th><input checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} type="checkbox" /></th>
              <th>Name Customer <MdUnfoldMore size={13} /></th>
              <th>Contact <MdUnfoldMore size={13} /></th>
              <th>Status <MdUnfoldMore size={13} /></th>
              <th>Proof of verification <MdUnfoldMore size={13} /></th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer, index) => (
              <tr key={`${customer.id}-${index}`} className={selected.includes(customer.id) ? "row-selected" : ""}>
                <td><input checked={selected.includes(customer.id)} onChange={() => toggleSelect(customer.id)} type="checkbox" /></td>
                <td>
                  <p className="customer-id">{customer.id}</p>
                  <p className="customer-name">{customer.name}</p>
                </td>
                <td>
                  <p className="contact-email">{customer.email}</p>
                  <p className="contact-phone">{customer.phone}</p>
                </td>
                <td>{customer.status}</td>
                <td>{customer.proof}</td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn" type="button" title="View"><MdVisibility size={15} /></button>
                    <button
                      className="action-btn verify-action"
                      onClick={() => navigate(`/customers/verify/${customer.id.replace(/\s+/g, "-")}`)}
                      type="button"
                      title="Verify"
                    >
                      <MdHowToReg size={16} />
                    </button>
                    <button className="action-btn" type="button" title="Delete"><MdDelete size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="customers-pagination">
          <span>1 - 10 of 13 Pages</span>
          <div className="pagination-controls">
            <span className="pagination-label">The page on</span>
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
              <option value={1}>1</option>
            </select>
            <button className="page-btn" type="button"><MdChevronLeft size={16} /></button>
            <button className="page-btn" type="button"><MdChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
