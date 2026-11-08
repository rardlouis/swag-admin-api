import { apiDownload } from "../../api.js";
import {
  MdArrowBack,
  MdDownload,
  MdInventory2,
  MdPeople,
  MdReceiptLong,
  MdTrendingUp,
} from "react-icons/md";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";
import "./SalesReport.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function MetricCard({ title, value, icon, accent, children }) {
  return (
    <section className="sales-metric-card">
      <div className="sales-metric-top">
        <div>
          <p>{title}</p>
          <strong>{value}</strong>
        </div>
        <span className="sales-metric-icon" style={{ color: accent }}>
          {icon}
        </span>
      </div>
      <div className="sales-mini-chart">{children}</div>
    </section>
  );
}

function normalizeSalesPoints(points) {
  return (Array.isArray(points) ? points : []).map((point) => ({
    ...point,
    // Older API deployments use `month`; the report API now uses `label` so
    // monthly and annual charts share one reliable X-axis field.
    label: point.label ?? point.month ?? "",
    sales: Number(point.sales ?? 0),
    previous: Number(point.previous ?? 0),
  }));
}

function normalizeTransactionPoints(points) {
  return (Array.isArray(points) ? points : []).map((point) => ({
    ...point,
    label: point.label ?? point.month ?? "",
    transactions: Number(point.transactions ?? 0),
  }));
}

export default function SalesReport() {
  const today = new Date();
  // Keep the historical Jan–Dec line visible on first load, matching the
  // established Sales Report view. Users can still choose a monthly report.
  const [reportType, setReportType] = useState("annual");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams({ year: String(year) });
      if (reportType === "monthly") params.set("month", String(month));
      const filename = reportType === "monthly"
        ? `SWAG_Monthly_Sales_Report_${year}-${String(month).padStart(2, "0")}.xlsx`
        : `SWAG_Annual_Sales_Report_${year}.xlsx`;
      await apiDownload(`/admin/export/sales-report?${params.toString()}`, filename);
    } catch (err) {
      alert(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };
  const [report, setReport] = useState({
    period: {}, summary: {}, monthlySales: [], monthlyTransactions: [], recentTransactions: [], topProducts: [],
  });

  useEffect(() => {
    const params = new URLSearchParams({ year: String(year) });
    if (reportType === "monthly") params.set("month", String(month));
    apiGet(`/admin/sales-report?${params.toString()}`)
      .then((payload) => setReport({
        period: payload.period ?? {},
        summary: payload.summary ?? {},
        monthlySales: normalizeSalesPoints(payload.salesBreakdown ?? payload.monthlySales),
        monthlyTransactions: normalizeTransactionPoints(payload.transactionBreakdown ?? payload.monthlyTransactions),
        recentTransactions: Array.isArray(payload.recentTransactions) ? payload.recentTransactions : [],
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
      }))
      .catch(() => setReport({ period: {}, summary: {}, monthlySales: [], monthlyTransactions: [], recentTransactions: [], topProducts: [] }));
  }, [year, month, reportType]);

  const { period, summary, monthlySales, monthlyTransactions, recentTransactions, topProducts } = report;
  const hasPreviousPeriod = period.mode === "annual";
  const productTrend = monthlySales.map((item) => ({
    ...item,
    products: Number(summary.totalProducts ?? 0),
  }));
  const years = Array.from({ length: 6 }, (_, index) => today.getFullYear() - index);

  return (
    <div className="sales-report-page">
      <button className="sales-back" type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="sales-header">
        <div>
          <h1>Sales Report</h1>
          <p>
            Dashboard <span>›</span> <strong>{period.label || "Sales Report"}</strong>
          </p>
        </div>
        <div className="sales-report-actions">
          <label><span>Report</span><select value={reportType} onChange={(event) => setReportType(event.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
          {reportType === "monthly" && <label><span>Month</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>}
          <label><span>Year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="sales-export-btn" type="button" onClick={handleExport} disabled={isExporting}><MdDownload size={17} /> {isExporting ? "Exporting..." : "Export Excel"}</button>
        </div>
      </div>

      <div className="sales-grid">
        <MetricCard
          title="Total Sales"
          value={money.format(Number(summary.totalSales ?? 0))}
          accent="#16a34a"
          icon={<MdTrendingUp size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlySales}>
              <Area type="monotone" dataKey="sales" stroke="#16a34a" fill="#dcfce7" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Customers"
          value={Number(summary.totalCustomers ?? 0).toLocaleString()}
          accent="#2563eb"
          icon={<MdPeople size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlySales}>
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Transactions"
          value={Number(summary.totalTransactions ?? 0).toLocaleString()}
          accent="#8b5cf6"
          icon={<MdReceiptLong size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyTransactions}>
              <Area type="monotone" dataKey="transactions" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Products"
          value={Number(summary.totalProducts ?? 0).toLocaleString()}
          accent="#f59e0b"
          icon={<MdInventory2 size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={productTrend}>
              <Line type="monotone" dataKey="products" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </MetricCard>

        <section className="sales-analysis-card">
          <div className="sales-card-heading">
            <h2>Sales Analysis</h2>
            <span>{period.label || "Selected period"}</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={monthlySales} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip formatter={(value) => money.format(value)} />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              {hasPreviousPeriod && <Line type="monotone" dataKey="previous" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
            </LineChart>
          </ResponsiveContainer>
          <div className="sales-legend">
            <span><i className="legend-blue" /> Selected period</span>
            {hasPreviousPeriod && <span><i className="legend-red" /> Previous year</span>}
          </div>
        </section>

        <section className="sales-transactions-card">
          <div className="sales-card-heading">
            <h2>Recent Transactions</h2>
            <span>{period.label || "Selected period"}</span>
          </div>
          <table className="sales-transactions-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Product</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="sales-client-dot" />
                    {item.client}
                  </td>
                  <td>{item.product}</td>
                  <td>{money.format(item.amount)}</td>
                  <td>
                    <span className={`sales-status sales-status-${item.status}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sales-products-card">
          <div className="sales-card-heading">
            <h2>Top Products</h2>
            <span>ORDER_ITEMS</span>
          </div>
          {topProducts.map((product) => (
            <div className="sales-product-row" key={product.name}>
              <div>
                <strong>{product.name}</strong>
                <span>{product.sold} sold</span>
              </div>
              <p>{money.format(product.revenue)}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
