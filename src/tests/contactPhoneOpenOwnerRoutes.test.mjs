import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import buildAdminOpenOwnerRouter from "../routes/internal/adminOpenOwner.js";

class FakeOpenOwnerPool {
  constructor() {
    this.requests = [];
    this.statements = [];
    this.nextId = 1000;
  }
  async connect() { return this; }
  release() {}
  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    this.statements.push({ text, params });
    if (["begin", "commit", "rollback"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.includes("from public.salons") ||
        text.includes("from public.masters") ||
        text.includes("from public.slug_reservations") ||
        text.includes("from public.auth_users")) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("from public.platform_config")) {
      return { rows: [{ value: "KG" }], rowCount: 1 };
    }
    if (text.includes("from public.markets m")) {
      return { rows: [{
        market_id: 1, market_code: "KG", country_code: "KG",
        default_locale: "ru-KG", supported_locales: ["ru-KG"],
        default_currency: "KGS", supported_currencies: ["KGS"],
        default_timezone: "Asia/Bishkek", country_pack_code: "KG",
        country_pack_version: "1", market_active: true,
      }], rowCount: 1 };
    }
    if (text.includes("from public.market_capabilities") ||
        text.includes("from public.market_provider_bindings")) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("from public.owner_opening_requests") &&
        text.includes("precheck_result_json->>'odoo_request_id'")) {
      const found = this.requests.find(x =>
        x._precheck?.source === "odoo_core_form" &&
        x._precheck?.odoo_request_id === params[0]);
      return { rows: found ? [{ id: found.id, status: found.status }] : [],
        rowCount: found ? 1 : 0 };
    }
    if (text.includes("from information_schema.columns") && text.includes("table_name=$1")) {
      const name = params[0];
      if (name === "moderation_cases") return {
        rows: ["id", "status", "data"].map(column_name => ({ column_name })),
        rowCount: 3,
      };
      if (name === "audit_events") return {
        rows: ["id", "event_type", "data"].map(column_name => ({ column_name })),
        rowCount: 3,
      };
      throw new Error("STOP_UNEXPECTED_TABLE " + name);
    }
    if (text.startsWith("insert into public.owner_opening_requests")) {
      const row = {
        id: this.nextId++, owner_type: params[0], status: "validated",
        name: params[1], slug_requested: params[2], slug_final: params[3],
        email: params[4], phone_raw: params[5], phone_normalized: params[6],
        city: params[7], address: params[8], moderation_case_id: null,
        _precheck: JSON.parse(params[14]),
      };
      this.requests.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (text.startsWith("insert into public.moderation_cases")) {
      return { rows: [{ id: this.nextId++ }], rowCount: 1 };
    }
    if (text.startsWith("insert into public.audit_events")) {
      return { rows: [{ id: this.nextId++ }], rowCount: 1 };
    }
    if (text.startsWith("update public.owner_opening_requests") &&
        text.includes("moderation_case_id=$2")) {
      const row = this.requests.find(x => x.id === params[0]);
      row.moderation_case_id = params[1];
      return { rows: [row], rowCount: 1 };
    }
    throw new Error("STOP_UNEXPECTED_SQL " + text.slice(0, 220));
  }
}

const standard = {
  owner_type: "salon", name: "AB Studio", slug: "ab.studio.kg",
  email: "owner@ab.example", phone: "+79256082000",
  city: "Бишкек", market_code: "KG",
};

test("HTTP: precheck -> requests -> in-memory rows; no real customers or external requests", async () => {
  const db = new FakeOpenOwnerPool();
  const app = express();
  app.use(express.json());
  app.use("/fixture", buildAdminOpenOwnerRouter(db));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const originalToken = process.env.ODOO_BRIDGE_TOKEN;
  process.env.ODOO_BRIDGE_TOKEN = "in-memory-regression-fixture-token";
  const uri = "http://127.0.0.1:" + server.address().port + "/fixture";

  async function post(endpoint, data) {
    const response = await fetch(uri + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    const pre = await post("/precheck", standard);
    assert.equal(pre.status, 200, JSON.stringify(pre.body));
    assert.equal(pre.body.valid, true);
    assert.deepEqual(pre.body.errors, []);
    assert.equal(pre.body.normalized.phone_raw, "+79256082000");
    assert.equal(pre.body.normalized.phone_normalized, "+79256082000");

    const created = await post("/requests", standard);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.ok, true);
    assert.equal(db.requests.length, 1);
    assert.equal(db.requests[0].phone_raw, "+79256082000");
    assert.equal(db.requests[0].phone_normalized, "+79256082000");
    assert.equal(db.requests[0]._precheck.normalized.market_code, "KG");

    const broken = await post("/requests",
      { ...standard, slug: "bad-openowner", phone: "+7", email: "invalid@ab.example" });
    assert.equal(broken.status, 400);
    assert.ok(broken.body.precheck.errors.includes("PHONE_INVALID_FORMAT"));
    assert.equal(db.requests.length, 1, "invalid request must not insert");

    const odoo = {
      odoo_request_id: "fixture-lead-700", owner_type: "salon",
      name: "Odoo Fixture", slug: "odoo-fixture-salon",
      email: "odoo@ab.example", phone: "+7 925 608 20 00", market_code: "KG",
    };
    const intake = await post("/odoo-intake", odoo);
    assert.equal(intake.status, 201, JSON.stringify(intake.body));
    assert.equal(intake.body.ok, true);
    assert.equal(db.requests.length, 2);
    assert.equal(db.requests[1].phone_normalized, "+79256082000");

    const repeated = await post("/odoo-intake", odoo);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.duplicate, true);
    assert.equal(db.requests.length, 2);

    const wrongRepeated = await post("/odoo-intake", { ...odoo, phone: "+7" });
    assert.equal(wrongRepeated.status, 400);
    assert.ok(wrongRepeated.body.precheck.errors.includes("PHONE_INVALID_FORMAT"));
    assert.equal(db.requests.length, 2, "invalid optional phone cannot bypass via duplicate");

    const missingOptional = await post("/odoo-intake", {
      ...odoo, odoo_request_id: "fixture-lead-701",
      email: "empty@ab.example", slug: "empty-odoo-fixture", phone: "",
    });
    assert.equal(missingOptional.status, 201, JSON.stringify(missingOptional.body));
    assert.equal(db.requests.length, 3);
    assert.equal(db.requests[2].phone_normalized, null);

    const wrongOptional = await post("/odoo-intake", {
      ...odoo, odoo_request_id: "fixture-lead-702",
      email: "broken@ab.example", slug: "broken-odoo-fixture", phone: "+99622",
    });
    assert.equal(wrongOptional.status, 400);
    assert.ok(wrongOptional.body.precheck.errors.includes("PHONE_INVALID_FORMAT"));
    assert.equal(db.requests.length, 3);

    const falseChange = db.statements.filter(x =>
      x.text.includes("update public.markets") ||
      x.text.includes("update public.tenant_market_settings"));
    assert.equal(falseChange.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (originalToken === undefined) delete process.env.ODOO_BRIDGE_TOKEN;
    else process.env.ODOO_BRIDGE_TOKEN = originalToken;
  }
});
