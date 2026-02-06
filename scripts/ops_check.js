/**
 * OPS MINIMAL — Read-only operational checks (NO EXTRA DEPS)
 *
 * Design principles:
 *  - zero npm installs
 *  - read-only
 *  - graceful degradation
 *  - ops-friendly output
 *
 * Usage:
 *   node scripts/ops_check.js
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

// ================= ENV =================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= CONFIG =================

const BACKEND_HEALTH_URL =
  process.env.OPS_BACKEND_HEALTH ||
  "https://totem-p0-api-production.up.railway.app/health";

// Optional local DB (may not exist, may not be sqlite)
const DB_PATH =
  process.env.OPS_DB_PATH ||
  path.join(__dirname, "..", "totem.db");

// ================= HELPERS =================

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
}

function warn(msg) {
  console.warn(`⚠️  OPS CHECK WARN: ${msg}`);
}

function fail(msg) {
  console.error(`❌ OPS CHECK FAILED: ${msg}`);
  process.exitCode = 1;
}

// ================= CHECKS =================

function checkHealth() {
  return new Promise((resolve) => {
    log("HEALTH", `Checking ${BACKEND_HEALTH_URL}`);

    https
      .get(BACKEND_HEALTH_URL, (res) => {
        if (res.statusCode !== 200) {
          fail(`Health endpoint returned ${res.statusCode}`);
          return resolve(false);
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.ok !== true) {
              fail("Health endpoint responded but ok !== true");
              return resolve(false);
            }
            log("HEALTH", "OK");
            resolve(true);
          } catch {
            fail("Health endpoint returned invalid JSON");
            resolve(false);
          }
        });
      })
      .on("error", (err) => {
        fail(`Health check error: ${err.message}`);
        resolve(false);
      });
  });
}

function checkLocalDBPresence() {
  log("DB", "Checking local DB presence (optional)");

  if (!fs.existsSync(DB_PATH)) {
    warn("Local DB not found — skipping DB checks");
    return false;
  }

  const stat = fs.statSync(DB_PATH);
  if (!stat.isFile()) {
    warn("DB path exists but is not a file — skipping DB checks");
    return false;
  }

  log("DB", `Local DB file found at ${DB_PATH}`);
  warn("DB content checks skipped (no driver, by design)");
  return true;
}

// ================= MAIN =================

(async function main() {
  console.log("=== OPS MINIMAL CHECK START ===");

  const healthOk = await checkHealth();

  if (healthOk) {
    checkLocalDBPresence();
  } else {
    fail("Skipping further checks due to failed health check");
  }

  console.log("=== OPS MINIMAL CHECK END ===");

  if (process.exitCode === 1) {
    console.log("STATUS: ❌ NOT OK");
  } else {
    console.log("STATUS: ✅ OK");
  }
})();
