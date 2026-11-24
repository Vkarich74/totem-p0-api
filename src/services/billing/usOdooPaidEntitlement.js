// G5-T2: read-only Odoo US subscription evidence, NEVER an activation endpoint.
// NOT wired to Admin, payments, Gmail, Core writes, or frozen CRM14.
// A "paid" notification is a wake-up hint, NOT an entitlement decision.
const COMPANY_ID = 4;
const WEBSITE_ID = 5;
const MAX_LINKS = 100;

function id(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
}
function manyIds(value) {
  if (value === false || value == null) return [];
  if (!Array.isArray(value) || value.some(v => !id(v))) return null;
  return [...new Set(value.map(id))];
}
function dayUTC(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ?
    day : null;
}
function firstDayOfNextMonth(day) {
  if (day.getUTCDate() !== 1) return null;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
}
function WAIT(reason) {
  return Object.freeze({ status: "WAIT", canActivate: false, reason });
}
function validPolicy(p) {
  // "approved" is a commercial owner decision. Source code must not assert it.
  return p?.approved === true &&
    typeof p.version === "string" && /^[a-zA-Z0-9_.-]{1,40}$/.test(p.version) &&
    p.companyId === COMPANY_ID && p.websiteId === WEBSITE_ID &&
    Number.isSafeInteger(p.planId) && p.planId > 0 &&
    Number.isSafeInteger(p.productTemplateId) && p.productTemplateId > 0 &&
    Number.isSafeInteger(p.currencyId) && p.currencyId > 0 &&
    p.billingPeriodUnit === "month" && p.billingPeriodValue === 1 &&
    ["manual", "online"].includes(p.paymentChannel);
}
async function one(client, model, entityId, fields) {
  const rows = await client.searchRead(model, [["id", "=", entityId]], fields, 2);
  return rows.length === 1 && id(rows[0].id) === entityId ? rows[0] : null;
}
function signedAndCurrentPeriod(line, order, clock) {
  const start = dayUTC(line.deferred_start_date);
  const lastDay = dayUTC(line.deferred_end_date);
  const orderStart = dayUTC(order.start_date);
  if (!start || !lastDay || !orderStart) return null;
  const end = firstDayOfNextMonth(start);
  if (!end || start < orderStart || lastDay.getTime() + 86400000 !== end.getTime()) {
    return null;
  }
  return { start, end, current: start <= clock && clock < end };
}

export function parseUsOdooBillingHint(event) {
  if (!event || typeof event !== "object" || Array.isArray(event) ||
      id(event.company_id) !== COMPANY_ID || !id(event.subscription_order_id)) {
    throw new Error("US_ODOO_BILLING_HINT_INVALID");
  }
  // A forged event.status, amount, or paid_until NEVER becomes authorization.
  return Object.freeze({
    needsReadback: true,
    companyId: COMPANY_ID,
    subscriptionOrderId: id(event.subscription_order_id),
  });
}

