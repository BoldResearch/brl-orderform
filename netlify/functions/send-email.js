// /netlify/functions/send-email.js
//
// Single endpoint for all BRL + SB transactional email.
// Template style: dark branded header/footer, white body card, light gray info boxes.
//
// Requires env var RESEND_API_KEY set in Netlify: Project configuration > Environment variables.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = "boldresearchlabs.orders@gmail.com";

const BRANDS = {
  BRL: {
    name: "Bold Research Labs",
    accent: "#d4af37",   // gold — used on dark bg (wordmark dot, CTA text)
    rgbAccent: "212,175,55",
    tintBg: "#fdf6e3",   // pale gold — highlight box background
    tintText: "#5c4813", // readable dark gold — highlight box text
    orderFormUrl: "https://brl-orderform.netlify.app/",
    fromAddress: "orders@brlpeptides.com",
  },
  SB: {
    name: "SB Peptides",
    accent: "#c8f000",   // lime — used on dark bg
    rgbAccent: "200,240,0",
    tintBg: "#f0ffe0",   // pale lime
    tintText: "#3a5200", // readable dark green
    orderFormUrl: "https://sb-orderform.netlify.app/",
    fromAddress: "sb.orders@brlpeptides.com",
  },
};

function brandOf(key) {
  return BRANDS[key] === undefined ? BRANDS.BRL : BRANDS[key];
}

function esc(v) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(v) {
  if (v === undefined || v === null) return "0.00";
  const s = String(v).replace(/[^0-9.\-]/g, "");
  return s || "0.00";
}

// ── LAYOUT ──
function wrapEmail(brand, subtitle, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f3ef;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#0f0f0f;border-radius:12px 12px 0 0;padding:28px 32px;">
      <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">${esc(brand.name)}<span style="color:${brand.accent};">.</span></div>
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:4px;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;">${esc(subtitle)}</div>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e0d8;border-top:none;">
      ${bodyHtml}
    </div>
    <div style="background:#0f0f0f;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
      <div style="font-size:10px;color:rgba(255,255,255,0.25);font-family:monospace;">${esc(brand.name)} &middot; boldresearchlabs.orders@gmail.com</div>
    </div>
  </div>
</body>
</html>`;
}

function card(innerHtml, marginBottom) {
  const mb = marginBottom === undefined ? 20 : marginBottom;
  return `<div style="background:#f7f6f2;border-radius:10px;padding:16px 18px;margin-bottom:${mb}px;">${innerHtml}</div>`;
}

function fieldLabel(text) {
  return `<div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;font-family:monospace;">${esc(text)}</div>`;
}

function orderNumberCard(orderNumber, subtext) {
  return card(`
    ${fieldLabel("Order Number")}
    <div style="font-size:20px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(orderNumber)}</div>
    ${subtext ? `<div style="font-size:12px;color:#888;margin-top:4px;">${esc(subtext)}</div>` : ""}
  `);
}

function lineRow(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;">
    <span style="font-size:12px;color:#888;">${esc(label)}</span>
    <span style="font-size:13px;color:#0f0f0f;text-align:right;">${esc(value)}</span>
  </div>`;
}

function amberBox(html, marginBottom) {
  const mb = marginBottom === undefined ? 20 : marginBottom;
  return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:${mb}px;font-size:13px;color:#b45309;line-height:1.6;">${html}</div>`;
}

function highlightBox(brand, title, bodyHtml, ctaLabel, ctaUrl) {
  return `<div style="background:${brand.tintBg};border:1px solid ${brand.accent};border-radius:10px;padding:16px 18px;margin-bottom:20px;">
    <div style="font-size:13px;font-weight:bold;color:${brand.tintText};margin-bottom:8px;">${esc(title)}</div>
    <div style="font-size:13px;color:${brand.tintText};line-height:1.6;${ctaLabel ? "margin-bottom:14px;" : ""}">${bodyHtml}</div>
    ${ctaLabel ? `<div style="text-align:center;"><a style="display:inline-block;padding:12px 28px;background:#0f0f0f;color:${brand.accent};font-family:monospace;font-size:13px;font-weight:bold;text-decoration:none;border-radius:8px;letter-spacing:.05em;" href="${esc(ctaUrl)}" target="_blank" rel="noopener">&nbsp;${esc(ctaLabel)}&nbsp;</a></div>` : ""}
  </div>`;
}

// ── EMAIL BUILDERS ──

