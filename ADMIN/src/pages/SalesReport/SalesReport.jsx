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
import "./SalesReport.css";

const salesTrend = [
  { month: "Jan", sales: 6200, previous: 4200 },
  { month: "Feb", sales: 9200, previous: 5700 },
  { month: "Mar", sales: 7800, previous: 5000 },
  { month: "Apr", sales: 8700, previous: 6500 },
  { month: "May", sales: 10100, previous: 5900 },
  { month: "Jun", sales: 7600, previous: 7200 },
  { month: "Jul", sales: 9800, previous: 6100 },
  { month: "Aug", sales: 12100, previous: 7600 },
  { month: "Sep", sales: 9400, previous: 5400 },
  { month: "Oct", sales: 11200, previous: 8800 },
  { month: "Nov", sales: 12900, previous: 6900 },
  { month: "Dec", sales: 15000, previous: 9100 },
];

const transactionTrend = [
  { month: "Jan", transactions: 24 },
  { month: "Feb", transactions: 32 },
  { month: "Mar", transactions: 38 },
  { month: "Apr", transactions: 44 },
  { month: "May", transactions: 49 },
  { month: "Jun", transactions: 56 },
  { month: "Jul", transactions: 65 },
  { month: "Aug", transactions: 52 },
  { month: "Sep", transactions: 71 },
  { month: "Oct", transactions: 82 },
  { month: "Nov", transactions: 82 },
  { month: "Dec", transactions: 96 },
];

const productTrend = [
  { month: "Jan", products: 1400 },
  { month: "Feb", products: 1510 },
  { month: "Mar", products: 1640 },
  { month: "Apr", products: 1780 },
  { month: "May", products: 1720 },
  { month: "Jun", products: 1680 },
  { month: "Jul", products: 1750 },
  { month: "Aug", products: 1810 },
  { month: "Sep", products: 1980 },
  { month: "Oct", products: 2170 },
  { month: "Nov", products: 2500 },
];

const recentTransactions = [
  { id: "AFD23456432", client: "Kenneth", product: "Vintage Jacket", amount: 200, status: "pending" },
  { id: "AFD23344534", client: "Yuri", product: "H&M Top", amount: 300, status: "shipped" },
  { id: "AFD23453121", client: "Gerard", product: "Uniqlo Pants", amount: 500, status: "delivered" },
  { id: "AFD21342314", client: "Leslie", product: "Zara Dress", amount: 850, status: "confirmed" },
];

const topProducts = [
  { name: "Vintage Jacket", sold: 86, revenue: 32680 },
  { name: "Adidas Jacket", sold: 42, revenue: 25200 },
  { name: "Zara Dress", sold: 31, revenue: 26350 },
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

export default function SalesReport() {
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
          value={money.format(86400)}
          accent="#16a34a"
          icon={<MdTrendingUp size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesTrend}>
              <Area type="monotone" dataKey="sales" stroke="#16a34a" fill="#dcfce7" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Customers"
          value="327"
          accent="#2563eb"
          icon={<MdPeople size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesTrend}>
              <Line type="monotone" dataKey="previous" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Transactions"
          value="432"
          accent="#8b5cf6"
          icon={<MdReceiptLong size={22} />}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={transactionTrend}>
              <Area type="monotone" dataKey="transactions" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </MetricCard>

        <MetricCard
          title="Total Products"
          value="2,500"
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
            <LineChart data={salesTrend} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
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
