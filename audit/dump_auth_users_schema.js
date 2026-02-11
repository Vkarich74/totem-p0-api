// audit/dump_auth_users_schema.js
// READ-ONLY: dumps auth_users schema + constraints + a few sample rows (safe)
// Output: audit_out_deep/auth_users_schema_dump.txt

import fs from "fs";
import path from "path";
import db from "../db.js";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "audit_out_deep");
const OUT_FILE = path.join(OUT_DIR, "auth_users_schema_dump.txt");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function line(s = "") {
  return String(s) + "\n";
}

async function main() {
  ensureDir(OUT_DIR);

  let out = "";
  out += line("AUTH_USERS SCHEMA DUMP");
  out += line("========================================");
  out += line(`[DB MODE] ${db.mode}`);
  out += line(`[TIME UTC] ${new Date().toISOString()}`);
  out += line("");

  if (db.mode !== "POSTGRES") {
    out += line("This dump script is designed for POSTGRES mode.");
    out += line("Current mode is not POSTGRES. Exiting.");
    fs.writeFileSync(OUT_FILE, out, "utf-8");
    console.log("WROTE:", OUT_FILE);
    return;
  }

  // 1) Columns (information_schema)
  out += line("1) COLUMNS (information_schema.columns)");
  out += line("----------------------------------------");
  const cols = await db.all(
    `
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auth_users'
    ORDER BY ordinal_position
    `
  );

  if (!cols || cols.length === 0) {
    out += line("NO COLUMNS FOUND for public.auth_users (table missing?)");
  } else {
    for (const c of cols) {
      out += line(
        `${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? ""}`
      );
    }
  }
  out += line("");

  // 2) Constraints (pg_constraint)
  out += line("2) CONSTRAINTS (pg_constraint)");
  out += line("----------------------------------------");
  const cons = await db.all(
    `
    SELECT
      conname,
      contype,
      pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'auth_users'
    ORDER BY conname
    `
  );

  if (!cons || cons.length === 0) {
    out += line("NO CONSTRAINTS FOUND for public.auth_users");
  } else {
    for (const c of cons) {
      out += line(`${c.conname} | type=${c.contype} | ${c.def}`);
    }
  }
  out += line("");

  // 3) Indexes
  out += line("3) INDEXES (pg_indexes)");
  out += line("----------------------------------------");
  const idx = await db.all(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='auth_users'
    ORDER BY indexname
    `
  );

  if (!idx || idx.length === 0) {
    out += line("NO INDEXES FOUND for public.auth_users");
  } else {
    for (const i of idx) {
      out += line(`${i.indexname} | ${i.indexdef}`);
    }
  }
  out += line("");

  // 4) Row count
  out += line("4) ROW COUNT");
  out += line("----------------------------------------");
  const cnt = await db.get(`SELECT COUNT(*)::int AS count FROM auth_users`);
  out += line(`count = ${cnt?.count ?? "??"}`);
  out += line("");

  // 5) Sample rows (safe subset) - do NOT dump passwords if present
  out += line("5) SAMPLE ROWS (limited, safe fields only)");
  out += line("----------------------------------------");

  // determine safe fields present
  const colSet = new Set((cols || []).map((c) => c.column_name));
  const safeFields = [];
  const candidates = ["id", "email", "role", "master_id", "salon_id", "created_at", "is_active", "active"];
  for (const f of candidates) if (colSet.has(f)) safeFields.push(f);

  if (safeFields.length === 0) {
    out += line("No safe fields detected to sample.");
  } else {
    const q = `SELECT ${safeFields.join(", ")} FROM auth_users ORDER BY id DESC LIMIT 5`;
    const rows = await db.all(q);
    for (const r of rows || []) {
      out += line(JSON.stringify(r));
    }
  }
  out += line("");

  fs.writeFileSync(OUT_FILE, out, "utf-8");
  console.log("OK: AUTH_USERS schema dump written");
  console.log("FILE:", OUT_FILE);
}

main().catch((e) => {
  console.error("[DUMP_FAILED]", e);
  process.exit(1);
});
