// db/index.js — Postgres pool (Railway)

import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    "postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway",
  ssl: { rejectUnauthorized: false },
});
