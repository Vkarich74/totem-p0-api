import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const res = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'payments'
  ORDER BY column_name;
`);

console.table(res.rows);

await client.end();
