import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MdArrowOutward } from "react-icons/md";
import { apiGet, formatPeso } from "../../api.js";
import "./Dashboard.css";

export default function Dashboard() {
  const [data, setData] = useState({
    summary: {},
    salesByMonth: [],
    popularStyles: [],
    customerLocations: [],
  });

  useEffect(() => {
    apiGet("/admin/dashboard")
      .then((payload) => {
        setData({
          summary: payload.summary ?? {},
          salesByMonth: Array.isArray(payload.salesByMonth) ? payload.salesByMonth : [],
          popularStyles: payload.popularStyles ?? [],
          customerLocations: Array.isArray(payload.customerLocations) ? payload.customerLocations : [],
        });
      })
      .catch(() => {});
  }, []);

  const { summary, salesByMonth, popularStyles, customerLocations } = data;
  const locatedCustomerCount = customerLocations.reduce((total, item) => total + Number(item.customers ?? 0), 0);
  const mapFocus = customerLocations[0]?.location ? `${customerLocations[0].location}, Philippines` : 'Philippines';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-breadcrumb">Dashboard</p>
      </div>

      <div className="dashboard-grid">

        {/* Row 1 Col 1-2: Sales Target */}
        <div className="card sales-target-card">
          <p className="card-label">Sales Target</p>
          <div className="sales-target-row">
            <span>In Progress</span>
            <span>Sales Target <strong>₱500,000.00</strong></span>
          </div>
          <p className="sales-target-value">{formatPeso(summary.totalRevenue)}</p>
          <div className="sales-progress-bar">
            <div className="sales-progress-fill" style={{ width: `${Math.min(100, (Number(summary.totalRevenue ?? 0) / 500000) * 100)}%` }} />
          </div>
        </div>

        {/* Row 1 Col 3: Total Revenue */}
        <div className="card stat-card stat-card--highlight total-revenue-card">
          <div className="stat-card-top">
            <p className="stat-card-label">Total Revenue</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{formatPeso(summary.totalRevenue)}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">From recorded orders</span>
          </div>
        </div>

        {/* Row 1 Col 4: Total Customer */}
        <div className="card stat-card total-customer-card">
          <div className="stat-card-top">
            <p className="stat-card-label">Total Customer</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalCustomers ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Registered customers</span>
          </div>
        </div>

        {/* Row 2-3 Col 1-2: Sales Chart (spans 2 rows) */}
        <div className="card chart-card">
          <div className="chart-card-header">
            <p className="card-label">Your Sales this year</p>
            <button className="show-all-btn">Show All <MdArrowOutward size={13} /></button>
          </div>
          <div className="chart-legend">
            <span className="legend-dot legend-dot--green" /> Average Sale Value
            <span className="legend-dot legend-dot--blue" style={{ marginLeft: 12 }} /> Average Item per Sale
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salesByMonth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#bbb" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `₱${v.toLocaleString()}`} />
              <Line type="monotone" dataKey="avgSale" stroke="#a3c940" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="avgItem" stroke="#4a90d9" strokeWidth={2.5} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Row 2 Col 3: Total Transactions */}
        <div className="card stat-card total-trans-card">
          <div className="stat-card-top">
            <p className="stat-card-label">Total Transactions</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalTransactions ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Recorded orders</span>
          </div>
        </div>

        {/* Row 2 Col 4: Total Product */}
        <div className="card stat-card total-product-card">
          <div className="stat-card-top">
            <p className="stat-card-label">Total Product</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalProducts ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Products in catalog</span>
          </div>
        </div>

        {/* Row 3 Col 3-4: SWAG-VTON */}
        <div className="card stat-card swag-card">
          <div className="stat-card-top">
            <p className="stat-card-label">SWAG-VTON Request</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value swag-value">{Number(summary.tryonRequests ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Recorded try-on sessions</span>
          </div>
        </div>

        {/* Row 4 Col 1-2: Map */}
        <div className="card map-card">
          <div className="chart-card-header">
            <div>
              <p className="card-label">Customer Growth</p>
              <p className="map-sub">{locatedCustomerCount} customer{locatedCustomerCount === 1 ? '' : 's'} mapped</p>
            </div>
            <button className="show-all-btn">Show All <MdArrowOutward size={13} /></button>
          </div>
          <div className="map-legend">
            {customerLocations.length ? customerLocations.map((location, index) => (
              <span className="map-legend-item" key={location.location}>
                <i className="map-dot" style={{ backgroundColor: ['#43a047', '#1565c0', '#f9a825', '#8b5cf6'][index] }} />
                {location.location} ({location.customers})
              </span>
            )) : <span>No saved customer addresses yet.</span>}
          </div>
          <div className="map-placeholder">
            <iframe
              title="Customer location map"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(mapFocus)}&z=${customerLocations.length ? 8 : 5}&output=embed`}
              width="100%"
              height="100%"
              style={{ border: "none", borderRadius: 8 }}
              loading="lazy"
            />
          </div>
        </div>

        {/* Row 4 Col 3-4: Popular Styles Table */}
        <div className="card table-card">
          <div className="chart-card-header">
            <p className="card-label">Popular Style</p>
            <button className="show-all-btn">Show All <MdArrowOutward size={13} /></button>
          </div>
          <table className="style-table">
            <thead>
              <tr>
                <th>Style</th>
                <th>Price Range</th>
                <th>Sales</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {popularStyles.map((row, i) => (
                <tr key={i}>
                  <td>
                    <span className="style-id">{row.id}</span>
                    <br />
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.range ?? "-"}</td>
                  <td>{row.sales.toLocaleString()}</td>
                  <td><span className="status-badge">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
