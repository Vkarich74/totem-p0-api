import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContactPhone, normalizeContactPhoneForBusiness } from "../services/contactPhone.js";
import { KG_COUNTRY_PACK } from "../market-context/country-packs/KG.js";
import { buildOpenOwnerPrecheck } from "../routes/internal/adminOpenOwner.js";
import { createSalonCanonical } from "../services/provision/createSalonCanonical.js";
import { createMasterCanonical } from "../services/provision/createMasterCanonical.js";
import { resolveProvisionError } from "../services/provision/provisionShared.js";

class ReadOnlyPrecheckDb {
  constructor() { this.sql = []; }
  async query(sql, values = []) {
    const text = String(sql).toLowerCase().replace(/\s+/g, " ");
    this.sql.push({ text, values });
    if (text.includes("from public.platform_config")) {
      return { rowCount: 1, rows: [{ value: "KG" }] };
    }
    if (text.includes("from public.markets m")) {
      const code = values[0] || "KG";
      return { rowCount: 1, rows: [{
        market_id: 1, market_code: code, country_code: code,
        default_locale: code === "KG" ? "ru-KG" : "en-US",
        supported_locales: [code === "KG" ? "ru-KG" : "en-US"],
        default_currency: code === "KG" ? "KGS" : "USD",
        supported_currencies: [code === "KG" ? "KGS" : "USD"],
        default_timezone: code === "KG" ? "Asia/Bishkek" : "America/New_York",
        country_pack_code: code, country_pack_version: "1", market_active: true,
      }] };
    }
    if (text.includes("from public.market_capabilities") || text.includes("from public.market_provider_bindings") ||
        text.includes("from public.salons") || text.includes("from public.masters") ||
        text.includes("from public.slug_reservations") || text.includes("from public.auth_users")) {
      return { rowCount: 0, rows: [] };
    }
    throw new Error("STOP_UNEXPECTED_SQL " + text.slice(0, 200));
  }
}

const standardForm = {
  owner_type: "salon", name: "AB Studio", slug: "ab.studio.kg",
  email: "owner@ab.example", phone: "+79256082000",
  city: "Бишкек", market_code: "KG",
};

test("positive international E.164 numbers and formatting; KG legacy stays accepted", () => {
  const cases = [
    ["+79256082000", "+79256082000"],
    ["+7 925 608 20 00", "+79256082000"],
    ["+12025550100", "+12025550100"],
    ["+996775151420", "+996775151420"],
    ["+996222006611", "+996222006611"],
    ["+44 20 7946 0958", "+442079460958"],
  ];
  for (const [raw, phone] of cases) {
    assert.deepEqual(normalizeContactPhone(raw), { ok: true, phone }, raw);
  }
  assert.deepEqual(normalizeContactPhone("0555 123 456", { defaultCountry: "KG" }),
    { ok: true, phone: "+996555123456" });
  assert.deepEqual(normalizeContactPhone("996775151420", { defaultCountry: "KG" }),
    { ok: true, phone: "+996775151420" });
});

test("invalid, unknown and ambiguous country numbers never become null", () => {
  for (const raw of ["+7", "+99622", "abc", "+999123456789", "+79256082000 ext123", "++++12025550100"]) {
    assert.deepEqual(normalizeContactPhone(raw), { ok: false, error: "PHONE_INVALID_FORMAT" }, raw);
  }
  assert.deepEqual(normalizeContactPhone("", { required: true }), { ok: false, error: "PHONE_REQUIRED" });
  assert.deepEqual(normalizeContactPhone("0555 123 456"), { ok: false, error: "PHONE_COUNTRY_CODE_REQUIRED" });
  assert.deepEqual(normalizeContactPhone("", { required: false }), { ok: true, phone: null });
  assert.deepEqual(normalizeContactPhone("bad", { required: false }),
    { ok: false, error: "PHONE_INVALID_FORMAT" });
});

test("international phone bypasses business market resolution; local uses KG default only", async () => {
  const db = new ReadOnlyPrecheckDb();
  assert.deepEqual(await normalizeContactPhoneForBusiness(db, "+79256082000", { marketCode: "KG" }),
    { ok: true, phone: "+79256082000" });
  assert.equal(db.sql.length, 0, "international number must not query or rebind market");
  assert.deepEqual(await normalizeContactPhoneForBusiness(db, "0555 123 456", { marketCode: "KG" }),
    { ok: true, phone: "+996555123456" });
  assert.ok(db.sql.some(x => x.text.includes("from public.markets m")));
  assert.equal(db.sql.some(x => /\b(insert|update|delete)\b/.test(x.text)), false);
});

test("KG regional phone contract is unchanged", () => {
  assert.deepEqual(KG_COUNTRY_PACK.normalizeMobilePhone("0555 123 456"), {
    ok: true, phone: "+996555123456",
  });
  assert.deepEqual(KG_COUNTRY_PACK.normalizeMobilePhone("+996222006611"), {
    ok: true, phone: "+996222006611",
  });
  assert.equal(KG_COUNTRY_PACK.normalizeMobilePhone("+79256082000").error,
    "INVALID_KG_MOBILE_PHONE");
});

test("OpenOwner precheck accepts RU contact for a KG salon without modifying market", async () => {
  const db = new ReadOnlyPrecheckDb();
  const result = await buildOpenOwnerPrecheck(db, standardForm);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.phone_raw, "+79256082000");
  assert.equal(result.normalized.phone_normalized, "+79256082000");
  assert.equal(result.normalized.market_code, "KG");
  assert.equal(db.sql.some(x => /\b(insert|update|delete)\b/.test(x.text)), false);
});

test("OpenOwner optional Odoo phone: omitted allowed, filled invalid rejects", async () => {
  const db = new ReadOnlyPrecheckDb();
  const blank = await buildOpenOwnerPrecheck(db, { ...standardForm, phone: "" },
    { allowMissingPhone: true, allowMissingCity: true });
  assert.equal(blank.valid, true);
  assert.equal(blank.normalized.phone_normalized, null);
  const broken = await buildOpenOwnerPrecheck(db, { ...standardForm, phone: "+7" },
    { allowMissingPhone: true, allowMissingCity: true });
  assert.equal(broken.valid, false);
  assert.ok(broken.errors.includes("PHONE_INVALID_FORMAT"));
  const required = await buildOpenOwnerPrecheck(db, { ...standardForm, phone: "" });
  assert.equal(required.valid, false);
  assert.ok(required.errors.includes("PHONE_REQUIRED"));
});

test("provision rejects invalid filled phone with 400 and zero owner inserts", async () => {
  for (const [name, provision, payload] of [
    ["salon", createSalonCanonical, { salon_name: "Fixture", email: "one@fixture.example", phone: "+7", market_code: "KG" }],
    ["master", createMasterCanonical, { name: "Fixture", email: "two@fixture.example", phone: "abc", market_code: "KG" }],
  ]) {
    const actions = [];
    const fake = { async connect() {
      return { async query(sql) {
        actions.push(String(sql).trim());
        if (sql === "BEGIN" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
        throw new Error("STOP_UNEXPECTED_WRITE");
      }, release() {} };
    } };
    await assert.rejects(() => provision({ pool: fake, payload }), (error) => {
      assert.equal(error.code, "PHONE_INVALID_FORMAT", name);
      assert.equal(error.status, 400, name);
      return true;
    });
    assert.deepEqual(actions, ["BEGIN", "ROLLBACK"], name);
  }
  assert.equal(resolveProvisionError({ code: "PHONE_COUNTRY_CODE_REQUIRED" }).status, 400);
});
