// Actual pinned SDK in Chromium against real mounted Core handlers and disposable PG.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
export async function runSharedSdkBrowser({base,salonToken,password,sessionId,link,date,startAt,revoke,restore,q}){
 const {chromium}=await import(new URL("../../sdk-shared/node_modules/playwright/index.mjs",import.meta.url));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  const context=await browser.newContext();
  await context.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  const page=await context.newPage();
  await page.addInitScript(apiBase=>{window.TOTEM_API_BASE=apiBase;},base);
  await page.goto("http://127.0.0.1:4173/g5-shared-sdk-browser.html");
  await page.waitForFunction(()=>Boolean(window.__G5));
  const initial=await page.evaluate(async({salonToken,password})=>{
    const {api,readSharedCapabilities,mount}=window.__G5;
    api.setAuthAccessToken(salonToken);
    const options=await api.getUsOwnSalonRoleOptions("fixture-salon");
    if(options.length!==1)throw Error("SDK_ROLE_OPTION_MISSING");
    await api.switchUsOwnSalonContext({role:"master",password,masterSlug:options[0].master_slug,masterRequestId:options[0].master_request_id});
    const session=await api.resolveSession();
    const root=await api.getMaster("fixture-master");
    const caps=readSharedCapabilities(root,session,"fixture-master");
    if(!caps)throw Error("SDK_SHARED_CAPABILITY_MISSING");
    mount("fixture-master",session);
    return {session:session.auth.session_id,user:session.auth.user_id,caps,role:session.role};
  },{salonToken,password});
  assert.equal(initial.session,sessionId);assert.equal(Number(initial.user),100);assert.equal(initial.role,"master");
  for(const name of ["profile","services","price","hours","booking"])assert.equal(initial.caps[name],true,name);
  assert.equal(initial.caps.finance,false);
  await page.getByRole("button",{name:"Return to salon owner"}).waitFor({timeout:15000});
  const result=await page.evaluate(async({link,date,startAt,key})=>{
    const {api}=window.__G5;const slug="fixture-master";
    const root=await api.getMaster(slug);
    const saved=await api.patchMasterProfile(slug,{revision:root.profile_revision,profile:{name:"SDK verified master"}});
    const created=await api.createUsScopedServiceLink("master",slug,{operation:"create",salon_slug:"fixture-salon",name:"SDK verified service",duration_min:30,amount_minor:2000});
    const price=await api.getUsOwnerServicePrice("master",slug,link);
    const changed=await api.putUsOwnerServicePrice("master",slug,link,1950,price.price_version);
    const hours=await api.getMasterUsWorkingHours(slug,{salonSlug:"fixture-salon",locationCode:"main"});
    const schedule=await api.putMasterUsWorkingHours(slug,{salonSlug:"fixture-salon",locationCode:"main",body:{revision:hours.revision,hours:[{weekday:1,start_time:"09:00",end_time:"19:30",break_start:"12:00",break_end:"13:00"}]}});
    const booked=await api.postUsMasterManualBooking(slug,{salon_slug:"fixture-salon",location_code:"main",service_id:link,date,time:"09:00",start_at:startAt,client_payload:{name:"SDK synthetic client",phone:"+12125550126"},expected_us_price_version:changed.price_version,expected_us_amount_minor:"1950"},key);
    return {saved:saved.ok,created:created.ok,price:changed.amount_minor,version:changed.price_version,schedule:schedule.saved,booking:booked.booking_id};
  },{link,date,startAt,key:randomUUID()});
  assert.equal(result.saved,true);assert.equal(result.created,true);assert.equal(result.price,"1950");assert.equal(result.schedule,true);assert.ok(result.booking);
  const actual=(await q("SELECT b.master_id,b.salon_id,p.amount_minor::text AS amount FROM public.bookings b JOIN public.us_booking_price_snapshots p ON p.booking_id=b.id WHERE b.id=$1",[result.booking])).rows[0];
  assert.equal(Number(actual.master_id),46);assert.equal(Number(actual.salon_id),32);assert.equal(actual.amount,"1950");
  await revoke();
  const denied=await page.evaluate(async({link,version})=>{
    try{await window.__G5.api.putUsOwnerServicePrice("master","fixture-master",link,1999,version);return 0;}catch(e){return e.status;}
  },{link,version:result.version});
  assert.equal(denied,403);
  await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  await page.getByText("Access expired, revoked or unavailable. Sign in as the salon owner to continue.",{exact:true}).waitFor({timeout:25000});
  await restore();
  const back=await page.evaluate(async password=>{
    const api=window.__G5.api;await api.switchUsOwnSalonContext({role:"salon_admin",password});const s=await api.resolveSession();return {role:s.role,session:s.auth.session_id,user:s.auth.user_id};
  },password);
  assert.equal(back.role,"salon_admin");assert.equal(back.session,sessionId);assert.equal(Number(back.user),100);
  console.log("G5 SDK CHROMIUM REAL HTTP POSTGRES: PASS (same session, profile, service, price, hours, booking, revocation, return)");
 }finally{await browser.close();}
}
