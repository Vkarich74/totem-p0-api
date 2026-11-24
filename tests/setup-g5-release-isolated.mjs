import pg from "pg";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const raw=process.env.G5_TEST_DATABASE_URL;
if(!raw||process.env.DATABASE_URL||process.env.G5_RELEASE_ISOLATED!=="YES")throw Error("G5_RELEASE_ISOLATED_REQUIRED");
const u=new URL(raw);
if(u.hostname!=="127.0.0.1"||u.pathname!=="/g5_queue_test")throw Error("G5_RELEASE_REFUSES_NONLOCAL");
const db=new pg.Pool({connectionString:raw,max:2});
try{
 const r=await db.query("SELECT current_database() AS db, version() AS version");
 assert.equal(r.rows[0].db,"g5_queue_test");assert.match(r.rows[0].version,/PostgreSQL 17\./);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
 for(const p of ["./sql/g5-t6d-prod-schema-fixture.sql","./sql/g5-release-identity-message-schema.sql",
 "../migrations/g5_async_jobs_lease_v2.sql","../migrations/g5_us_odoo_source_identity_v1.sql","../migrations/g5_us_odoo_billing_projection_v1.sql"])
  await db.query(await readFile(new URL(p,import.meta.url),"utf8"));
 console.log("G5_RELEASE_SCHEMA",r.rows[0].version,"exact selected DDL plus 3 isolated migrations");
}finally{await db.end();}
