import assert from "node:assert/strict";
import { createStageLinkPolicy } from "./stageLinkPolicy.js";
import { getStageLinkPolicy } from "./stageLinkRuntime.js";

const stageUrl = "https://totem-us-staging-sdk-staging.up.railway.app";
const policy = createStageLinkPolicy({strict:true, appOrigin:stageUrl, publicOrigin:stageUrl});
let count=0;
function pass(name, fn){fn();count++;console.log("STAGE_LINK_API_UNIT_PASS",name)}
function good(kind,url){assert.equal(policy.assert(url,kind),url)}
function bad(kind,url){assert.throws(()=>policy.assert(url,kind),/STAGING_LINK_/);assert.equal(policy.safe(url,kind),"")}
pass("booking_routes",()=>{for(const u of ["/booking","#/booking?salon=alpha","/#/booking?salon=alpha&master=12","/m/booking?salon=alpha",stageUrl+"/#/booking?salon=alpha"])good("booking",u)});
pass("owner_public_routes",()=>{for(const u of ["/salon?slug=alpha","/salon/alpha",stageUrl+"/master/alpha"])good("public",u)});
pass("cabinet_reset_login",()=>{good("cabinet","#/salon/alpha");good("cabinet",stageUrl+"/#/master/alpha/dashboard");good("reset",stageUrl+"/#/auth/reset?role=master&slug=alpha&login=x%40example.com")});
pass("referral",()=>good("referral",policy.appLink("#/mobile?ref=abc","referral")));
pass("notification_actions",()=>{good("action","#/client/14/example-token");good("action","#/salon/alpha/dashboard");good("action","/master/alpha/dashboard")});
pass("production_blocked",()=>{bad("booking","https://app.totemv.com/#/booking?salon=alpha");bad("public","https://totemv.com/salon/alpha");bad("action","https://api.totemv.com/public/salons/alpha")});
pass("spoof_blocked",()=>{bad("booking",stageUrl+".evil.invalid/#/booking?salon=alpha");bad("action","https://attacker-staging.example.com/#/client/14");bad("public",stageUrl+"@evil.invalid/salon/alpha")});
pass("unsafe_schemes_and_encoded_paths",()=>{for(const u of ["javascript:alert(1)","data:text/html,x","//app.totemv.com/#/booking","/%2fapp.totemv.com","#/booking?token=secret",stageUrl+"/x/#/booking?salon=alpha","#/booking?\ninvalid"])bad("booking",u)});
pass("non_booking_cta_blocked",()=>{bad("booking","https://maps.google.com/?q=x");bad("booking","#/auth/login?role=master")});
pass("unsafe_notification_blocked",()=>{bad("action","mailto:test@example.com");bad("action","#/unknown/screen")});
pass("bad_staging_configuration_blocked",()=>{for(const appOrigin of ["","https://app.totemv.com",stageUrl+"/path"])assert.throws(()=>createStageLinkPolicy({strict:true,appOrigin,publicOrigin:stageUrl}),/STAGING_LINK_/)});
pass("production_noop",()=>assert.equal(createStageLinkPolicy().safe("https://unrelated.example.com/a","action"),"https://unrelated.example.com/a"));
pass("runtime_resolver_contract",()=>{
 const vars=["NODE_ENV","TOTEM_STAGE_STRICT","STAGING_ALLOWED_ORIGINS","WEB_BASE","APP_BASE_URL","PUBLIC_APP_BASE_URL","PUBLIC_WEB_BASE_URL"];
 const original=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try {
   for(const k of vars)delete process.env[k];
   Object.assign(process.env,{NODE_ENV:"staging",TOTEM_STAGE_STRICT:"1",STAGING_ALLOWED_ORIGINS:stageUrl});
   assert.equal(getStageLinkPolicy().appLink("#/mobile?ref=abc","referral"),stageUrl+"/#/mobile?ref=abc");
   process.env.WEB_BASE="https://totemv.com";
   assert.throws(()=>getStageLinkPolicy(),/STAGING_LEGACY_WEB_BASE_FORBIDDEN/);
 } finally {for(const [k,v] of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
console.log("STAGE_LINK_POLICY_API_PASS",count);