function buildConfirmation(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Your order has been received! Here's everything you need.</div>`;

  const orderCard = card(`
    ${fieldLabel("Order Number")}
    <div style="font-size:22px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(d.order_number)}</div>
  `, 14);

  const itemsCard = card(`
    ${fieldLabel("Items Ordered")}
    <div style="font-size:13px;color:#0f0f0f;line-height:1.8;margin-bottom:12px;">${esc(d.items_summary)}</div>
    ${d.subtotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">Subtotal</span><span style="font-weight:500;">${esc(d.subtotal)}</span></div>` : ""}
    ${d.discount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">Discount</span><span style="font-weight:500;">${esc(d.discount)}</span></div>` : ""}
    ${d.shipping ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">Shipping</span><span style="font-weight:500;">${esc(d.shipping)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0f0f0f;margin-top:4px;"><span>Total</span><span>${esc(d.total)}</span></div>
  `, 14);

  const shipCard = card(`
    ${fieldLabel("Shipping To")}
    <div style="font-size:13px;color:#0f0f0f;line-height:1.6;">${esc(d.shipping_address)}</div>
  `, 14);

  const paymentBox = `<div style="background:#0f0f0f;border-radius:10px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,0.35);margin-bottom:6px;font-family:monospace;">Send Payment To</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px;">via ${esc(d.payment_method)}</div>
    <div style="font-size:26px;font-weight:800;color:${brand.accent};font-family:monospace;">${esc(d.payment_handle)}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;">${esc(d.payment_instructions)}</div>
    <div style="margin-top:14px;padding:12px 16px;background:rgba(${brand.rgbAccent},0.08);border:1px solid rgba(${brand.rgbAccent},0.25);border-radius:8px;">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;font-family:monospace;text-transform:uppercase;letter-spacing:.06em;">⚠ Include in your payment note:</div>
      <div style="font-size:20px;font-weight:800;color:${brand.accent};font-family:monospace;">${esc(d.order_number)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:5px;line-height:1.5;">Adding your order number helps us match your payment instantly and process your order faster.</div>
    </div>
  </div>`;

  const nextBox = `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:13px 16px;margin-bottom:14px;">
    <div style="font-size:12px;color:#7b5800;line-height:1.7;">⏱ <strong>What happens next?</strong> Once we confirm your payment we'll process your order and send you a separate email with your tracking number. If you have any questions just reply to this email.</div>
  </div>`;

  const whitelistBox = `<div style="text-align:center;padding:10px 16px;background:#f7f6f2;border-radius:8px;margin-bottom:8px;">
    <div style="font-size:11px;color:#999;font-family:monospace;line-height:1.7;">To make sure our emails reach your inbox,<br>please add&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> to your contacts.</div>
  </div>`;

  return { subject: `Order Confirmed — ${d.order_number}`, html: wrapEmail(brand, "Order Confirmation", greeting + orderCard + itemsCard + shipCard + paymentBox + nextBox + whitelistBox) };
}

function buildAlert(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">🔔 New order placed &mdash; check the back office.</div>`;
  const orderCard = orderNumberCard(d.order_number, "Customer: " + (d.customer_name || ""));
  const detailsCard = card(`
    ${fieldLabel("Order Details")}
    ${lineRow("Customer email", d.customer_email_actual || d.customer_email)}
    ${lineRow("Items", d.items_summary)}
    ${lineRow("Payment method", d.payment_method)}
    ${lineRow("Notes", d.notes)}
    <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:6px;border-top:1px solid #e2e0d8;">
      <span style="font-size:13px;font-weight:bold;color:#0f0f0f;">TOTAL</span>
      <span style="font-size:15px;font-weight:800;color:#0f0f0f;font-family:monospace;">$${esc(fmtMoney(d.total))}</span>
    </div>
  `);
  return { subject: `🔔 New Order — ${d.order_number}`, html: wrapEmail(brand, "New Order Alert", greeting + orderCard + detailsCard) };
}

function buildTracking(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Great news &mdash; your order is on its way!</div>`;

  const orderCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px;">Order Number</div>
    <div style="font-size:18px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(d.order_number)}</div>
  `, 16);

  const trackingBox = `<div style="background:#0f0f0f;border-radius:10px;padding:20px 22px;margin-bottom:16px;text-align:center;">
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.4);margin-bottom:8px;">Tracking Number</div>
    <div style="font-size:26px;font-weight:800;color:${brand.accent};font-family:monospace;letter-spacing:.04em;">${esc(d.tracking_number)}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;">Tap the button below to track your package</div>
  </div>`;

  const trackButton = `<div style="text-align:center;margin-bottom:20px;">
    <a style="display:inline-block;padding:14px 36px;background:${brand.accent};color:#0f0f0f;font-weight:800;font-size:15px;border-radius:10px;text-decoration:none;font-family:'Segoe UI',sans-serif;letter-spacing:.04em;" href="${esc(d.tracking_url)}" target="_blank" rel="noopener">📦 Track Your Package &rarr;</a>
    <div style="font-size:11px;color:#999;margin-top:10px;font-family:monospace;">If the button doesn't work, tap this link:</div>
    <div style="margin-top:6px;"><a style="font-size:12px;color:#1a73e8;font-family:monospace;word-break:break-all;" href="${esc(d.tracking_url)}" target="_blank" rel="noopener">${esc(d.tracking_url)}</a></div>
  </div>`;

  const shipCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:10px;">Shipping To</div>
    <div style="font-size:13px;color:#0f0f0f;line-height:1.6;">${esc(d.shipping_address)}</div>
  `, 16);

  const itemsCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:10px;">Items</div>
    <div style="font-size:13px;color:#0f0f0f;line-height:1.8;">${esc(d.items_summary)}</div>
  `, 24);

  const noteBox = `<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:12px;color:#1b5e20;line-height:1.6;">📬 <strong>Tracking may take 24&ndash;48 hours</strong> to show activity after this notification. If you have any questions reply to this email.</div>
  </div>`;

  const whitelistBox = `<div style="text-align:center;padding:10px 16px;background:#f7f6f2;border-radius:8px;margin-bottom:8px;">
    <div style="font-size:11px;color:#999;font-family:monospace;line-height:1.7;">To make sure our emails reach your inbox,<br>please add&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> to your contacts.</div>
  </div>`;

  return { subject: `Shipped — Order ${d.order_number}`, html: wrapEmail(brand, "Your Order Has Shipped", greeting + orderCard + trackingBox + trackButton + shipCard + itemsCard + noteBox + whitelistBox) };
}

function buildReminder(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Just a friendly reminder that your order below is reserved and waiting for payment.</div>`;
  const orderCard = orderNumberCard(d.order_number);
  const warn = amberBox("⏰ Please note: orders that remain unpaid after 48 hours are automatically released so the items can return to stock.");
  const totalBox = card(`${fieldLabel("Order Total")}<div style="font-size:20px;font-weight:800;color:#0f0f0f;font-family:monospace;">$${esc(fmtMoney(d.total))}</div>`);
  const payments = card(`
    ${fieldLabel("Payment Options")}
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">CASHAPP</div><div style="font-size:14px;color:#0f0f0f;">$BoldResearch</div></div>
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">VENMO</div><div style="font-size:14px;color:#0f0f0f;">@Bold-Research-14</div></div>
    <div><div style="font-size:11px;font-weight:bold;color:#888;">PAYPAL</div><div style="font-size:14px;color:#0f0f0f;">@BrunoM64</div></div>
  `);
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">Once payment is sent, just reply to this email with your confirmation and we'll ship right away. Already paid? Just disregard this message.</div>`;
  return { subject: `Payment Reminder — Order ${d.order_number}`, html: wrapEmail(brand, "Payment Reminder", greeting + orderCard + warn + totalBox + payments + closing) };
}

function buildCancelled(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>We wanted to give you a quick update on your recent order.</div>`;
  const orderCard = orderNumberCard(d.order_number, "Placed on " + (d.order_date || ""));
  const explain = `<div style="font-size:14px;color:#0f0f0f;line-height:1.75;margin-bottom:20px;">We noticed this order hasn't been paid yet &mdash; no worries at all, these things happen! Since 48 hours have passed we've gone ahead and released those items back to our inventory so other customers can access them.</div>`;
  const highlight = highlightBox(
    brand,
    "Still interested? 👋",
    "Your favorites may still be available! Head back to our order form and place a new order &mdash; it only takes a minute. If you ran into any issues with payment or have questions, just reply to this email and we'll take care of you personally.",
    "View Order Form →",
    brand.orderFormUrl
  );
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">Thanks for being part of our community &mdash; we hope to see your order soon! 🙏</div>`;
  return { subject: `Order Cancelled — ${d.order_number}`, html: wrapEmail(brand, "Order Update", greeting + orderCard + explain + highlight + closing) };
}

function buildQuote(brand, d) {
  const greeting = `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Here's your order quote.</div>`;
  const orderCard = orderNumberCard(d.order_number);
  const itemsHtml = (d.items_table || "").split("\n").filter(Boolean).map(line =>
    `<div style="font-size:13px;color:#0f0f0f;padding:3px 0;">${esc(line)}</div>`
  ).join("");
  const itemsCard = card(`
    ${fieldLabel("Items")}
    ${itemsHtml}
    <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:10px;border-top:1px solid #e2e0d8;font-size:15px;font-weight:bold;">
      <span>Total</span><span style="font-family:monospace;">$${esc(fmtMoney(d.total))}</span>
    </div>
  `);
  const payments = card(`
    ${fieldLabel("Payment Options")}
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">CASHAPP</div><div style="font-size:14px;color:#0f0f0f;">$BoldResearch</div></div>
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">VENMO</div><div style="font-size:14px;color:#0f0f0f;">@Bold-Research-14</div></div>
    <div><div style="font-size:11px;font-weight:bold;color:#888;">PAYPAL</div><div style="font-size:14px;color:#0f0f0f;">@BrunoM64</div></div>
  `);
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">Once payment is sent, please reply to this email with your payment confirmation and shipping address and we'll get your order on its way.</div>`;
  return { subject: `Order Quote — ${d.order_number}`, html: wrapEmail(brand, "Order Quote", greeting + orderCard + itemsCard + payments + closing) };
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
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "RESEND_API_KEY not configured" }) };
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
    from: `${brand.name} <${brand.fromAddress}>`,
    to: [to],
    reply_to: replyTo,
    subject: subject,
    html: html,
    tags: [{ name: "category", value: `${brandKey || "BRL"}-${type}` }],
  };

  try {
    console.log("Sending via Resend:", JSON.stringify({ from: message.from, to: message.to, subject: message.subject }));
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    const result = await resp.json();
    console.log("Resend response:", resp.status, JSON.stringify(result));
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: result.message || "Resend error", details: result }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, messageId: result.id }) };
  } catch (e) {
    console.error("Send failed:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