export async function verifyUsOdooPaidEntitlement({
  client, sourcePartnerId, subscriptionOrderId, policy, now = new Date(),
} = {}) {
  const partnerId = id(sourcePartnerId);
  const orderId = id(subscriptionOrderId);
  const clock = new Date(now);
  if (!client || typeof client.searchRead !== "function") {
    return WAIT("ODOO_READBACK_CLIENT_REQUIRED");
  }
  if (!partnerId || !orderId || !Number.isFinite(clock.getTime())) {
    return WAIT("ODOO_VERIFIED_SOURCE_REQUIRED");
  }
  if (!validPolicy(policy)) return WAIT("ODOO_COMMERCIAL_POLICY_UNAPPROVED");
  // Odoo metadata does NOT establish that deferred accounting dates are
  // service-period bounds. The owner must approve this mapping explicitly.
  if (policy.allowDeferredRevenuePeriod !== true) {
    return WAIT("ODOO_PERIOD_MAPPING_UNAPPROVED");
  }

  const read = client.searchRead.bind(client);
  try {
    const order = await one(client, "sale.order", orderId, [
      "id", "company_id", "website_id", "partner_id", "currency_id",
      "is_subscription", "state", "subscription_state", "plan_id",
      "order_line", "invoice_ids", "payment_exception", "pending_transaction",
      "subscription_id", "start_date", "end_date", "next_invoice_date",
    ]);
    if (!order || id(order.company_id) !== COMPANY_ID ||
        id(order.website_id) !== WEBSITE_ID || id(order.partner_id) !== partnerId) {
      return WAIT("ODOO_SUBSCRIPTION_SCOPE_MISMATCH");
    }
    if (order.state !== "sale" || order.is_subscription !== true ||
        order.subscription_state !== "3_progress" ||
        order.payment_exception === true || order.pending_transaction === true ||
        id(order.plan_id) !== policy.planId || id(order.currency_id) !== policy.currencyId) {
      return WAIT("ODOO_SUBSCRIPTION_NOT_ELIGIBLE");
    }

    const plan = await one(client, "sale.subscription.plan", policy.planId,
      ["id", "company_id", "billing_period_unit", "billing_period_value"]);
    if (!plan || id(plan.company_id) !== COMPANY_ID ||
        plan.billing_period_unit !== "month" || plan.billing_period_value !== 1) {
      return WAIT("ODOO_PLAN_SCOPE_OR_PERIOD_MISMATCH");
    }

    const orderLineIds = manyIds(order.order_line);
    if (!orderLineIds?.length || orderLineIds.length > MAX_LINKS) {
      return WAIT("ODOO_ORDER_LINES_MISSING");
    }
    const orderLines = await read("sale.order.line", [
      ["id", "in", orderLineIds],
    ], ["id", "company_id", "order_id", "product_id",
        "recurring_invoice", "price_unit"], MAX_LINKS);
    if (orderLines.length !== orderLineIds.length) {
      return WAIT("ODOO_ORDER_LINES_INCOMPLETE");
    }
    const recurring = orderLines.filter(line =>
      orderLineIds.includes(id(line.id)) &&
      id(line.company_id) === COMPANY_ID && id(line.order_id) === orderId &&
      id(line.product_id) > 0 && line.recurring_invoice === true &&
      Number.isFinite(Number(line.price_unit)) && Number(line.price_unit) > 0);
    if (!recurring.length) return WAIT("ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED");

    const variantIds = [...new Set(recurring.map(line => id(line.product_id)))];
    const variants = await read("product.product", [
      ["id", "in", variantIds],
    ], ["id", "company_id", "product_tmpl_id", "recurring_invoice"], MAX_LINKS);
    const validVariants = new Set(variants.filter(v =>
      variantIds.includes(id(v.id)) &&
      (v.company_id === false || id(v.company_id) === COMPANY_ID) &&
      id(v.product_tmpl_id) === policy.productTemplateId &&
      v.recurring_invoice === true).map(v => id(v.id)));
    const validOrderLines = new Set(recurring.filter(line =>
      validVariants.has(id(line.product_id))).map(line => id(line.id)));
    if (!validOrderLines.size) return WAIT("ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED");

    const invoiceIds = manyIds(order.invoice_ids);
    if (!invoiceIds?.length || invoiceIds.length > MAX_LINKS) {
      return WAIT("ODOO_INVOICES_MISSING");
    }
    const invoices = await read("account.move", [
      ["id", "in", invoiceIds],
    ], ["id", "company_id", "partner_id", "currency_id", "move_type",
        "state", "payment_state", "amount_total", "amount_residual",
        "invoice_date", "invoice_line_ids", "payment_ids", "reversal_move_ids"], MAX_LINKS);
    if (invoices.length !== invoiceIds.length) {
      return WAIT("ODOO_INVOICE_READBACK_INCOMPLETE");
    }

    let settled = false;
    let covered = false;
    const currentProofs = new Map();
    for (const invoice of invoices) {
      const invoiceId = id(invoice.id);
      if (!invoiceIds.includes(invoiceId)) return WAIT("ODOO_INVOICE_READBACK_MISMATCH");
      if (id(invoice.company_id) !== COMPANY_ID ||
          id(invoice.partner_id) !== partnerId ||
          id(invoice.currency_id) !== policy.currencyId) {
        return WAIT("ODOO_INVOICE_SCOPE_MISMATCH");
      }
      if (invoice.move_type !== "out_invoice" || invoice.state !== "posted" ||
          invoice.payment_state !== "paid" ||
          !(Number(invoice.amount_total) > 0) ||
          !Number.isFinite(Number(invoice.amount_residual)) ||
          Math.abs(Number(invoice.amount_residual)) > 0.0001) continue;
      settled = true;
      if (!manyIds(invoice.reversal_move_ids)) {
        return WAIT("ODOO_REVERSAL_LINKS_INVALID");
      }
      if (manyIds(invoice.reversal_move_ids).length) {
        return WAIT("ODOO_INVOICE_REVERSED");
      }
      const refunds = await read("account.move", [
        ["reversed_entry_id", "=", invoiceId],
        ["move_type", "=", "out_refund"],
        ["state", "=", "posted"],
        ["company_id", "=", COMPANY_ID],
      ], ["id", "company_id", "reversed_entry_id", "state"], MAX_LINKS);
      if (refunds.length) return WAIT("ODOO_INVOICE_REVERSED");

      const lineIds = manyIds(invoice.invoice_line_ids);
      if (!lineIds?.length || lineIds.length > MAX_LINKS) continue;
      const lines = await read("account.move.line", [
        ["id", "in", lineIds],
      ], ["id", "move_id", "company_id", "product_id",
          "subscription_id", "sale_line_ids",
          "deferred_start_date", "deferred_end_date", "price_subtotal"], MAX_LINKS);
      if (lines.length !== lineIds.length) return WAIT("ODOO_INVOICE_LINES_INCOMPLETE");
      const linked = lines.filter(line =>
        lineIds.includes(id(line.id)) &&
        id(line.move_id) === invoiceId && id(line.company_id) === COMPANY_ID &&
        validVariants.has(id(line.product_id)) &&
        Number.isFinite(Number(line.price_subtotal)) && Number(line.price_subtotal) > 0 &&
        id(line.subscription_id) === orderId &&
        manyIds(line.sale_line_ids)?.some(item => validOrderLines.has(item)));
      if (!linked.length) continue;

      let validPayment = false;
      if (policy.paymentChannel === "manual") {
        const paymentIds = manyIds(invoice.payment_ids);
        if (!paymentIds?.length || paymentIds.length > MAX_LINKS) continue;
        const payments = await read("account.payment", [
          ["id", "in", paymentIds],
        ], ["id", "state", "company_id", "partner_id", "currency_id",
            "payment_type", "invoice_ids"], MAX_LINKS);
        validPayment = payments.some(p =>
          paymentIds.includes(id(p.id)) &&
          ["paid", "reconciled"].includes(p.state) &&
          p.payment_type === "inbound" &&
          id(p.company_id) === COMPANY_ID && id(p.partner_id) === partnerId &&
          id(p.currency_id) === policy.currencyId &&
          manyIds(p.invoice_ids)?.includes(invoiceId));
      } else {
        const transactions = await read("payment.transaction", [
          ["invoice_ids", "in", [invoiceId]],
        ], ["id", "state", "company_id", "partner_id",
            "currency_id", "invoice_ids"], MAX_LINKS);
        validPayment = transactions.some(tx =>
          tx.state === "done" && id(tx.company_id) === COMPANY_ID &&
          id(tx.partner_id) === partnerId &&
          id(tx.currency_id) === policy.currencyId &&
          manyIds(tx.invoice_ids)?.includes(invoiceId));
      }
      if (!validPayment) continue;

      for (const line of linked) {
        const interval = signedAndCurrentPeriod(line, order, clock);
        if (!interval) continue;
        covered = true;
        if (!interval.current) continue;
        const proof = Object.freeze({
          status: "PAID_VERIFIED", canActivate: true,
          companyId: COMPANY_ID, websiteId: WEBSITE_ID, partnerId,
          subscriptionOrderId: orderId, invoiceId,
          periodStartUtc: interval.start.toISOString(),
          periodEndExclusiveUtc: interval.end.toISOString(),
          commercialPolicyVersion: policy.version,
          evidence: "posted_paid_invoice_linked_line_approved_deferred_period",
        });
        currentProofs.set(invoiceId,proof);
      }
    }
    // Do not let the ordering of invoices hide a later linked reversal,
    // scope mismatch or a second current invoice. One unique current invoice
    // is required; ambiguous current invoices fail closed without revocation.
    if (currentProofs.size > 1) return WAIT("ODOO_MULTIPLE_CURRENT_PAID_INVOICES");
    if (currentProofs.size === 1) return [...currentProofs.values()][0];
    if (!settled) return WAIT("ODOO_PAID_INVOICE_NOT_FOUND");
    if (!covered) return WAIT("ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
    return WAIT("ODOO_PAID_PERIOD_NOT_CURRENT");
  } catch {
    return WAIT("ODOO_READBACK_UNAVAILABLE");
  }
}
