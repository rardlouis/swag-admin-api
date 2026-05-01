import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MdArrowOutward, MdArrowUpward, MdArrowDownward } from "react-icons/md";
import { apiGet, formatPeso } from "../../api.js";
import "./Dashboard.css";

const defaultSalesData = [
  { month: "Jan", avgSale: 180000, avgItem: 120000 },
  { month: "Feb", avgSale: 200000, avgItem: 150000 },
  { month: "Mar", avgSale: 250000, avgItem: 190000 },
  { month: "Apr", avgSale: 211423, avgItem: 160000 },
  { month: "Jun", avgSale: 290000, avgItem: 210000 },
  { month: "Jul", avgSale: 339091, avgItem: 260000 },
  { month: "Aug", avgSale: 310000, avgItem: 240000 },
  { month: "Sep", avgSale: 280000, avgItem: 200000 },
  { month: "Oct", avgSale: 320000, avgItem: 230000 },
  { month: "Nov", avgSale: 350000, avgItem: 270000 },
  { month: "Dec", avgSale: 400000, avgItem: 300000 },
];

export default function Dashboard() {
  const [data, setData] = useState({
    summary: {},
    salesByMonth: defaultSalesData,
    popularStyles: [],
  });

  useEffect(() => {
    apiGet("/admin/dashboard")
      .then((payload) => {
        setData({
          summary: payload.summary ?? {},
          salesByMonth: payload.salesByMonth?.length ? payload.salesByMonth : defaultSalesData,
          popularStyles: payload.popularStyles ?? [],
        });
      })
      .catch(() => {});
  }, []);

  const { summary, salesByMonth, popularStyles } = data;

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
            <div className="sales-progress-fill" style={{ width: "46%" }} />
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
            <MdArrowUpward size={13} className="change-up" />
            <span className="change-up">+11%</span>
            <span className="stat-card-sub">From last week</span>
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
            <MdArrowUpward size={13} className="change-up" />
            <span className="change-up">+1.5%</span>
            <span className="stat-card-sub">From last week</span>
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
            <MdArrowUpward size={13} className="change-up" />
            <span className="change-up">+3.6%</span>
            <span className="stat-card-sub">From last week</span>
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
            <MdArrowDownward size={13} className="change-down" />
            <span className="change-down">-1.5%</span>
            <span className="stat-card-sub">From last week</span>
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
            <MdArrowUpward size={13} className="change-up" />
            <span className="change-up">+3.4%</span>
            <span className="stat-card-sub">From last week</span>
          </div>
        </div>

        {/* Row 4 Col 1-2: Map */}
        <div className="card map-card">
          <div className="chart-card-header">
            <div>
              <p className="card-label">Customer Growth</p>
              <p className="map-sub">3 Province</p>
            </div>
            <button className="show-all-btn">Show All <MdArrowOutward size={13} /></button>
          </div>
          <div className="map-legend">
            <span className="map-dot map-dot--green" /> NCR (50%)
            <span className="map-dot map-dot--blue" /> Bulacan (50%)
            <span className="map-dot map-dot--yellow" /> Cavite (65%)
          </div>
          <div className="map-placeholder">
            <iframe
              title="Metro Manila Map"
              src="https://maps.google.com/maps?q=Metro+Manila,Philippines&z=9&output=embed"
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
