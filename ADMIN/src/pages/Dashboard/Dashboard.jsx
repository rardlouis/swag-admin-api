import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MdArrowOutward } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { apiGet, formatPeso } from "../../api.js";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    summary: {},
    salesByMonth: [],
    popularStyles: [],
    customerLocations: [],
  });
  const [stylePeriod, setStylePeriod] = useState("month");
  const [salesPeriod, setSalesPeriod] = useState("year");
  const [dashboardState, setDashboardState] = useState("loading");

  useEffect(() => {
    apiGet("/admin/dashboard")
      .then((payload) => {
        setData({
          summary: payload.summary ?? {},
          salesByMonth: Array.isArray(payload.salesByMonth) ? payload.salesByMonth : [],
          popularStyles: payload.popularStyles ?? [],
          customerLocations: Array.isArray(payload.customerLocations) ? payload.customerLocations : [],
        });
        setDashboardState("ready");
      })
      .catch(() => setDashboardState("error"));
  }, []);

  useEffect(() => {
    apiGet(`/admin/popular-styles?period=${stylePeriod}`)
      .then((popularStyles) => setData((current) => ({ ...current, popularStyles: Array.isArray(popularStyles) ? popularStyles : [] })))
      .catch(() => {});
  }, [stylePeriod]);

  const { summary, salesByMonth, popularStyles, customerLocations } = data;
  const visibleSalesByMonth = useMemo(() => {
    const currentMonthNumber = new Date().getMonth() + 1;
    if (salesPeriod === "month") return salesByMonth.filter((row) => Number(row.monthNumber) === currentMonthNumber);
    if (salesPeriod === "quarter") return salesByMonth.filter((row) => (
      Number(row.monthNumber) >= Math.max(1, currentMonthNumber - 2)
      && Number(row.monthNumber) <= currentMonthNumber
    ));
    return salesByMonth;
  }, [salesByMonth, salesPeriod]);
  const latestSalesMonth = salesByMonth.at(-1);
  const previousSalesMonth = salesByMonth.at(-2);
  const locatedCustomerCount = customerLocations.reduce((total, item) => total + Number(item.customers ?? 0), 0);
  const mapFocus = customerLocations[0]?.location ? `${customerLocations[0].location}, Philippines` : 'Philippines';

  const formatItems = (value) => `${Number(value ?? 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })} items`;
  const formatCompactPeso = (value) => `₱${Number(value ?? 0).toLocaleString("en-PH", {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
  const monthComparison = (currentValue, previousValue) => {
    if (previousValue == null) return { label: "No previous month available", direction: "neutral" };
    const difference = Number(currentValue ?? 0) - Number(previousValue ?? 0);
    if (difference === 0) return { label: "No change from previous month", direction: "neutral" };
    if (Number(previousValue) === 0) return { label: `${difference > 0 ? "Increased" : "Decreased"} from previous month`, direction: difference > 0 ? "up" : "down" };
    const percent = Math.abs((difference / Number(previousValue)) * 100).toFixed(1);
    return {
      label: `${difference > 0 ? "Increased" : "Decreased"} ${percent}% from previous month`,
      direction: difference > 0 ? "up" : "down",
    };
  };
  const latestSaleComparison = latestSalesMonth ? monthComparison(latestSalesMonth.avgSale, previousSalesMonth?.avgSale) : null;
  const latestItemsComparison = latestSalesMonth ? monthComparison(latestSalesMonth.avgItems, previousSalesMonth?.avgItems) : null;

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
        <button type="button" className="card stat-card stat-card--highlight total-revenue-card dashboard-card-link" aria-label="View sales report" onClick={() => navigate('/salesreport')}>
          <div className="stat-card-top">
            <p className="stat-card-label">Total Revenue</p>
            <MdArrowOutward size={16} aria-hidden="true" />
          </div>
          <p className="stat-card-value">{formatPeso(summary.totalRevenue)}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">From recorded orders</span>
          </div>
        </button>

        {/* Row 1 Col 4: Total Customer */}
        <button type="button" className="card stat-card total-customer-card dashboard-card-link" aria-label="View all customers" onClick={() => navigate('/customers/all-customers')}>
          <div className="stat-card-top">
            <p className="stat-card-label">Total Customer</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalCustomers ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Registered customers</span>
          </div>
        </button>

        {/* Row 2-3 Col 1-2: Monthly sales performance (spans 2 rows) */}
        <section className="card chart-card" aria-labelledby="monthly-sales-performance-title">
          <div className="chart-card-header">
            <div>
              <p id="monthly-sales-performance-title" className="card-label">Monthly Sales Performance</p>
              <p className="chart-description">Average values from recorded orders</p>
            </div>
            <div className="chart-actions">
              <select aria-label="Sales chart period" value={salesPeriod} onChange={(event) => setSalesPeriod(event.target.value)}>
                <option value="month">This Month</option>
                <option value="quarter">Last 3 Months</option>
                <option value="year">This Year</option>
              </select>
            <button type="button" className="show-all-btn" onClick={() => navigate('/salesreport')}>Show All <MdArrowOutward size={13} /></button>
            </div>
          </div>
          {dashboardState === "loading" ? <p className="chart-status">Loading monthly sales performance…</p> : null}
          {dashboardState === "error" ? <p className="chart-status chart-status--error">Monthly sales performance could not be loaded. Please refresh and try again.</p> : null}
          {dashboardState === "ready" && !salesByMonth.length ? <p className="chart-status">No recorded sales are available for this year yet.</p> : null}
          {dashboardState === "ready" && salesByMonth.length ? <>
            <div className="sales-summary-cards">
              <article className="sales-summary-card">
                <p>Latest month: {latestSalesMonth.month}</p>
                <h2>{formatPeso(latestSalesMonth.avgSale)}</h2>
                <span>Average Sale Value</span>
                <small className={`metric-change metric-change--${latestSaleComparison.direction}`}>{latestSaleComparison.label}</small>
              </article>
              <article className="sales-summary-card">
                <p>Latest month: {latestSalesMonth.month}</p>
                <h2>{formatItems(latestSalesMonth.avgItems)}</h2>
                <span>Average Items per Sale</span>
                <small className={`metric-change metric-change--${latestItemsComparison.direction}`}>{latestItemsComparison.label}</small>
              </article>
            </div>
            {visibleSalesByMonth.length ? <div className="sales-charts">
              <article className="metric-chart" aria-label="Average Sale Value chart">
                <h2>Average Sale Value <span>(₱)</span></h2>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={visibleSalesByMonth} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
                    <CartesianGrid stroke="#edf1f6" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis width={58} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={formatCompactPeso} />
                    <Tooltip labelFormatter={(label) => `Month: ${label}`} formatter={(value) => [formatPeso(value), "Average Sale Value"]} />
                    <Line type="monotone" dataKey="avgSale" stroke="#0E4C8F" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </article>
              <article className="metric-chart" aria-label="Average Items per Sale chart">
                <h2>Average Items per Sale <span>(items)</span></h2>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={visibleSalesByMonth} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
                    <CartesianGrid stroke="#edf1f6" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis width={58} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={formatItems} />
                    <Tooltip labelFormatter={(label) => `Month: ${label}`} formatter={(value) => [formatItems(value), "Average Items per Sale"]} />
                    <Line type="monotone" dataKey="avgItems" stroke="#4a90d9" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </article>
            </div> : <p className="chart-status">No recorded sales are available for the selected period.</p>}
          </> : null}
        </section>

        {/* Row 2 Col 3: Total Transactions */}
        <button type="button" className="card stat-card total-trans-card dashboard-card-link" aria-label="View orders" onClick={() => navigate('/orders/all-orders')}>
          <div className="stat-card-top">
            <p className="stat-card-label">Total Transactions</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalTransactions ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Recorded orders</span>
          </div>
        </button>

        {/* Row 2 Col 4: Total Product */}
        <button type="button" className="card stat-card total-product-card dashboard-card-link" aria-label="View all products" onClick={() => navigate('/products/all')}>
          <div className="stat-card-top">
            <p className="stat-card-label">Total Product</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value">{Number(summary.totalProducts ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Products in catalog</span>
          </div>
        </button>

        {/* Row 3 Col 3-4: SWAG-VTON */}
        <button type="button" className="card stat-card swag-card dashboard-card-link" aria-label="View try-on sessions" onClick={() => navigate('/try-on-sessions')}>
          <div className="stat-card-top">
            <p className="stat-card-label">SWAG-VTON Request</p>
            <MdArrowOutward size={16} />
          </div>
          <p className="stat-card-value swag-value">{Number(summary.tryonRequests ?? 0).toLocaleString()}</p>
          <div className="stat-card-change">
            <span className="stat-card-sub">Recorded try-on sessions</span>
          </div>
        </button>

        {/* Row 4 Col 1-2: Map */}
        <div className="card map-card">
          <div className="chart-card-header">
            <div>
              <p className="card-label">Customer Growth</p>
              <p className="map-sub">{locatedCustomerCount} customer{locatedCustomerCount === 1 ? '' : 's'} mapped</p>
            </div>
            <button type="button" className="show-all-btn" onClick={() => navigate('/customers/all-customers')}>Show All <MdArrowOutward size={13} /></button>
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
            <div><select aria-label="Popular style period" value={stylePeriod} onChange={(event) => setStylePeriod(event.target.value)}><option value="month">This month</option><option value="quarter">Last 3 months</option><option value="year">This year</option></select><button type="button" className="show-all-btn" onClick={() => navigate(`/salesreport?view=popular-styles&period=${stylePeriod}`)}>Show All <MdArrowOutward size={13} /></button></div>
          </div>
          <table className="style-table">
            <thead>
              <tr>
                <th>Rank</th><th>Style</th><th>Products</th><th>Units sold</th><th>Revenue</th>
                <th>Price Range</th>
                <th>Sales</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {popularStyles.slice(0, 5).map((row) => (
                <tr key={row.styleId} className="dashboard-style-row" onClick={() => navigate(`/products/all?styleId=${row.styleId}`)}>
                  <td>
                    #{row.rank}
                  </td>
                  <td><strong>{row.style}</strong></td><td>{row.products}</td><td>{row.unitsSold}</td><td>{formatPeso(row.revenue)}</td>
                  <td>{row.minPrice == null ? "-" : `${formatPeso(row.minPrice)} - ${formatPeso(row.maxPrice)}`}</td><td>{row.customers}</td>
                  <td><span className="status-badge">{row.demandStatus}</span></td>
                </tr>
              ))}
              {!popularStyles.length ? <tr><td colSpan="8">No sales yet. Styles will rank here once orders come in.</td></tr> : null}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
