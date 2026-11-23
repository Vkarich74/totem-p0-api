// G5 T2: purely offline, no Odoo calls, no CRM, no payments or Core DB writes.
import test from "node:test";
import assert from "node:assert/strict";
import { parseUsOdooBillingHint, verifyUsOdooPaidEntitlement } from
  "../src/services/billing/usOdooPaidEntitlement.js";
import { createUsOdooReadOnlyClient } from
  "../src/services/billing/usOdooReadOnlyClient.js";

const rel = id => [id, "source metadata"];
const policy = Object.freeze({
  approved: true, version: "test_owner_approval_v1",
  companyId: 4, websiteId: 5,
  productTemplateId: 29, planId: 6, currencyId: 1,
  billingPeriodUnit: "month", billingPeriodValue: 1,
  allowDeferredRevenuePeriod: true, paymentChannel: "manual",
});
function fixture() {
  return {
    "sale.order": [{
      id: 101, company_id: rel(4), website_id: rel(5),
      partner_id: rel(41), currency_id: rel(1),
      is_subscription: true, state: "sale",
      subscription_state: "3_progress", plan_id: rel(6),
      payment_exception: false, pending_transaction: false,
      start_date: "2026-11-01", end_date: "2027-01-31",
      next_invoice_date: "2026-12-01", subscription_id: false,
      order_line: [201], invoice_ids: [401],
    }],
    "sale.subscription.plan": [{
      id: 6, company_id: rel(4),
      billing_period_unit: "month", billing_period_value: 1,
    }],
    "sale.order.line": [{
      id: 201, company_id: rel(4), order_id: rel(101),
      product_id: rel(301), recurring_invoice: true, price_unit: 100,
    }],
    "product.product": [{
      id: 301, company_id: rel(4),
      product_tmpl_id: rel(29), recurring_invoice: true,
    }],
    "account.move": [{
      id: 401, company_id: rel(4), partner_id: rel(41),
      currency_id: rel(1), move_type: "out_invoice",
      state: "posted", payment_state: "paid",
      amount_total: 100, amount_residual: 0,
      invoice_date: "2026-11-01", invoice_line_ids: [501],
      payment_ids: [601], reversal_move_ids: [],
    }],
    "account.move.line": [{
      id: 501, move_id: rel(401), company_id: rel(4),
      product_id: rel(301), subscription_id: rel(101),
      sale_line_ids: [201], deferred_start_date: "2026-11-01",
      deferred_end_date: "2026-11-30",
    }],
    "account.payment": [{
      id: 601, state: "paid", company_id: rel(4),
      partner_id: rel(41), currency_id: rel(1),
      payment_type: "inbound", invoice_ids: [401],
    }],
    "payment.transaction": [{
      id: 701, state: "done", company_id: rel(4),
      partner_id: rel(41), currency_id: rel(1), invoice_ids: [401],
    }],
    "posted_refunds": [],
  };
}
function mockClient(data, fail = false) {
  return {
    async searchRead(model, domain, fields, limit) {
      if (fail) throw Error("SECRET_EXTERNAL_ERROR_AND_CUSTOMER_DETAILS");
      if (model === "account.move" && domain.some(x =>
        x[0] === "reversed_entry_id")) {
        return data.posted_refunds.slice(0, limit);
      }
      let rows = data[model] || [];
      for (const [field, operation, value] of domain) {
        if (field === "id" && operation === "=") {
          rows = rows.filter(row => row.id === value);
        }
        if (field === "id" && operation === "in") {
          rows = rows.filter(row => value.includes(row.id));
        }
        if (field === "invoice_ids" && operation === "in") {
          rows = rows.filter(row => value.some(id => row.invoice_ids?.includes(id)));
        }
      }
      return rows.slice(0, limit).map(row =>
        Object.fromEntries(fields.map(field => [field, row[field] ?? false])));
    },
  };
}
function check(data = fixture(), policyChange = {}, failure = false,
  at = "2026-11-24T11:00:00.000Z") {
  return verifyUsOdooPaidEntitlement({
    client: mockClient(data, failure),
    sourcePartnerId: 41, subscriptionOrderId: 101,
    policy: { ...policy, ...policyChange }, now: at,
  });
}
async function denied(result, reason) {
  assert.equal(result.status, "WAIT");
  assert.equal(result.canActivate, false);
  if (reason) assert.equal(result.reason, reason);
}

