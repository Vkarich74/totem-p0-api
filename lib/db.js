import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

function projectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "..");
}

export function createDb({ filename = "data.db" } = {}) {
  const dbPath = path.join(projectRoot(), filename);
  const db = new DatabaseSync(dbPath);

  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  return {
    filename: dbPath,

    exec(sql) {
      db.exec(sql);
    },

    run(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.run(...params);   // ← КРИТИЧНО
    },

    get(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.get(...params) ?? null;
    },

    all(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },

    transaction(fn) {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  };
}
