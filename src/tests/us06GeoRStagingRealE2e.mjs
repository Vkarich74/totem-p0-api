// TOTEM US06 real isolated signed JWT + actual SDK -> real API -> PostgreSQL.
// No fake req.auth. Real middleware resolves DB-bound session and owner identity.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

assert.equal(process.env.TOTEM_US06_GEO_R_LOCAL_ONLY,"1");
const pgPort=Number(process.env.TOTEM_US06_PG_PORT);
assert.ok(pgPort>1024&&pgPort<65536);
assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:"+
  pgPort+"/totem_us06_geo_r_isolated");
const ids=JSON.parse(process.env.TOTEM_US06_FIXTURE_IDS||"{}");
for(const k of ["US","KG","KZ","master","usService"])
 assert.ok(Number.isSafeInteger(ids[k])&&ids[k]>0,k);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const SDK=path.join(ROOT,"sdk");
const OUT=path.join(ROOT,"US06_GEO_R_SDK_QA");
const DIST=path.join(OUT,"dist");
const EVIDENCE=path.join(ROOT,"US06_GEO_R_LOCAL_QA");
const SLUG="us06-local-only",KG="kg06-local-only";
const allowed=new Set([pgPort]);
const socketConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const first=Array.isArray(args[0])?args[0][0]:args[0];
 const host=typeof first==="object"&&first?
   first.host||first.hostname||"localhost":
   typeof args[1]==="string"?args[1]:"localhost";
 const port=typeof first==="object"&&first?first.port:first;
 if(!["127.0.0.1","::1","localhost"].includes(String(host))||
    !allowed.has(Number(port)))throw Error("US06_OUTBOUND_SOCKET_BLOCKED");
 return socketConnect.apply(this,args);
};
const {default:express}=await import("express");
const {default:jwt}=await import("jsonwebtoken");
const {pool}=await import("../db.js");
const {createAuthSession}=await import("../auth/sharedSession.js");
const {resolveAuth}=await import("../middleware/resolveAuth.js");
const {resolveTenant}=await import("../middleware/resolveTenant.js");
const {createInternalRouter}=await import("../routes/internal.js");
const {createPublicRouter}=await import("../routes/public.js");
// Real Census response fixtures; do not send actual street data to
// production or the network during this deterministic local regression.
const censusRoot=process.env.TOTEM_US06_GEO_I_FIXTURE_ROOT;
assert.ok(censusRoot);
const censusCorpus=[
 "CENSUS_REAL_ADDRESS_FIXTURES.json",
 "CENSUS_CORRECTED_STREET_FIXTURES.json",
].flatMap(name=>JSON.parse(
 fs.readFileSync(path.join(censusRoot,name),"utf8")).addresses);
const safeFetch=globalThis.fetch;
let censusCalls=0;
globalThis.fetch=async (url,options)=>{
 if(String(url).startsWith("https://geocoding.geo.census.gov/")){
  censusCalls++;
  const params=new URL(String(url)).searchParams;
  assert.equal(params.get("benchmark"),"Public_AR_Current");
  assert.equal(params.get("vintage"),"Current_Current");
  const found=censusCorpus.find(x=>
   x.street.toUpperCase()===String(params.get("street")).toUpperCase() &&
   x.city.toUpperCase()===String(params.get("city")).toUpperCase() &&
   x.state.toUpperCase()===String(params.get("state")).toUpperCase());
  const matches=found?.matches===1?[{
   matchedAddress:found.matched_address,
   addressComponents:found.components,
   coordinates:found.coordinates,
   geographies:{States:found.geographies},
  }]:[];
  return new Response(JSON.stringify({result:{
   input:{benchmark:{benchmarkName:"Public_AR_Current"}},
   addressMatches:matches,
  }}),{status:200,headers:{"content-type":"application/json"}});
 }
 return safeFetch(url,options);
};
const secret=crypto.randomBytes(48).toString("hex");
process.env.JWT_SECRET=secret;
process.env.GMAIL_CLIENT_ID="";
process.env.GMAIL_CLIENT_SECRET="";
process.env.GMAIL_REFRESH_TOKEN="";
const record={status:"HOLD",cases:{},browser:{},prod_changes:0,
 external_api_calls:0,blocked_nonlocal_attempts:[],email_sms_push_sent:0};
