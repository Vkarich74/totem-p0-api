import Database from "better-sqlite3";
import pkg from "pg";
const { Pool } = pkg;

let db;

if (process.env.DATABASE_URL) {
  // ===== POSTGRES =====
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  db = {
    async getMasterBySlug(slug) {
      const r = await pool.query(
        "SELECT id, name, slug FROM masters WHERE slug = $1",
        [slug]
      );
      return r.rows[0] || null;
    },

    async getActiveSalonsByMasterId(masterId) {
      const r = await pool.query(
        `SELECT s.id, s.name, s.slug
         FROM salon_masters sm
         JOIN salons s ON s.id = sm.salon_id
         WHERE sm.master_id = $1 AND sm.active = true`,
        [masterId]
      );
      return r.rows;
    }
  };
} else {
  // ===== SQLITE =====
  const sqlite = new Database("totem.db");

  db = {
    async getMasterBySlug(slug) {
      return sqlite
        .prepare("SELECT id, name, slug FROM masters WHERE slug = ?")
        .get(slug);
    },

    async getActiveSalonsByMasterId(masterId) {
      return sqlite
        .prepare(
          `SELECT s.id, s.name, s.slug
           FROM salon_masters sm
           JOIN salons s ON s.id = sm.salon_id
           WHERE sm.master_id = ? AND sm.active = 1`
        )
        .all(masterId);
    }
  };
}

export default db;