test("manual accounting payment proves paid USD period only under approved policy", async () => {
  const result = await check();
  assert.equal(result.status, "PAID_VERIFIED");
  assert.equal(result.canActivate, true);
  assert.equal(result.subscriptionOrderId, 101);
  assert.equal(result.invoiceId, 401);
  assert.equal(result.periodStartUtc, "2026-11-01T00:00:00.000Z");
  assert.equal(result.periodEndExclusiveUtc, "2026-12-01T00:00:00.000Z");
});

test("missing commercial approval always denies, even if invoice paid", async () => {
  await denied(await check(fixture(), { approved: false }),
    "ODOO_COMMERCIAL_POLICY_UNAPPROVED");
});

test("accounting deferment dates are NOT silently accepted as SaaS paid dates", async () => {
  await denied(await check(fixture(), { allowDeferredRevenuePeriod: false }),
    "ODOO_PERIOD_MAPPING_UNAPPROVED");
});

test("not_paid / in_payment / partial / reversed never grant subscription", async () => {
  for (const state of ["not_paid", "in_payment", "partial", "reversed"]) {
    const d = fixture();
    d["account.move"][0].payment_state = state;
    await denied(await check(d), "ODOO_PAID_INVOICE_NOT_FOUND");
  }
});

test("different Odoo company / website / partner denied", async () => {
  for (const [field, foreign] of [
    ["company_id", rel(2)], ["website_id", rel(10)], ["partner_id", rel(99)],
  ]) {
    const d = fixture(); d["sale.order"][0][field] = foreign;
    await denied(await check(d), "ODOO_SUBSCRIPTION_SCOPE_MISMATCH");
  }
});

test("wrong plan, product template and invoice partner denied", async () => {
  const d1 = fixture(); d1["sale.order"][0].plan_id = rel(2);
  await denied(await check(d1), "ODOO_SUBSCRIPTION_NOT_ELIGIBLE");
  const d2 = fixture(); d2["product.product"][0].product_tmpl_id = rel(88);
  await denied(await check(d2), "ODOO_SUBSCRIPTION_PRODUCT_UNVERIFIED");
  const d3 = fixture(); d3["account.move"][0].partner_id = rel(99);
  await denied(await check(d3), "ODOO_INVOICE_SCOPE_MISMATCH");
});

