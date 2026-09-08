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

export default function SalesReport() {
  const [report, setReport] = useState({
    summary: {}, monthlySales: [], monthlyTransactions: [], recentTransactions: [], topProducts: [],
  });

  useEffect(() => {
    apiGet("/admin/sales-report")
      .then((payload) => setReport({
        summary: payload.summary ?? {},
        monthlySales: Array.isArray(payload.monthlySales) ? payload.monthlySales : [],
        monthlyTransactions: Array.isArray(payload.monthlyTransactions) ? payload.monthlyTransactions : [],
        recentTransactions: Array.isArray(payload.recentTransactions) ? payload.recentTransactions : [],
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
      }))
      .catch(() => setReport({ summary: {}, monthlySales: [], monthlyTransactions: [], recentTransactions: [], topProducts: [] }));
  }, []);

  const { summary, monthlySales, monthlyTransactions, recentTransactions, topProducts } = report;
  const productTrend = monthlySales.map((item) => ({ ...item, products: Number(summary.totalProducts ?? 0) }));

  return (
    <div className="sales-report-page">
      <button className="sales-back" type="button">
        <MdArrowBack size={20} />
      </button>

      <div className="sales-header">
        <div>
          <h1>Sales Report</h1>
          <p>
            Dashboard <span>›</span> <strong>Sales Report</strong>
          </p>
        </div>
        <button className="sales-export-btn" type="button">
          <MdDownload size={17} />
          Export Report
        </button>
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
              <Line type="monotone" dataKey="previous" stroke="#2563eb" strokeWidth={2} dot={false} />
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
            <span>ORDERS.total_amount</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={monthlySales} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip formatter={(value) => money.format(value)} />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="previous" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="sales-legend">
            <span><i className="legend-blue" /> This Month</span>
            <span><i className="legend-red" /> Last Month</span>
          </div>
        </section>

        <section className="sales-transactions-card">
          <div className="sales-card-heading">
            <h2>Recent Transactions</h2>
            <span>Last 7 days</span>
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