let web=null,browser=null,users=null;
const app=express();
app.use((req,res,next)=>{
 const origin=String(req.headers.origin||"");
 if(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)){
  res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Access-Control-Allow-Headers",
   "Authorization,Content-Type,Accept,idempotency-key,x-totem-locale");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,OPTIONS");
 }
 if(req.method==="OPTIONS")return res.status(204).end();
 next();
});
app.use(express.json({limit:"45kb"}));
const rate=(req,res,next)=>next();
app.use("/public",createPublicRouter({
 resolveTenant,rlAvailability:rate,rlBookingCreate:rate,
}));
app.use("/internal",resolveAuth,createInternalRouter({rlInternal:rate}));
app.use((error,req,res,next)=>{
 console.error("US06_API_ROUTER_ERROR",error.code||error.message);
 res.status(500).json({ok:false,error:"US06_LOCAL_API_ERROR"});
});
const server=app.listen(0,"127.0.0.1");
await new Promise((resolve,reject)=>{
 server.once("listening",resolve);server.once("error",reject);
});
const apiPort=server.address().port;
allowed.add(apiPort);
const API="http://127.0.0.1:"+apiPort;
async function call(route,{method="GET",token="",body}={}){
 const r=await fetch(API+route,{
  method,headers:{
   ...(token?{Authorization:"Bearer "+token}:{}),
   ...(body?{"Content-Type":"application/json"}:{}),
  },...(body?{body:JSON.stringify(body)}:{}),
 });
 return {status:r.status,data:await r.json().catch(()=>null)};
}
function expect(r,status,error=null){
 assert.equal(r.status,status,JSON.stringify(r).slice(0,900));
 if(error)assert.equal(r.data?.error||r.data?.code,error);
 return r.data;
}
async function check(label,fn){
 await fn();record.cases[label]="PASS";
 console.log("US06_CHECK_PASS",label);
}
async function addUsers(){
 const uid=Number((await pool.query(
  "SELECT coalesce(max(id),0)::integer AS n FROM public.auth_users")).rows[0].n)+5000;
 const rid=Number((await pool.query(
  "SELECT coalesce(max(id),0)::bigint AS n FROM public.owner_salon")).rows[0].n)+5000;
 assert.ok(Number.isSafeInteger(uid)&&Number.isSafeInteger(rid));
 await pool.query(
  "INSERT INTO public.auth_users(id,email,role,salon_slug,salon_id,must_set_password,enabled) "+
  "VALUES ($1,'us06-test-owner@local.invalid','salon_admin',$2,$3,true,true),"+
  "($4,'us06-test-kg@local.invalid','salon_admin',$5,$6,true,true)",
  [uid,SLUG,String(ids.US),uid+1,KG,String(ids.KG)]);
 await pool.query(
  "INSERT INTO public.owner_salon(id,owner_id,salon_id,status) "+
  "VALUES ($1,$2,$3,'active'),($4,$5,$6,'active')",
  [rid,String(uid),ids.US,rid+1,String(uid+1),ids.KG]);
 const ownerSession=await createAuthSession(pool,uid);
 const kgSession=await createAuthSession(pool,uid+1);
 return {uid,ownerSession,kgSession,
  token:jwt.sign({user_id:uid,role:"salon_admin",
   session_id:ownerSession.id},secret),
  kgToken:jwt.sign({user_id:uid+1,role:"salon_admin",
   session_id:kgSession.id},secret)};
}
const ROUTE="/internal/salons/"+SLUG+"/us-locations";
function draft(code){return{
 location_code:code,state_code:"NY",city_name:"New York",
 street_line1:"111 Synthetic Street",street_line2:"Suite 2",
 postal_code:"10001-0001",timezone_name:"America/New_York",
 is_primary:code==="ny",
};}
async function compile(){
 const p=spawnSync("cmd",
  ["/d","/c","npm","run","build","--","--outDir",DIST,"--emptyOutDir"],
  {cwd:SDK,env:{...process.env,VITE_API_BASE:API},encoding:"utf-8",
   timeout:145000,windowsHide:true});
 if(p.status!==0)throw Error("US06_LOCAL_VITE_BUILD_FAILED "+(p.stderr||"").slice(-900));
 assert.ok(fs.existsSync(path.join(DIST,"index.html")));
 const assets=fs.readdirSync(path.join(DIST,"assets")).filter(x=>x.endsWith(".js"));
 assert.ok(assets.length>0);
 const code=assets.map(x=>fs.readFileSync(path.join(DIST,"assets",x),"utf8")).join("\n");
 assert.ok(code.includes("United States · salon locations"));
 assert.ok(code.includes(API));
 fs.writeFileSync(path.join(OUT,"US06_VITE_LOG.txt"),p.stdout||"");
 record.cases.local_sdk_build_bound_to_real_api="PASS";
}
async function startWeb(){
 const mime=f=>f.endsWith(".html")?"text/html;charset=utf-8":
  f.endsWith(".js")?"application/javascript;charset=utf-8":
  f.endsWith(".css")?"text/css;charset=utf-8":"application/octet-stream";
 web=http.createServer((req,res)=>{
  const raw=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
  const full=path.resolve(DIST,"."+raw);
  if(full!==DIST&&!full.startsWith(DIST+path.sep)){
   res.writeHead(403);res.end();return;
  }
  const file=fs.existsSync(full)&&fs.statSync(full).isFile()?
   full:path.join(DIST,"index.html");
  res.writeHead(200,{"Content-Type":mime(file),"Cache-Control":"no-store"});
  fs.createReadStream(file).pipe(res);
 });
 await new Promise((resolve,reject)=>{
  web.once("error",reject);web.listen(0,"127.0.0.1",resolve);
 });
 allowed.add(web.address().port);
 return "http://127.0.0.1:"+web.address().port;
}
async function activateTestBranch(){
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  await c.query("ALTER TABLE public.us_salon_locations DISABLE TRIGGER trg_validate_us_salon_location_row");
  await c.query("UPDATE public.us_salon_locations SET enabled=true WHERE salon_id=$1",[ids.US]);
  await c.query("ALTER TABLE public.us_salon_locations ENABLE TRIGGER trg_validate_us_salon_location_row");
  await c.query("COMMIT");
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
 const hours=await pool.query(
  "INSERT INTO public.us_location_master_working_hours "+
  "(location_id,master_id,weekday,start_time,end_time) "+
  "SELECT l.id,$1,dow,'09:00'::time,'17:00'::time "+
  "FROM public.us_salon_locations l CROSS JOIN generate_series(0,6) AS dow "+
  "WHERE l.salon_id=$2 RETURNING location_id",
  [ids.master,ids.US]);
 assert.equal(hours.rows.length,7);
}
async function browserCheck(){
 const origin=await startWeb();
 const {chromium}=await import("file:///C:/Work/totem-sdk/node_modules/playwright/index.mjs");
 browser=await chromium.launch({
  headless:true,
  executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",
  args:["--no-first-run","--no-default-browser-check","--disable-extensions"],
 });
 const context=await browser.newContext({
  viewport:{width:390,height:844},locale:"en-US",
  timezoneId:"America/New_York",
 });
 const page=await context.newPage();
 const pageerrors=[],requests=[];
 page.on("pageerror",e=>pageerrors.push(e.message));
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=="127.0.0.1" ||
     ![apiPort,web.address().port].includes(Number(url.port))){
   record.external_api_calls++;
   record.blocked_nonlocal_attempts.push({
     host:url.hostname,path:url.pathname,method:route.request().method(),
   });
   await route.abort();return;
  }
  requests.push({url:url.pathname,method:route.request().method()});
  await route.continue();
 });
 await page.addInitScript(({token})=>{
  // Only the Vite VITE_API_BASE build variable may route the SDK.
  // No runtime window.TOTEM_API_BASE override is inserted by the test.
  window.localStorage.setItem("TOTEM_AUTH_TOKEN",token);
  window.localStorage.setItem("TOTEM_ACCESS_TOKEN",token);
 },{token:users.token});
 await page.goto(origin+"/#/salon/"+SLUG+"/settings",{
  waitUntil:"domcontentloaded",
 });
 const region=page.getByRole("region",{name:"US salon branches"});
 await region.waitFor({timeout:25000});
 assert.equal(await region.locator("select").nth(0).locator("option").count(),52);
 assert.equal(await region.locator("select").nth(1).locator("option").count(),30);
 record.browser.authenticated_owner_settings_real_api="PASS";
 await region.getByRole("textbox",{name:"Branch code"}).fill("ny");
 await region.getByRole("combobox",{name:"State or district"}).selectOption("NY");
 await region.getByRole("textbox",{name:"City"}).fill("New York");
 await region.getByRole("textbox",{name:"Street address"}).fill("111 Synthetic Street");
 await region.getByRole("textbox",{name:"Suite / unit (optional)"}).fill("Suite 2");
 await region.getByRole("textbox",{name:"ZIP / ZIP+4"}).fill("10001-0001");
 await region.getByRole("combobox",{name:"IANA time zone"}).selectOption("America/New_York");
 await region.getByRole("checkbox",{name:"Set as primary branch"}).check();
 await region.getByRole("button",{name:"Add inactive branch"}).click();
 await region.getByText("Draft branch saved. Booking activation is locked.").waitFor({
  timeout:20000,
 });
 const stored=await pool.query(
  "SELECT postal_code,enabled FROM public.us_salon_locations WHERE salon_id=$1",
  [ids.US]);
 assert.equal(stored.rows.length,1);
 assert.equal(stored.rows[0].postal_code,"10001-0001");
 assert.equal(stored.rows[0].enabled,false);
 record.browser.actual_browser_post_in_postgresql="PASS";
 const nyGeo=region.getByLabel("Address verification for ny");
 await nyGeo.getByText("Address needs review").waitFor({timeout:15000});
 await nyGeo.getByText("US Census could not match this street address.").waitFor({
  timeout:15000,
 });
 assert.equal(await region.getByText("Geography consistent").count(),0);
 record.browser.owner_geo_review_reason_visible_real_db="PASS";
 await region.getByRole("button",{name:"Edit"}).click();
 await region.getByRole("textbox",{name:"Suite / unit (optional)"}).fill("Suite 14");
 await region.getByRole("button",{name:"Save draft changes"}).click();
 await region.getByText("Draft branch saved. Booking activation is locked.").waitFor({
  timeout:20000,
 });
 const saved=await pool.query(
  "SELECT street_line2 FROM public.us_salon_locations "+
  "WHERE salon_id=$1 AND location_code='ny'",[ids.US]);
 assert.equal(saved.rows[0].street_line2,"Suite 14");
 record.browser.actual_browser_put_in_postgresql="PASS";
 await page.screenshot({
  path:path.join(EVIDENCE,"US06_AUTHENTICATED_OWNER_MOBILE.png"),fullPage:true,
 });
 await activateTestBranch();
 record.browser.us_branch_test_only_activated="PASS";
 await page.goto(origin+"/#/booking?salon="+SLUG,{waitUntil:"domcontentloaded"});
 const form=page.locator("form[aria-label]").first();
 await form.waitFor({timeout:22000});
 const sel=form.locator("select");
 await sel.nth(0).selectOption("NY");
 await sel.nth(1).selectOption("ny");
 await sel.nth(2).selectOption(String(ids.master));
 await sel.nth(3).selectOption(String(ids.usService));
 await form.locator('input[type="date"]').fill("2027-01-18");
 const slot='option[value="2027-01-18T16:00:00.000Z"]';
 await sel.nth(4).locator(slot).waitFor({state:"attached",timeout:20000});
 await sel.nth(4).selectOption("2027-01-18T16:00:00.000Z");
 await form.locator('input[type="text"]').last().fill("US06 Browser Client");
 await form.locator('input[type="tel"]').last().fill("+1 (213) 373-4253");
 await form.locator('input[type="tel"]').last().blur();
 await form.locator("button[type=submit]").last().click();
 const cabinet=page.locator('a[href^="#/client/"]');
 await cabinet.waitFor({timeout:25000});
 const book=await pool.query(
  "SELECT b.id,b.master_id,b.start_at,b.currency_code,b.status,l.location_code "+
  "FROM public.bookings b "+
  "JOIN public.us_booking_location_links link ON link.booking_id=b.id "+
  "JOIN public.us_salon_locations l ON l.id=link.location_id "+
  "WHERE b.salon_id=$1",[ids.US]);
 assert.equal(book.rows.length,1);
 assert.equal(book.rows[0].currency_code,"USD");
 assert.equal(book.rows[0].location_code,"ny");
 assert.equal(new Date(book.rows[0].start_at).toISOString(),
  "2027-01-18T16:00:00.000Z");
 record.browser.actual_sdk_booking_saved_pg="PASS";
 const note=await pool.query(
  "SELECT target_type FROM public.app_notifications "+
  "WHERE payload_json->>'booking_id'=$1",[String(book.rows[0].id)]);
 assert.deepEqual(new Set(note.rows.map(x=>x.target_type)),
  new Set(["client","master","salon"]));
 const clientToken=await pool.query(
  "SELECT booking_id,token_last4 FROM public.client_access_tokens "+
  "WHERE booking_id=$1 AND revoked_at IS NULL",[book.rows[0].id]);
 assert.equal(clientToken.rows.length,1);
 record.browser.actual_inapp_notifications_and_cabinet_token="PASS";
 const cabinetHref=await cabinet.getAttribute("href");
 assert.match(cabinetHref,/^#\/client\/[0-9]+\/[0-9a-f]{64}$/);
 // GEO-R: PROVE real client cabinet staging routing end-to-end. These
 // public API reads must reach the same localhost API as the booking,
 // including notifications and push config (if browser supports push).
 const clientProfileResponse=page.waitForResponse(r=>
  r.url().startsWith(API+"/public/clients/") &&
  !r.url().includes("/notifications") &&
  !r.url().includes("/push-subscriptions") &&
  !r.url().includes("/profile"),{timeout:22000});
 const clientNotificationsResponse=page.waitForResponse(r=>
  r.url().startsWith(API+"/public/clients/") &&
  r.url().includes("/notifications"),{timeout:22000});
 await cabinet.click();
 const cabinetProfile=await clientProfileResponse;
 const cabinetNotes=await clientNotificationsResponse;
 assert.equal(cabinetProfile.status(),200);
 assert.equal((await cabinetProfile.json()).ok,true);
 assert.equal(cabinetNotes.status(),200);
 await page.getByRole("heading",{name:"Кабинет клиента"}).first()
  .waitFor({timeout:20000});
 assert.equal(new URL(cabinetProfile.url()).host,"127.0.0.1:"+apiPort);
 assert.equal(new URL(cabinetNotes.url()).host,"127.0.0.1:"+apiPort);
 record.browser.real_client_cabinet_and_notifications_staging_api="PASS";
 await page.screenshot({
  path:path.join(EVIDENCE,"US06_GEO_R_CLIENT_CABINET_MOBILE.png"),fullPage:true,
 });
 assert.equal(record.blocked_nonlocal_attempts.length,record.external_api_calls);
 const unsafe=record.blocked_nonlocal_attempts.filter(x=>
   x.method!=="GET" ||
   /^(?:api\.totemv\.com|totem-platform\.odoo\.com|www\.totemv\.com)$/i.test(x.host) ||
   /(?:railway\.app|cloudflare\.com)$/i.test(x.host)
 );
 if(unsafe.length)throw Error("US06_UNSAFE_NONLOCAL_REQUESTS "+JSON.stringify(unsafe));
 record.browser.nonlocal_get_assets_blocked=record.external_api_calls;
 if(pageerrors.some(x=>/UsBookingPage|UsSalonLocationsEditor/.test(x)))
  throw Error("US06_REACT_ERROR "+pageerrors.join(";"));
 assert.equal(requests.filter(x=>x.method==="POST" &&
   x.url.endsWith("/us-locations")).length,1);
 assert.equal(requests.filter(x=>x.method==="PUT" &&
   x.url.endsWith("/us-locations/ny")).length,1);
 assert.equal(requests.filter(x=>x.method==="POST" &&
   x.url.endsWith("/bookings")).length,1);
 record.browser.actual_http_requests_not_mocked="PASS";
 record.real_booking_id=Number(book.rows[0].id);
 await context.close();
}
try{
 await check("real_signed_jwt_bound_active_auth_session",async()=>{
  users=await addUsers();
  const r=expect(await call("/internal/auth/session/resolve",{
   token:users.token}),200);
  assert.equal(r.authenticated,true);
  assert.equal(r.auth.session_source,"auth_sessions");
  assert.equal(r.auth.session_id,users.ownerSession.id);
  assert.ok(r.identity.salons.includes(ids.US));
 });
 await check("invalid_forged_and_sessionless_tokens_denied",async()=>{
  assert.equal(expect(await call("/internal/auth/session/resolve"),200)
   .authenticated,false);
  const forgery=users.token.slice(0,-8)+"00000000";
  assert.equal(expect(await call("/internal/auth/session/resolve",{
   token:forgery}),200).authenticated,false);
  const legacy=jwt.sign({user_id:users.uid,role:"salon_admin"},secret);
  assert.equal(expect(await call("/internal/auth/session/resolve",{
   token:legacy}),200).authenticated,false);
  const unknown=jwt.sign({user_id:users.uid,role:"salon_admin",
   session_id:crypto.randomUUID()},secret);
  assert.equal(expect(await call("/internal/auth/session/resolve",{
   token:unknown}),200).authenticated,false);
 });
 await check("real_owner_identity_guards_market_isolation",async()=>{
  expect(await call(ROUTE),401,"US_OWNER_AUTH_REQUIRED");
  expect(await call(ROUTE,{token:users.kgToken}),403,"US_OWNER_FORBIDDEN");
  const list=expect(await call(ROUTE,{token:users.token}),200);
  assert.equal(list.locations.length,0);
  assert.equal(list.states.length,51);
  assert.equal(list.timezones.length,29);
 });
 await check("real_owner_billing_blocked_denies_write",async()=>{
  await pool.query("UPDATE public.billing_subscriptions SET "+
   "subscription_status='blocked' WHERE owner_type='salon' AND owner_id=$1",
   [ids.US]);
  try{
   expect(await call(ROUTE,{method:"POST",token:users.token,
    body:draft("blocked")}),403,"BILLING_BLOCKED");
  }finally{
   await pool.query("UPDATE public.billing_subscriptions SET "+
    "subscription_status='active' WHERE owner_type='salon' AND owner_id=$1",
    [ids.US]);
  }
 });
 await check("full_owner_sdk_http_postgres_public_booking",async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  fs.mkdirSync(EVIDENCE,{recursive:true});
  await compile();await browserCheck();
 });
 await check("real_signed_owner_geocode_polygon_postgresql_evidence",async()=>{
  const a={
   location_code:"tx-austin",state_code:"TX",city_name:"Austin",
   street_line1:"1100 Congress Ave",street_line2:"",
   postal_code:"78701",timezone_name:"America/Chicago",is_primary:false,
  };
  const ok=expect(await call(ROUTE,{method:"POST",
   token:users.token,body:a}),201);
  assert.equal(ok.location.geo_status,"VERIFIED_GEOMETRY",JSON.stringify(ok));
  assert.deepEqual(ok.location.geo_reasons,[]);
  assert.equal(ok.location.enabled,false);
  const proof=await pool.query(
   `SELECT g.status,g.reasons,g.source_version,g.dataset_sha256,
           g.resolved_timezone,g.boundary_distance_m,
           g.address_fingerprint_sha256
      FROM public.us_location_geo_verifications g
      JOIN public.us_salon_locations l ON l.id=g.location_id
     WHERE l.salon_id=$1 AND l.location_code='tx-austin'`,[ids.US]);
  assert.equal(proof.rows.length,1);
  assert.equal(proof.rows[0].status,"VERIFIED_GEOMETRY");
  assert.equal(proof.rows[0].source_version,"2026d");
  assert.equal(proof.rows[0].resolved_timezone,"America/Chicago");
  assert.ok(Number(proof.rows[0].boundary_distance_m)>=250);
  const webOrigin="http://127.0.0.1:"+web.address().port;
  const statusContext=await browser.newContext({
   viewport:{width:390,height:844},locale:"en-US",
  });
  const statusPage=await statusContext.newPage();
  await statusPage.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=="127.0.0.1" ||
      ![apiPort,web.address().port].includes(Number(url.port))){
    record.external_api_calls++;
    record.blocked_nonlocal_attempts.push({
     host:url.hostname,path:url.pathname,method:route.request().method(),
    });
    await route.abort();return;
   }
   await route.continue();
  });
  await statusPage.addInitScript(({token})=>{
   window.localStorage.setItem("TOTEM_AUTH_TOKEN",token);
   window.localStorage.setItem("TOTEM_ACCESS_TOKEN",token);
  },{token:users.token});
  await statusPage.goto(webOrigin+"/#/salon/"+SLUG+"/settings",{
   waitUntil:"domcontentloaded",
  });
  const geoCard=statusPage.getByLabel("Address verification for tx-austin");
  await geoCard.getByText("Geography consistent").waitFor({timeout:16000});
  assert.equal(await geoCard.getByText(
   "US Census address, ZIP5 and mapped IANA zone agree.").count(),1);
  await statusPage.screenshot({
   path:path.join(EVIDENCE,"US06_GEO_R_OWNER_VERIFIED_MOBILE.png"),fullPage:true,
  });
  record.browser.owner_verified_geo_status_from_real_postgres="PASS";
  const before=proof.rows[0].address_fingerprint_sha256;
  const wrong=expect(await call(ROUTE,{method:"POST",
   token:users.token,body:{...a,location_code:"tx-wrong-zone",
    timezone_name:"America/Denver"}}),201);
  assert.equal(wrong.location.geo_status,"NEEDS_REVIEW");
  assert.ok(wrong.location.geo_reasons.includes("US_GEO_IANA_TIMEZONE_MISMATCH"));
  const none=expect(await call(ROUTE,{method:"POST",
   token:users.token,body:{...a,location_code:"tx-bogus",
    street_line1:"99999999 Nonexistent Avenue"}}),201);
  assert.equal(none.location.geo_status,"NEEDS_REVIEW");
  assert.ok(none.location.geo_reasons.includes("US_GEO_CENSUS_NO_MATCH"));
  const plus4=expect(await call(ROUTE,{method:"POST",
   token:users.token,body:{...a,location_code:"tx-zip4",
    postal_code:"78701-1234"}}),201);
  assert.equal(plus4.location.geo_status,"NEEDS_REVIEW");
  assert.ok(plus4.location.geo_reasons.includes(
   "US_GEO_ZIP_PLUS4_REQUIRES_USPS_REVIEW"));
  const modified=expect(await call(ROUTE+"/tx-austin",{
   method:"PUT",token:users.token,
   body:{...a,location_code:undefined,postal_code:"78702"}}),200);
  assert.equal(modified.location.geo_status,"NEEDS_REVIEW");
  assert.ok(modified.location.geo_reasons.includes("US_GEO_ZIP5_MISMATCH"));
  const after=await pool.query(
   `SELECT g.status,g.address_fingerprint_sha256
      FROM public.us_location_geo_verifications g
      JOIN public.us_salon_locations l ON l.id=g.location_id
     WHERE l.salon_id=$1 AND l.location_code='tx-austin'`,[ids.US]);
  assert.equal(after.rows[0].status,"NEEDS_REVIEW");
  assert.notEqual(after.rows[0].address_fingerprint_sha256,before);
  await statusPage.reload({waitUntil:"domcontentloaded"});
  const reviewed=statusPage.getByLabel("Address verification for tx-austin");
  await reviewed.getByText("Address needs review").waitFor({timeout:16000});
  await reviewed.getByText("US Census ZIP5 differs from the entered ZIP.")
   .waitFor({timeout:16000});
  record.browser.owner_review_status_after_real_put="PASS";
  await statusContext.close();
  const list=expect(await call(ROUTE,{token:users.token}),200);
  assert.equal(list.locations.length,5);
  assert.equal(list.locations.find(x=>x.location_code==="tx-austin").geo_status,
   "NEEDS_REVIEW");
  assert.equal(list.activation_allowed,false);
  await pool.query(
   `UPDATE public.us_location_geo_verifications
      SET checked_at=now()-interval '31 days',
          expires_at=now()-interval '1 day'
     WHERE location_id=(SELECT id FROM public.us_salon_locations
      WHERE salon_id=$1 AND location_code='tx-bogus')`,[ids.US]);
  const expired=expect(await call(ROUTE,{token:users.token}),200);
  assert.ok(expired.locations.find(x=>x.location_code==="tx-bogus")
   .geo_reasons.includes("US_GEO_EVIDENCE_EXPIRED"));
  assert.ok(censusCalls>=5);
  record.browser.actual_census_2026d_geo_evidence_sql="PASS";
  record.browser.geo_status_invalidated_on_put_and_expiry="PASS";
 });
 await check("revoked_signed_owner_session_denied",async()=>{
  await pool.query("UPDATE public.auth_sessions SET revoked_at=now(),"+
   "revoked_reason='us06_test_revoke' WHERE id=$1",[users.ownerSession.id]);
  assert.equal(expect(await call("/internal/auth/session/resolve",{
   token:users.token}),200).authenticated,false);
  expect(await call(ROUTE,{token:users.token}),401,"US_OWNER_AUTH_REQUIRED");
 });
 record.status="PASS";
 console.log("US06_GEO_R_REAL_STAGING_E2E_PASS",JSON.stringify(record));
}catch(e){
 record.status="HOLD";
 record.stop_reason=String(e?.stack||e).slice(0,2100);
 console.error("US06_REAL_E2E_STOP",record.stop_reason);
}finally{
 try{await browser?.close()}catch{}
 if(web)await new Promise(resolve=>web.close(resolve));
 try{await pool.end()}catch{}
 await new Promise(resolve=>server.close(resolve));
 fs.mkdirSync(EVIDENCE,{recursive:true});
 fs.writeFileSync(path.join(EVIDENCE,"US06_NODE_E2E.json"),
  JSON.stringify(record,null,2));
}
if(record.status!=="PASS")process.exitCode=2;
