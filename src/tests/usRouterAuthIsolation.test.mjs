// Offline HTTP regression: root-mounted US routers must never hijack owner or admin login.
// Uses an in-process Express server, dummy pool and requests only to 127.0.0.1.
// No users, salons, bookings, payments, DB connections or network services.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import fs from "node:fs";
import { buildUsPayC11OwnerRouter } from "../routes/internalUsPayC11Owner.js";
import { buildUsServiceTaxSettingsRouter } from "../routes/internalUsServiceTaxSettings.js";
import { buildUsServicePricesRouter } from "../routes/internalUsServicePrices.js";
import { buildUsServiceTaxQuoteRouter } from "../routes/internalUsServiceTaxQuote.js";
import { buildUsServiceTaxReportRouter } from "../routes/internalUsServiceTaxReport.js";
import { buildUsPayC11LiveSellerRouter } from "../routes/internalUsPayC11LiveSeller.js";
import { buildUsPayC11LiveRefundRouter } from "../routes/internalUsPayC11LiveRefund.js";

const files = [
  "internalUsPayC11Owner.js",
  "internalUsServiceTaxSettings.js",
  "internalUsServicePrices.js",
  "internalUsServiceTaxQuote.js",
  "internalUsServiceTaxReport.js",
  "internalUsPayC11LiveSeller.js",
  "internalUsPayC11LiveRefund.js",
];
for (const file of files) {
  const source = fs.readFileSync(new URL("../routes/" + file, import.meta.url), "utf8");
  assert.doesNotMatch(source, /router\.use\(requireAuth\)/);
  assert.match(source, /const routeGuards = \[requireAuth\]/);
  const handlerCount = [...source.matchAll(/router\.(?:get|post|put)\s*\(/g)].length;
  const guardedCount = [...source.matchAll(/\.\.\.routeGuards,\s*async\s*\(/g)].length;
  assert.equal(guardedCount, handlerCount, file + " every handler stays authenticated");
}
const pool = { connect() { throw new Error("DB_CONNECTION_FORBIDDEN_OFFLINE_TEST"); } };
const app = express();
app.use(express.json());
app.use("/internal", buildUsPayC11OwnerRouter(pool));
app.use("/internal", buildUsServiceTaxSettingsRouter(pool));
app.use("/internal", buildUsServicePricesRouter(pool));
app.use("/internal", buildUsServiceTaxQuoteRouter(pool));
app.use("/internal", buildUsServiceTaxReportRouter(pool));
app.use("/internal", buildUsPayC11LiveSellerRouter(pool, { enabled:false }));
app.use("/internal", buildUsPayC11LiveRefundRouter(pool, { enabled:false }));
// Existing-route sentinel handlers only; no new business endpoint in application.
app.get("/internal/auth/session/resolve", (_req,res) => res.json({ok:true,authenticated:false}));
app.post("/internal/auth/login", (_req,res) => res.json({ok:true,route:"existing_owner_login"}));
app.post("/internal/admin/auth/login", (_req,res) => res.json({ok:true,route:"existing_admin_login"}));
app.get("/internal/masters/canonical", (_req,res) => res.json({ok:true,route:"existing_master_read"}));
app.get("/internal/salons/canonical", (_req,res) => res.json({ok:true,route:"existing_salon_read"}));
let server;
let origin;
before(async()=>{
  await new Promise((resolve,reject)=>{
    server=app.listen(0,"127.0.0.1");
    server.once("listening", resolve);
    server.once("error", reject);
  });
  origin="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
});
for(const [method,path,route] of [
  ["GET","/internal/auth/session/resolve",null],
  ["POST","/internal/auth/login","existing_owner_login"],
  ["POST","/internal/admin/auth/login","existing_admin_login"],
  ["GET","/internal/masters/canonical","existing_master_read"],
  ["GET","/internal/salons/canonical","existing_salon_read"],
]){
  test(method+" "+path+" reaches canonical handler",async()=>{
    const response=await fetch(origin+path,{method,headers:{"Content-Type":"application/json"}});
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    if(route)assert.equal(payload.route,route);
  });
}
for(const [method,path] of [
  ["GET","/internal/us-pay-c11/bookings/1/collector"],
  ["GET","/internal/us-service-tax/salon/canonical"],
  ["GET","/internal/us-service-prices/salon/canonical/1"],
  ["GET","/internal/us-pay-c11/bookings/1/service-tax-quote"],
  ["GET","/internal/us-service-tax/report/salon/1"],
  ["GET","/internal/us-pay-c11/live-connect/salon/1"],
  ["GET","/internal/us-pay-c11/live-connect/salon/1/bookings/1/refund/quote"],
]){
  test(method+" "+path+" still rejects anonymous access",async()=>{
    const response=await fetch(origin+path,{method});
    assert.equal(response.status,401);
    const payload=await response.json();
    assert.equal(payload.code,"NO_AUTH");
  });
}
