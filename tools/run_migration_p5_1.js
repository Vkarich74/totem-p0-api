import fs from "fs";
import path from "path";
import pg from "pg";
import process from "process";

const { Client } = pg;

// ---- strict CLI contract ----
// usage:
//   node tools/run_migration_p5_1.js <path-to-sql>
//
// example:
//   node tools/run_migration_p5_1.js db/migrations/2026_01_28_p5_1_fix_payments_is_active.sql
// -----------------------------

const sqlFileArg = process.argv[2];

if (!sqlFileArg) {
  console.error("❌ SQL file path is required");
  console.error("Usage:");
  console.error("  node tools/run_migration_p5_1.js <path-to-sql>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const sqlFilePath = path.resolve(sqlFileArg);

if (!fs.existsSync(sqlFilePath)) {
  console.error("❌ SQL file not found:", sqlFilePath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFilePath, "utf8");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log("🚀 Running migration:", sqlFilePath);

try {
  await client.connect();
  await client.query(sql);
  console.log("✅ Migration applied successfully");
} catch (err) {
  console.error("🔥 Migration failed");
  console.error(err);
  process.exit(1);
} finally {
  await client.end();
}
