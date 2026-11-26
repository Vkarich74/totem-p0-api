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
  const ids=value.map(id);
  return new Set(ids).size===ids.length?ids:null;
}
function exactRows(rows,ids){
  return Array.isArray(rows)&&Array.isArray(ids)&&rows.length===ids.length&&
    new Set(rows.map(x=>id(x?.id))).size===ids.length&&rows.every(x=>ids.includes(id(x?.id)));
}
function dayUTC(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ?
    day : null;
}
// USD amounts are compared in minor units, not against a Core tariff.
// Reject non-numeric, non-cent-precision and unsafe amounts.
function cents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value * 100);
  return Number.isSafeInteger(n) && Math.abs(value * 100 - n) < 0.000001 ? n : null;
}
function positiveMoney(value) {
  const n = cents(value);
  return n !== null && n > 0;
}
function exactSingleId(value, expected) {
  const ids = manyIds(value);
  return ids?.length === 1 && ids[0] === expected;
}
// The service interval comes from Odoo's invoice lines, under an explicitly
// approved mapping. No inferred first-of-month or rolling-month assumption.
function sameCommercialLine(line, orderLine, currencyId) {
  return !!orderLine && id(line.product_id) === id(orderLine.product_id) &&
    id(line.currency_id) === currencyId && id(orderLine.currency_id) === currencyId &&
    id(line.product_uom_id) > 0 && id(line.product_uom_id) === id(orderLine.product_uom_id) &&
    typeof line.quantity === "number" && line.quantity > 0 &&
    line.quantity === orderLine.product_uom_qty &&
    typeof line.price_unit === "number" && Number.isFinite(line.price_unit) &&
    line.price_unit === orderLine.price_unit &&
    typeof line.discount === "number" && Number.isFinite(line.discount) &&
    line.discount >= 0 && line.discount < 100 && line.discount === orderLine.discount &&
    positiveMoney(line.price_subtotal) &&
    cents(line.price_subtotal) === cents(orderLine.price_subtotal);
}
// Conservative v2 scope: only fully attributable inbound cash for this invoice.
// Mixed-invoice payments, split tenders, child operations, credit-note/write-off
// settlements are not presumed equivalent to full payment.
function exactInvoiceCash(rows, invoice, partnerId, currencyId, channel) {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  const p = rows[0], invoiceId = id(invoice.id);
  if (!id(p.id) || id(p.company_id) !== COMPANY_ID ||
      id(p.partner_id) !== partnerId || id(p.currency_id) !== currencyId ||
      !exactSingleId(p.invoice_ids, invoiceId) ||
      !positiveMoney(p.amount) || cents(p.amount) !== cents(invoice.amount_total)) return false;
  if (channel === "manual") {
    return exactSingleId(invoice.payment_ids, id(p.id)) &&
      ["paid","reconciled"].includes(p.state) && p.payment_type === "inbound";
  }
  return p.state === "done" &&
    ["online_redirect","online_direct","online_token","offline"].includes(p.operation) &&
    p.source_transaction_id === false && Array.isArray(p.child_transaction_ids) &&
    p.child_transaction_ids.length === 0;
}
function WAIT(reason) {
  return Object.freeze({ status: "WAIT", canActivate: false, reason });
}
function validPolicy(p) {
  // "approved" is a commercial owner decision. Source code must not assert it.
  return p?.approved === true &&
    typeof p.version === "string" && /^[a-zA-Z0-9_.-]{1,40}$/.test(p.version) &&
    p.companyId === COMPANY_ID && p.websiteId === WEBSITE_ID &&
    p.planId === 6 && p.productTemplateId === 29 && p.currencyId === 1 &&
    ["week", "month", "year"].includes(p.billingPeriodUnit) &&
    Number.isSafeInteger(p.billingPeriodValue) && p.billingPeriodValue > 0 &&
    ["manual", "online"].includes(p.paymentChannel);
}
// Shared validation for activation, reconciliation and runtime gates. The
// existing approved Odoo IDs are scope, not a Core price list.
export function isUsOdooServicePeriodPolicy(p) {
  return validPolicy(p) && p.allowDeferredRevenuePeriod === true &&
    p.periodSource === "odoo_invoice_line_service_dates_v2";
}
async function one(client, model, entityId, fields) {
  const rows = await client.searchRead(model, [["id", "=", entityId]], fields, 2);
  return rows.length === 1 && id(rows[0].id) === entityId ? rows[0] : null;
}
function signedAndCurrentPeriod(line, order, clock, policy) {
  const start = dayUTC(line.deferred_start_date);
  const lastDay = dayUTC(line.deferred_end_date);
  const orderStart = dayUTC(order.start_date);
  if (!start || !lastDay || !orderStart) return null;
  const end = new Date(lastDay.getTime() + 86400000);
  if (!Number.isFinite(end.getTime()) || start < orderStart || start >= end) return null;
  // Sanity bound derived from the approved Odoo plan. It does not calculate
  // a renewal date or require a particular day of the calendar month.
  const daysPerUnit = {week:7, month:31, year:366}[policy.billingPeriodUnit];
  const maxDays = daysPerUnit * policy.billingPeriodValue;
  if (!Number.isSafeInteger(maxDays) ||
      (end.getTime() - start.getTime()) / 86400000 > maxDays) return null;
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
  if (!isUsOdooServicePeriodPolicy(policy)) {
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
        order.payment_exception !== false || order.pending_transaction !== false ||
        id(order.plan_id) !== policy.planId || id(order.currency_id) !== policy.currencyId) {
      return WAIT("ODOO_SUBSCRIPTION_NOT_ELIGIBLE");
    }

    const plan = await one(client, "sale.subscription.plan", policy.planId,
      ["id", "company_id", "billing_period_unit", "billing_period_value"]);
    if (!plan || id(plan.company_id) !== COMPANY_ID ||
        plan.billing_period_unit !== policy.billingPeriodUnit ||
        plan.billing_period_value !== policy.billingPeriodValue) {
      return WAIT("ODOO_PLAN_SCOPE_OR_PERIOD_MISMATCH");
    }

    const orderLineIds = manyIds(order.order_line);
    if (!orderLineIds?.length || orderLineIds.length > MAX_LINKS) {
      return WAIT("ODOO_ORDER_LINES_MISSING");
    }
    const orderLines = await read("sale.order.line", [
      ["id", "in", orderLineIds],
    ], ["id", "company_id", "order_id", "product_id",
        "recurring_invoice", "price_unit", "price_subtotal", "discount",
        "product_uom_qty", "product_uom_id", "currency_id"], MAX_LINKS);
    if (!exactRows(orderLines,orderLineIds)) {
      return WAIT("ODOO_ORDER_LINES_INCOMPLETE");
    }
    // V05: validate every returned order line before selecting a product.
    // The supported paid evidence is a single recurring commercial line.
    // Do not silently discard foreign, unrelated or unsupported rows.
    if (!orderLines.every(line =>
        id(line.company_id) === COMPANY_ID &&
        id(line.order_id) === orderId &&
        id(line.currency_id) === policy.currencyId)) {
      return WAIT("ODOO_ORDER_LINE_SCOPE_MISMATCH");
    }
    if (orderLines.length !== 1) {
      return WAIT("ODOO_ORDER_COMPOSITION_UNSUPPORTED");
    }
    const recurring = orderLines.filter(line =>
      orderLineIds.includes(id(line.id)) &&
      id(line.company_id) === COMPANY_ID && id(line.order_id) === orderId &&
      id(line.product_id) > 0 && line.recurring_invoice === true &&
      typeof line.price_unit === "number" && Number.isFinite(line.price_unit) &&
      line.price_unit > 0 && positiveMoney(line.price_subtotal) &&
      id(line.currency_id) === policy.currencyId);
    if (recurring.length !== orderLines.length)
      return WAIT("ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED");
    const soleLine = recurring[0];
    if (typeof soleLine.product_uom_qty !== "number" ||
        !Number.isFinite(soleLine.product_uom_qty) ||
        soleLine.product_uom_qty <= 0 || !id(soleLine.product_uom_id) ||
        typeof soleLine.discount !== "number" ||
        !Number.isFinite(soleLine.discount) ||
        soleLine.discount < 0 || soleLine.discount >= 100) {
      return WAIT("ODOO_ORDER_COMPOSITION_UNSUPPORTED");
    }

    const variantIds = [...new Set(recurring.map(line => id(line.product_id)))];
    const variants = await read("product.product", [
      ["id", "in", variantIds],
    ], ["id", "company_id", "product_tmpl_id", "recurring_invoice"], MAX_LINKS);
    if(!exactRows(variants,variantIds))return WAIT("ODOO_PRODUCT_READBACK_INCOMPLETE");
    const validVariants = new Set(variants.filter(v =>
      variantIds.includes(id(v.id)) &&
      (v.company_id === false || id(v.company_id) === COMPANY_ID) &&
      id(v.product_tmpl_id) === policy.productTemplateId &&
      v.recurring_invoice === true).map(v => id(v.id)));
    const validOrderLines = new Map(recurring.filter(line =>
      validVariants.has(id(line.product_id))).map(line => [id(line.id), line]));
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
    if (!exactRows(invoices,invoiceIds)) {
      return WAIT("ODOO_INVOICE_READBACK_INCOMPLETE");
    }

    let settled = false;
    let covered = false;
    const currentProofs = new Map();
    const candidates=[];
    // Validate every invoice scope first. Then coalesce independent reads
    // across all qualifying invoices; the ordinary client remains sequential.
    const readMany=async queries=>{
      if(typeof client.searchReadMany==="function")return client.searchReadMany(queries);
      const results=[];for(const q of queries)results.push(await read(...q));return results;
    };
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
          !positiveMoney(invoice.amount_total) || cents(invoice.amount_residual) !== 0) continue;
      settled = true;
      const reversals=manyIds(invoice.reversal_move_ids);
      if(!reversals)return WAIT("ODOO_REVERSAL_LINKS_INVALID");
      if(reversals.length)return WAIT("ODOO_INVOICE_REVERSED");
      candidates.push({invoice,invoiceId,lineIds:manyIds(invoice.invoice_line_ids)});
    }
    const refundQueries=candidates.map(({invoiceId})=>["account.move",[
        ["reversed_entry_id","=",invoiceId],["move_type","=","out_refund"],
        ["state","=","posted"],["company_id","=",COMPANY_ID],
      ],["id","company_id","reversed_entry_id","state"],MAX_LINKS]);
    const withLines=candidates.filter(x=>x.lineIds?.length&&x.lineIds.length<=MAX_LINKS);
    const lineQueries=withLines.map(({lineIds})=>["account.move.line",[
        ["id","in",lineIds],
      ],["id","move_id","company_id","product_id","subscription_id","sale_line_ids",
        "deferred_start_date","deferred_end_date","price_subtotal","price_unit",
        "discount","quantity","product_uom_id","currency_id"],MAX_LINKS]);
    const dependencies=await readMany([...refundQueries,...lineQueries]);
    if (!Array.isArray(dependencies) || dependencies.length !== refundQueries.length + lineQueries.length ||
        dependencies.some(rows => !Array.isArray(rows))) return WAIT("ODOO_DEPENDENCY_READBACK_INCOMPLETE");
    if(dependencies.slice(0,refundQueries.length).some(rows=>rows.length))return WAIT("ODOO_INVOICE_REVERSED");
    const payable=[];
    for(let i=0;i<withLines.length;i++){
      const {invoice,invoiceId,lineIds}=withLines[i];
      const lines=dependencies[refundQueries.length+i];
      if(!exactRows(lines,lineIds))return WAIT("ODOO_INVOICE_LINES_INCOMPLETE");
      const linked=lines.filter(line=>
        lineIds.includes(id(line.id))&&id(line.move_id)===invoiceId&&
        id(line.company_id)===COMPANY_ID&&validVariants.has(id(line.product_id))&&
        positiveMoney(line.price_subtotal)&&
        id(line.subscription_id)===orderId&&
        manyIds(line.sale_line_ids)?.some(item=>validOrderLines.has(item)));
      if(!linked.length)continue;
      // Historical paid invoices still require refund and scope checks above,
      // but cannot prove today's access. Payment confirmation is needed to
      // distinguish a valid expired period from unverified payment.
      const paymentIds=manyIds(invoice.payment_ids);
      if(policy.paymentChannel==="manual"&&(!paymentIds?.length||paymentIds.length>MAX_LINKS))continue;
      payable.push({invoiceId,linked,paymentIds});
    }
    const paymentQueries=payable.map(({invoiceId,paymentIds})=>policy.paymentChannel==="manual"?
      ["account.payment",[["id","in",paymentIds]],["id","state","company_id","partner_id","currency_id","payment_type","invoice_ids","amount"],MAX_LINKS]:
      ["payment.transaction",[["invoice_ids","in",[invoiceId]]],["id","state","company_id","partner_id","currency_id","invoice_ids","amount","operation","source_transaction_id","child_transaction_ids"],MAX_LINKS]);
    const paymentResults=await readMany(paymentQueries);
    if (!Array.isArray(paymentResults) || paymentResults.length !== payable.length ||
        paymentResults.some(rows => !Array.isArray(rows))) return WAIT("ODOO_PAYMENT_READBACK_INCOMPLETE");
    for(let i=0;i<payable.length;i++){
      const {invoiceId,linked}=payable[i],rows=paymentResults[i];
      const invoice = invoices.find(x => id(x.id) === invoiceId);
      if (!exactInvoiceCash(rows, invoice, partnerId, policy.currencyId, policy.paymentChannel)) continue;
      for(const line of linked){
        const interval=signedAndCurrentPeriod(line,order,clock,policy);
        if(!interval)continue;
        covered=true;if(!interval.current)continue;
        // Never grant against a partial, substituted or ambiguous recurring line.
        // Historic invoice prices can differ after a legitimate tariff change.
        const sourceIds = manyIds(line.sale_line_ids);
        const sourceLine = sourceIds?.length === 1 ? validOrderLines.get(sourceIds[0]) : null;
        if (validOrderLines.size !== 1 || linked.length !== 1 ||
            !exactSingleId(invoice.invoice_line_ids, id(line.id)) ||
            !sameCommercialLine(line, sourceLine, policy.currencyId) ||
            cents(line.price_subtotal) > cents(invoice.amount_total)) {
          return WAIT("ODOO_CURRENT_COMMERCIAL_LINE_UNVERIFIED");
        }
        currentProofs.set(invoiceId,Object.freeze({
          status:"PAID_VERIFIED",canActivate:true,companyId:COMPANY_ID,websiteId:WEBSITE_ID,
          partnerId,subscriptionOrderId:orderId,invoiceId,
          periodStartUtc:interval.start.toISOString(),periodEndExclusiveUtc:interval.end.toISOString(),
          commercialPolicyVersion:policy.version,
          evidence:"posted_paid_invoice_exact_order_line_cash_approved_service_dates_v2",
        }));
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
