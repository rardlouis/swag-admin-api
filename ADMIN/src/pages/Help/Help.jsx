import { useState } from "react";
import {
  MdArticle,
  MdChat,
  MdExpandMore,
  MdHelpOutline,
  MdInventory2,
  MdMailOutline,
  MdPeople,
  MdReceiptLong,
  MdSearch,
  MdSettings,
  MdLocalShipping,
  MdStar,
  MdBarChart,
} from "react-icons/md";
import "./Help.css";

const helpTopics = [
  {
    icon: <MdInventory2 size={22} />,
    title: "Product Catalog",
    text: "Add thrift items, upload product photos, set category, size, color, price, stock, and visibility.",
  },
  {
    icon: <MdReceiptLong size={22} />,
    title: "Order Handling",
    text: "Review new orders, confirm payment status, check customer details, and update fulfillment progress.",
  },
  {
    icon: <MdPeople size={22} />,
    title: "Customer Records",
    text: "Look up customer accounts, view contact details, review verification status, and manage account activity.",
  },
  {
    icon: <MdChat size={22} />,
    title: "Customer Chats",
    text: "Reply to customer messages, monitor unread conversations, and take over conversations that need staff support.",
  },
  {
    icon: <MdLocalShipping size={22} />,
    title: "Suppliers",
    text: "Keep supplier names, shops, contact information, active status, and sourcing addresses up to date.",
  },
  {
    icon: <MdStar size={22} />,
    title: "Reviews",
    text: "Read product feedback, track low ratings, and prepare replies when customers need follow-up.",
  },
  {
    icon: <MdBarChart size={22} />,
    title: "Sales Reports",
    text: "Use revenue, order, and product performance views to understand what is selling well.",
  },
  {
    icon: <MdSettings size={22} />,
    title: "Account Settings",
    text: "Update your admin profile, profile photo, password, identity information, and browser notifications.",
  },
];

const faqs = [
  {
    question: "What should I check first when a new order arrives?",
    answer: "Open Orders, confirm the customer and item details, check the payment label, then update the order status as the item moves through packing and shipment.",
  },
  {
    question: "When should I switch a chat from AI to human handling?",
    answer: "Use human handling for refund requests, delivery disputes, sensitive account issues, unclear sizing complaints, or anything that needs a personal staff decision.",
  },
  {
    question: "How do I keep product listings clean?",
    answer: "Use clear product names, upload the best photo first, keep stock quantity accurate, and mark items inactive when they are unavailable.",
  },
  {
    question: "What supplier details are required?",
    answer: "Supplier name, shop name, and email are required. Add phone number and address when available so sourcing and follow-up are easier.",
  },
  {
    question: "Why do I need browser notifications?",
    answer: "Notifications help you notice new chats, order activity, and customer updates while the admin dashboard is open in the background.",
  },
];

const quickSteps = [
  "Start on Dashboard to scan today’s revenue, orders, customers, and inventory.",
  "Check Orders for new or pending items that need confirmation.",
  "Open Chats and reply to unread customer questions.",
  "Review Products for low stock or inactive items before adding new inventory.",
  "Update Suppliers when contact details or shop status changes.",
];

export default function Help() {
  const [search, setSearch] = useState("");
  const [openFaq, setOpenFaq] = useState(0);

  const filteredTopics = helpTopics.filter((topic) =>
    `${topic.title} ${topic.text}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="help-page">
      <div className="help-header">
        <div>
          <h1>Help</h1>
          <p>
            Dashboard <span>›</span> <strong>Help</strong>
          </p>
        </div>
      </div>

      <section className="help-search-card">
        <div>
          <MdHelpOutline size={28} />
          <h2>Admin Help Center</h2>
          <p>Find quick guidance for managing products, orders, customers, chats, and suppliers.</p>
        </div>

        <div className="help-search">
          <MdSearch size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help topics"
          />
        </div>
      </section>

      <div className="help-layout">
        <section className="help-card help-topics-card">
          <div className="help-card-head">
            <h2>Admin Topics</h2>
            <p>Use these as quick reminders while running the shop.</p>
          </div>

          <div className="help-topic-grid">
            {filteredTopics.map((topic) => (
              <article className="help-topic" key={topic.title}>
                <span>{topic.icon}</span>
                <h3>{topic.title}</h3>
                <p>{topic.text}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="help-card help-contact-card">
          <div className="help-card-head">
            <h2>Daily Checklist</h2>
            <p>A simple operating flow for admins.</p>
          </div>

          {quickSteps.map((step, index) => (
            <div className="help-contact-item" key={step}>
              <MdArticle size={22} />
              <div>
                <strong>Step {index + 1}</strong>
                <span>{step}</span>
              </div>
            </div>
          ))}

          <div className="help-contact-item">
            <MdMailOutline size={22} />
            <div>
              <strong>Need Escalation?</strong>
              <span>Contact the store owner for refunds, account locks, and payment disputes.</span>
            </div>
          </div>
        </aside>

        <section className="help-card help-faq-card">
          <div className="help-card-head">
            <h2>Common Questions</h2>
            <p>Answers for frequent admin tasks.</p>
          </div>

          <div className="help-faq-list">
            {faqs.map((faq, index) => (
              <button
                className={`help-faq ${openFaq === index ? "active" : ""}`}
                key={faq.question}
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                type="button"
              >
                <div>
                  <strong>{faq.question}</strong>
                  <MdExpandMore size={20} />
                </div>
                {openFaq === index && <p>{faq.answer}</p>}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
