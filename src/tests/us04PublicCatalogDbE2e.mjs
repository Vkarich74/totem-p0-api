// TOTEM US-04: REAL public.js routes + real US SQL catalog + real
// MarketContext and publicAccessGuard. ONLY localhost restored PostgreSQL.
// Fake resolveTenant sets an approved isolated test lifecycle/billing state.
import assert from "node:assert/strict";
import net from "node:net";

assert.equal(process.env.TOTEM_US04_LOCAL_ONLY, "1");
const port = Number(process.env.TOTEM_US04_PG_PORT);
assert.ok(port > 1024 && port <= 65535);
assert.equal(
  process.env.DATABASE_URL,
  `postgresql://postgres@127.0.0.1:${port}/totem_us04_isolated`
);
const salonId = Number(process.env.TOTEM_US04_SALON_ID);
const slug = "us04-real-catalog-local-only";

const allowPorts = new Set([port]);
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function locked(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === "object" && first !== null
    ? first.host || first.hostname || "localhost" :
    typeof args[1] === "string" ? args[1] : "localhost";
  const remotePort = typeof first === "object" && first !== null
    ? first.port : first;
  if (!["127.0.0.1", "::1", "localhost"].includes(String(host)) ||
      !allowPorts.has(Number(remotePort))) {
    throw new Error("US04_OUTBOUND_SOCKET_FORBIDDEN");
  }
  return originalConnect.apply(this, args);
};

const { default: express } = await import("express");
const { pool } = await import("../db.js");
const { resolveMarketContext } = await import("../market-context/MarketContextResolver.js");
const { createPublicRouter } = await import("../routes/public.js");

const app = express();
app.use(express.json());
async function resolveTenantFake(req, res, next) {
  try {
    const tenantRes = await pool.query(
      `SELECT s.id, s.slug
         FROM public.salons s
        WHERE s.slug=$1 AND s.status='active' AND s.enabled=true
        LIMIT 1`,
      [req.params.slug]
    );
    if (!tenantRes.rows.length) {
      return res.status(404).json({ok:false,error:"SALON_NOT_FOUND"});
    }
    const row = tenantRes.rows[0];
    req.tenant = {
      salon_id: Number(row.id), slug: row.slug, owner_type:"salon",
      lifecycle_state: "active",
      billing_access: {
        subscription_status: req.query.deny === "1" ? "blocked" : "active",
      },
    };
    req.market_context = await resolveMarketContext({
      db: pool, salonId: Number(row.id), requestedLocale:"en-US",
    });
    next();
  } catch (err) {
    next(err);
  }
}
const noRateLimit = (req,res,next)=>next();
app.use("/public", createPublicRouter({
  resolveTenant: resolveTenantFake,
  rlAvailability: noRateLimit, rlBookingCreate:noRateLimit,
}));
app.use((error,req,res,next)=>{
  console.error("US04_E2E_ROUTE_ERROR",String(error?.code||error?.message||"UNKNOWN"));
  res.status(500).json({ok:false,error:"ISOLATED_TEST_ROUTING_ERROR"});
});
const server=app.listen(0,"127.0.0.1");
await new Promise((resolve,reject)=>{
  server.once("listening",resolve);
  server.once("error",reject);
});
const httpPort=server.address().port;
allowPorts.add(httpPort);
const endpoint=`http://127.0.0.1:${httpPort}`;
const result={status:"HOLD",cases:{},http_route:"public.js",
  postgres_host:"127.0.0.1",production_writes:0,
  outbound_network_requests:0};
async function request(route) {
  const res=await fetch(endpoint+route);
  return {status:res.status,data:await res.json()};
}
try {
  const profile=await request(`/public/salons/${slug}`);
  assert.equal(profile.status,200);
  assert.equal(profile.data.ok,true);
  assert.equal(profile.data.salon.market_code,"US");
  assert.equal(profile.data.salon.name,"US04 Local Catalog");
  result.cases.salon_market_from_real_public_router="PASS";

  const catalog=await request(`/public/salons/${slug}/us-locations`);
  assert.equal(catalog.status,200);
  assert.equal(catalog.data.ok,true);
  assert.equal(catalog.data.market_code,"US");
  assert.equal(catalog.data.locale,"en-US");
  assert.equal(catalog.data.currency_code,"USD");
  assert.equal(catalog.data.phone_country_code,"+1");
  assert.equal(catalog.data.states.length,51);
  assert.equal(catalog.data.states.filter(s=>s.kind==="state").length,50);
  assert.equal(catalog.data.states.find(s=>s.code==="DC").name_en,
    "District of Columbia");
  result.cases.all_50_states_and_dc_from_real_sql="PASS";

  assert.deepEqual(catalog.data.locations.map(x=>x.location_code),["ny","az"]);
  const ny=catalog.data.locations[0];
  assert.equal(ny.state_code,"NY");
  assert.equal(ny.street_line1,"111 Sandbox Street");
  assert.equal(ny.postal_code,"10001-0001");
  assert.equal(ny.timezone,"America/New_York");
  assert.equal(Object.hasOwn(ny,"id"),false);
  const az=catalog.data.locations[1];
  assert.equal(az.timezone,"America/Phoenix");
  result.cases.real_us_locations_address_zip_iana="PASS";

  const denied=await request(`/public/salons/${slug}/us-locations?deny=1`);
  assert.equal(denied.status,403);
  assert.equal(denied.data.code,"PUBLIC_BOOKING_DISABLED");
  result.cases.public_access_guard_denies_blocked_billing="PASS";

  const kg=await pool.query(
    `SELECT s.slug FROM public.salons s
       JOIN public.tenant_market_settings t ON t.salon_id=s.id
       JOIN public.markets m ON m.id=t.market_id
      WHERE m.code='KG' AND s.status='active' AND s.enabled=true
      ORDER BY s.id LIMIT 1`
  );
  assert.ok(kg.rows.length,"KG_TEST_SALON_REQUIRED");
  const kgSlug=encodeURIComponent(kg.rows[0].slug);
  const kgProfile=await request(`/public/salons/${kgSlug}`);
  assert.equal(kgProfile.status,200);
  assert.equal(kgProfile.data.salon.market_code,"KG");
  const kgCatalog=await request(`/public/salons/${kgSlug}/us-locations`);
  assert.equal(kgCatalog.status,404);
  assert.equal(kgCatalog.data.error,"US_MARKET_ONLY");
  result.cases.kg_profile_unchanged_and_us_route_rejected="PASS";

  const missing=await request("/public/salons/us04-unknown/US-locations");
  assert.equal(missing.status,404);
  result.cases.unknown_salon_rejected="PASS";
  result.status="PASS";
  result.case_count=Object.keys(result.cases).length;
  console.log("US04_REAL_LOCAL_PG_PUBLIC_ROUTER_PASS",JSON.stringify(result));
} catch(error) {
  result.status="HOLD";
  result.reason=String(error?.stack||error).slice(0,1300);
  console.error("US04_REAL_PUBLIC_ROUTER_STOP",result.reason);
} finally {
  await pool.end();
  await new Promise(resolve=>server.close(resolve));
}
if(result.status!=="PASS")process.exitCode=2;