test("invoice line must belong to the same order, SaaS product and invoice", async () => {
  for (const field of ["sale_line_ids","subscription_id","product_id","move_id"]) {
    const d = fixture();
    d["account.move.line"][0][field] = field === "sale_line_ids" ?
      [999] : rel(999);
    await denied(await check(d), "ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
  }
});

test("invoice_date, next_invoice_date and sale end_date do not invent coverage", async () => {
  const d = fixture();
  d["account.move.line"][0].deferred_start_date = false;
  d["account.move.line"][0].deferred_end_date = false;
  await denied(await check(d), "ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
});

test("manual payment must be inbound, linked and settled", async () => {
  const variants = [
    d => { d["account.move"][0].payment_ids = []; },
    d => { d["account.payment"][0].payment_type = "outbound"; },
    d => { d["account.payment"][0].state = "draft"; },
    d => { d["account.payment"][0].invoice_ids = [400]; },
  ];
  for (const change of variants) {
    const d = fixture(); change(d);
    await denied(await check(d), "ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
  }
});

test("online payment must have done transaction linked to same invoice", async () => {
  const paid = await check(fixture(), { paymentChannel: "online" });
  assert.equal(paid.status, "PAID_VERIFIED");
  for (const state of ["draft", "pending", "authorized", "cancel", "error"]) {
    const d = fixture();d["payment.transaction"][0].state = state;
    await denied(await check(d, { paymentChannel: "online" }),
      "ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
  }
});

test("posted reversal / credit note revokes verified paid access", async () => {
  const d1 = fixture();
  d1["account.move"][0].reversal_move_ids = [909];
  await denied(await check(d1), "ODOO_INVOICE_REVERSED");
  const d2 = fixture();
  d2.posted_refunds = [{ id: 909, company_id: rel(4),
    state: "posted", reversed_entry_id: rel(401) }];
  await denied(await check(d2), "ODOO_INVOICE_REVERSED");
});

test("PAID at exact UTC exclusive cutoff is expired", async () => {
  await denied(await check(fixture(), {}, false,
    "2026-12-01T00:00:00.000Z"), "ODOO_PAID_PERIOD_NOT_CURRENT");
});

test("future period, invalid calendar period and wrong plan dates cannot grant", async () => {
  await denied(await check(fixture(), {}, false,
    "2026-10-31T23:59:59.000Z"), "ODOO_PAID_PERIOD_NOT_CURRENT");
  const d = fixture();
  d["account.move.line"][0].deferred_end_date = "2026-12-15";
  await denied(await check(d), "ODOO_PAYMENT_OR_PERIOD_UNVERIFIED");
});

test("paused / churned / renewed parent / payment exception cannot grant", async () => {
  for (const state of ["4_paused","6_churn","5_renewed"]) {
    const d=fixture();d["sale.order"][0].subscription_state=state;
    await denied(await check(d), "ODOO_SUBSCRIPTION_NOT_ELIGIBLE");
  }
  const d=fixture();d["sale.order"][0].payment_exception=true;
  await denied(await check(d), "ODOO_SUBSCRIPTION_NOT_ELIGIBLE");
});

test("Odoo readback outage fails closed without leaking raw RPC error", async () => {
  const result = await check(fixture(), {}, true);
  await denied(result,"ODOO_READBACK_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("CUSTOMER_DETAILS"),false);
});

test("untrusted Odoo hint is NEVER itself an activation instruction", () => {
  const hint=parseUsOdooBillingHint({
    company_id:4,subscription_order_id:101,
    status:"paid",paid_until:"2099-01-01",canActivate:true,
  });
  assert.deepEqual(Object.keys(hint).sort(),
    ["companyId","needsReadback","subscriptionOrderId"].sort());
  assert.equal(hint.needsReadback,true);
  assert.throws(() => parseUsOdooBillingHint({
    company_id:2,subscription_order_id:101,
  }), /HINT_INVALID/);
});

test("Odoo transport uses ONLY search_read, company 4 and one auth session", async () => {
  const calls=[];
  const fetchImpl=async (url, options) => {
    const message=JSON.parse(options.body);
    calls.push(message.params);
    return {ok:true,json:async()=>({
      result:message.params.service==="common"?30:[{id:101}],
    })};
  };
  const client=createUsOdooReadOnlyClient({
    baseUrl:"https://example.odoo.com",database:"private",
    username:"billing@example.com",apiKey:"opaque",fetchImpl,
  });
  await client.searchRead("sale.order",[["id","=",101]],["id"]);
  await client.searchRead("account.move",[["id","=",401]],["id"]);
  assert.equal(calls.length,3);
  assert.equal(calls[0].method,"authenticate");
  for(const message of calls.slice(1)){
    assert.equal(message.method,"execute_kw");
    assert.equal(message.args[4],"search_read");
    assert.deepEqual(message.args[6].context.allowed_company_ids,[4]);
  }
  await assert.rejects(()=>client.searchRead("crm.lead",[],["id"]),
    /MODEL_NOT_ALLOWED/);
  await assert.rejects(()=>client.searchRead("account.move",[],["id;DROP"]),
    /ARGUMENTS_INVALID/);
});

test("insecure HTTP URL or missing server credentials is prohibited", () => {
  assert.throws(()=>createUsOdooReadOnlyClient({
    baseUrl:"http://odoo.example.com",database:"db",username:"user",apiKey:"key",
  }), /HTTPS_ORIGIN_REQUIRED/);
  assert.throws(()=>createUsOdooReadOnlyClient({
    baseUrl:"https://odoo.example.com",database:"db",username:"",apiKey:"key",
  }), /CREDENTIALS_REQUIRED/);
});
