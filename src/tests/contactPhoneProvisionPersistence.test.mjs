import test from "node:test";
import assert from "node:assert/strict";
import { createSalonCanonical } from "../services/provision/createSalonCanonical.js";
import { createMasterCanonical } from "../services/provision/createMasterCanonical.js";

class SimulatedProvisionDb {
  constructor(ownerType, { phoneColumn = true } = {}) {
    this.ownerType = ownerType;
    this.phoneColumn = phoneColumn;
    this.calls = [];
    this.reservation = null;
    this.owner = null;
    this.user = null;
    this.ownerLink = null;
    this.rollback = false;
    this.commits = 0;
  }
  async connect() { return this; }
  release() {}
  row(result) {
    return { rows: result == null ? [] : [result], rowCount: result == null ? 0 : 1 };
  }
  async query(query, args = []) {
    const s = String(query).trim().replace(/\s+/g, " ").toLowerCase();
    this.calls.push({ s, args });
    if (s === "begin") return this.row(null);
    if (s === "commit") { this.commits++; return this.row(null); }
    if (s === "rollback") { this.rollback = true; return this.row(null); }
    if (s.startsWith("create table") || s.startsWith("create unique index") ||
        s.startsWith("create index")) return this.row(null);
    if (s.includes("from public.platform_config")) return this.row({ value: "KG" });
    if (s.includes("from public.markets m")) return this.row({
      market_id: 1, market_code: "KG", country_code: "KG",
      default_locale: "ru-KG", supported_locales: ["ru-KG"],
      default_currency: "KGS", supported_currencies: ["KGS"],
      default_timezone: "Asia/Bishkek", country_pack_code: "KG",
      country_pack_version: "1", market_active: true,
    });
    if (s.includes("from public.market_capabilities") ||
        s.includes("from public.market_provider_bindings")) return this.row(null);
    if (s.includes("from public.salons s") && s.includes("join public.tenant_market_settings")) {
      return this.row({
        salon_id: this.owner.id, salon_slug: this.owner.slug,
        market_id: 1, market_code: "KG", country_code: "KG",
        default_locale: "ru-KG", supported_locales: ["ru-KG"],
        default_currency: "KGS", supported_currencies: ["KGS"],
        default_timezone: "Asia/Bishkek", country_pack_code: "KG",
        country_pack_version: "1", market_active: true,
        city_id: null, city_slug: null, city_timezone: null,
        locale_override: null, currency_override: null, timezone_override: null,
        payment_profile_code: null, notification_profile_code: null, fiscal_profile_code: null,
      });
    }
    if (s.includes("from information_schema.columns")) {
      const col = args[0];
      return this.row(col !== "phone" || this.phoneColumn ? { exists: true } : null);
    }
    if (s.includes("from auth_users") && s.includes("where email =")) {
      return this.row(this.user);
    }
    if (s.includes("from salons") && s.includes("where slug =")) return this.row(this.ownerType === "salon" ? this.owner : null);
    if (s.includes("from masters") && (s.includes("where slug =") || s.includes("where user_id ="))) {
      return this.row(this.ownerType === "master" ? this.owner : null);
    }
    if (s.includes("from salons") && s.includes("lower(slug)")) return this.row(null);
    if (s.includes("from masters") && s.includes("lower(slug)")) return this.row(null);
    if (s.startsWith("update slug_reservations") && s.includes("status = 'released'")) return this.row(null);
    if (s.includes("from slug_reservations") && s.includes("status = 'reserved'")) {
      return this.row(this.reservation?.status === "reserved" ? this.reservation : null);
    }
    if (s.startsWith("insert into slug_reservations")) {
      this.reservation = {
        id: 7, owner_type: args[0], slug: args[1],
        status: "reserved", owner_id: null,
      };
      return this.row(this.reservation);
    }
    if (s.startsWith("update slug_reservations") && s.includes("status = 'activated'")) {
      this.reservation.status = "activated";
      return this.row(this.reservation);
    }
    if (s.startsWith("insert into salons")) {
      this.owner = {
        id: 32, slug: args[0], name: args[1], city: args[2],
        phone: args[3], status: "draft", created_at: new Date().toISOString(),
      };
      return this.row(this.owner);
    }
    if (s.startsWith("insert into public.tenant_market_settings")) return this.row(null);
    if (s.startsWith("insert into auth_users")) {
      const phone = args.find(x => typeof x === "string" && /^\+[0-9]{7,15}$/.test(x)) || null;
      const email = args.find(x => typeof x === "string" && x.includes("@"));
      const slug = this.ownerType === "salon" ? this.owner.slug : this.reservation.slug;
      this.user = {
        id: 81, email, role: this.ownerType === "salon" ? "salon_admin" : "master",
        enabled: true, salon_slug: this.ownerType === "salon" ? slug : null,
        master_slug: this.ownerType === "master" ? slug : null,
        salon_id: this.ownerType === "salon" ? 32 : null, master_id: null,
        phone, must_set_password: true,
      };
      return this.row(this.user);
    }
    if (s.startsWith("insert into masters")) {
      this.owner = {
        id: 42, slug: args[0], name: args[1],
        active: true, user_id: args[2],
      };
      return this.row(this.owner);
    }
    if (s.startsWith("update auth_users") && s.includes("set master_id")) {
      this.user.master_id = Number(args[1]);
      return this.row(this.user);
    }
    if (s.includes("from owner_salon")) return this.row(this.ownerLink);
    if (s.startsWith("insert into owner_salon")) {
      this.ownerLink = {
        id: 51, owner_id: args[0], salon_id: args[1], status: "active",
      };
      return this.row(this.ownerLink);
    }
    if (s.startsWith("insert into user_default_salon")) {
      return this.row({ user_id: args[0], default_salon_slug: args[1], updated_at: new Date().toISOString() });
    }
    if (s.startsWith("insert into onboarding_state_transitions")) return this.row({
      id: 11, core_user_id: args[0], from_state: args[1], to_state: args[2],
    });
    throw new Error("STOP_SQL_FIXTURE_UNRECOGNIZED " + s.slice(0, 235));
  }
}

