// /netlify/functions/send-email.js
//
// Single endpoint for all BRL + SB transactional email.
// Called from order forms (customer confirmation, new-order alert) and
// the back office (tracking, payment reminder, cancellation, resend confirmation).
//
// Requires env var POSTMARK_API_TOKEN set in Netlify: Site settings > Environment variables.

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const FROM_ADDRESS = "orders@brlpeptides.com"; // single verified sending address, used by both brands
const ALERT_EMAIL = "boldresearchlabs.orders@gmail.com";

const BRANDS = {
  BRL: {
    name: "Bold Research Labs",
    bg: "#0d0d0f",
    card: "#17171b",
    accent: "#d4af37", // gold
    accent2: "#2dd4bf", // teal
    text: "#f2f0ea",
    muted: "#9a9a9f",
  },
  SB: {
    name: "SB Peptides",
    bg: "#0a1628",
    card: "#0f2038",
    accent: "#a3e635", // lime
    accent2: "#fb923c", // orange
    text: "#e8f0fb",
    muted: "#8ea3bd",
  },
};

function brandOf(key) {
  return BRANDS[key] === undefined ? BRANDS.BRL : BRANDS[key];
}

function esc(v) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapEmail(brand, title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${brand.bg};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:${brand.card};border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:22px 28px;border-bottom:2px solid ${brand.accent};">
            <span style="color:${brand.accent};font-size:20px;font-weight:bold;letter-spacing:0.5px;">${esc(brand.name)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;color:${brand.text};">
            <h2 style="margin:0 0 14px 0;color:${brand.text};font-size:18px;">${esc(title)}</h2>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid ${brand.accent2}33;color:${brand.muted};font-size:12px;">
            ${esc(brand.name)} &middot; Questions? Just reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function row(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<tr>
    <td style="padding:6px 0;color:#9a9a9f;font-size:13px;width:140px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;font-size:13px;">${esc(value)}</td>
  </tr>`;
}

function table(rowsHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rowsHtml}</table>`;
}

// ---- Email builders per type ----

function buildConfirmation(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;">Hi ${esc(d.customer_name || "there")}, thanks for your order! Here's your summary:</p>
    ${table(
      row("Order #", d.order_number) +
      row("Date", d.order_date) +
      row("Items", d.items_summary) +
      row("Subtotal", d.subtotal) +
      row("Discount", d.discount) +
      row("Shipping", d.shipping) +
      row("Total", d.total) +
      row("Payment method", d.payment_method) +
      row("Notes", d.notes)
    )}
    <div style="margin-top:18px;padding:14px 16px;background:${brand.bg};border-radius:6px;border:1px solid ${brand.accent2}55;">
      <div style="color:${brand.accent2};font-weight:bold;font-size:13px;margin-bottom:6px;">Send payment to: ${esc(d.payment_handle || "")}</div>
      <div style="font-size:13px;color:${brand.text};">${esc(d.payment_instructions || "")}</div>
    </div>
    <p style="margin:16px 0 0 0;font-size:13px;color:${brand.muted};">Shipping to: ${esc(d.shipping_address)}</p>
  `;
  return { subject: `Order Confirmed — ${d.order_number}`, html: wrapEmail(brand, "Order Received", body) };
}

function buildAlert(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;color:${brand.accent};font-weight:bold;">New order — check the back office.</p>
    ${table(
      row("Order #", d.order_number) +
      row("Customer", d.customer_name) +
      row("Customer email", d.customer_email_actual || d.customer_email) +
      row("Items", d.items_summary) +
      row("Total", d.total) +
      row("Payment method", d.payment_method) +
      row("Notes", d.notes)
    )}
  `;
  return { subject: `🔔 New Order — ${d.order_number}`, html: wrapEmail(brand, "New Order Alert", body) };
}

function buildTracking(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;">Hi ${esc(d.customer_name || "there")}, your order has shipped!</p>
    ${table(
      row("Order #", d.order_number) +
      row("Items", d.items_summary) +
      row("Tracking #", d.tracking_number) +
      row("Ship to", d.shipping_address)
    )}
    <div style="margin-top:18px;">
      <a href="${esc(d.tracking_url)}" style="display:inline-block;background:${brand.accent};color:#111;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:6px;font-size:13px;">Track Package</a>
    </div>
  `;
  return { subject: `Shipped — Order ${d.order_number}`, html: wrapEmail(brand, "Your Order Is On The Way", body) };
}

function buildReminder(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;">Hi ${esc(d.customer_name || "there")}, we haven't received payment yet for your order.</p>
    ${table(row("Order #", d.order_number) + row("Total due", "$" + d.total))}
    <p style="margin:16px 0 0 0;font-size:13px;color:${brand.muted};">Please include your order number in the payment note so we can match it quickly. Unpaid orders are automatically cancelled after 48 hours.</p>
  `;
  return { subject: `Payment Reminder — Order ${d.order_number}`, html: wrapEmail(brand, "Payment Reminder", body) };
}

function buildCancelled(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;">Hi ${esc(d.customer_name || "there")}, your order below was cancelled because payment wasn't received within 48 hours.</p>
    ${table(row("Order #", d.order_number) + row("Date", d.order_date) + row("Items", d.items_summary))}
    <p style="margin:16px 0 0 0;font-size:13px;color:${brand.muted};">If this was a mistake or you'd still like to order, just place a new order or reply to this email.</p>
  `;
  return { subject: `Order Cancelled — ${d.order_number}`, html: wrapEmail(brand, "Order Cancelled", body) };
}

function buildQuote(brand, d) {
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px;">Hi ${esc(d.customer_name || "there")}, here's your order quote:</p>
    ${table(
      row("Order #", d.order_number) +
      row("Items", (d.items_table || "").split("\n").join("<br>")) +
      row("Total", "$" + d.total)
    )}
  `;
  return { subject: `Order Quote — ${d.order_number}`, html: wrapEmail(brand, "Your Order Quote", body) };
}

const BUILDERS = {
  confirmation: buildConfirmation,
  alert: buildAlert,
  tracking: buildTracking,
  reminder: buildReminder,
  cancelled: buildCancelled,
  quote: buildQuote,
};

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!POSTMARK_API_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "POSTMARK_API_TOKEN not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { type, brand: brandKey, data } = payload;
  const builder = BUILDERS[type];
  if (!builder) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown type: " + type }) };
  }

  const brand = brandOf(brandKey);
  const d = data || {};
  const { subject, html } = builder(brand, d);

  const isAlert = type === "alert";
  const to = isAlert ? ALERT_EMAIL : d.customer_email;
  if (!to) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing recipient email" }) };
  }

  const replyTo = isAlert ? (d.customer_email || undefined) : ALERT_EMAIL;

  const message = {
    From: `${brand.name} <${FROM_ADDRESS}>`,
    To: to,
    ReplyTo: replyTo,
    Subject: subject,
    HtmlBody: html,
    MessageStream: "outbound",
    Tag: `${brandKey || "BRL"}-${type}`,
  };

  try {
    const resp = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_API_TOKEN,
      },
      body: JSON.stringify(message),
    });
    const result = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: result.Message || "Postmark error", details: result }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, messageId: result.MessageID }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