const examples = [
  ["RU contact on KG salon", "+7 925 608 20 00", "+79256082000"],
  ["KG historical operator", "+996222006611", "+996222006611"],
  ["KG domestic", "0555 123 456", "+996555123456"],
];

for (const ownerType of ["salon", "master"]) {
  for (const [label, original, normalized] of examples) {
    test(ownerType + ": valid provision persists " + label + " and idempotent retry cannot duplicate", async () => {
      const pool = new SimulatedProvisionDb(ownerType);
      const payload = ownerType === "salon"
        ? { salon_name: "Fixture Salon", salon_slug: "fixture-salon", email: "salon@fixture.example",
            city: "Бишкек", phone: original, market_code: "KG" }
        : { name: "Fixture Master", master_slug: "fixture-master", email: "master@fixture.example",
            phone: original, market_code: "KG" };
      const result = ownerType === "salon"
        ? await createSalonCanonical({ pool, payload })
        : await createMasterCanonical({ pool, payload });
      assert.equal(result.ok, true);
      assert.equal(result.owner_type, ownerType);
      assert.equal(pool.user.phone, normalized, "auth_users.phone persisted");
      assert.equal(result.result.user.phone, normalized, "cabinet returns persisted phone");
      if (ownerType === "salon") {
        assert.equal(result.result.salon.phone, normalized, "salons.phone persisted");
      }
      assert.equal(pool.rollback, false);
      assert.equal(pool.commits, 1);
      assert.ok(pool.calls.some(x => x.s.startsWith("insert into auth_users") && x.args.includes(normalized)));
      assert.equal(pool.calls.some(x => x.s.includes("update public.markets")), false);

      const previousInserts = pool.calls.filter(x => x.s.startsWith("insert into auth_users") ||
        x.s.startsWith("insert into salons") || x.s.startsWith("insert into masters")).length;
      const again = ownerType === "salon"
        ? await createSalonCanonical({ pool, payload })
        : await createMasterCanonical({ pool, payload });
      assert.equal(again.meta.idempotent, true);
      assert.equal(pool.calls.filter(x => x.s.startsWith("insert into auth_users") ||
        x.s.startsWith("insert into salons") || x.s.startsWith("insert into masters")).length,
        previousInserts, "repeat must not create another owner");
    });
  }
}

test("fail closed if auth_users has no phone column; transaction rolls back", async () => {
  for (const type of ["salon", "master"]) {
    const pool = new SimulatedProvisionDb(type, { phoneColumn: false });
    const payload = type === "salon"
      ? { salon_name: "Fixture", email: "salon@fixture.example", phone: "+79256082000", market_code: "KG" }
      : { name: "Fixture", email: "master@fixture.example", phone: "+79256082000", market_code: "KG" };
    await assert.rejects(
      () => type === "salon"
        ? createSalonCanonical({ pool, payload })
        : createMasterCanonical({ pool, payload }),
      error => {
        assert.equal(error.code, "PROVISION_CONTACT_PHONE_COLUMN_MISSING");
        assert.equal(error.status, 500);
        return true;
      },
    );
    assert.equal(pool.rollback, true);
    assert.equal(pool.commits, 0);
  }
});
