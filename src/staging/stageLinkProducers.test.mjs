import assert from "node:assert/strict";
import {
  buildRuntimePasswordResetUrl,buildRuntimeReferralUrl,
  buildRuntimeOwnerOpeningLinks,assertRuntimeNotificationAction,
  assertRuntimeTemplateBookingUrl
} from "./stageLinkProducers.js";
const SDK="https://totem-us-staging-sdk-staging.up.railway.app";
const keys=["NODE_ENV","TOTEM_STAGE_STRICT","STAGING_ALLOWED_ORIGINS","WEB_BASE",
"PUBLIC_WEB_BASE_URL","APP_BASE_URL","PUBLIC_APP_BASE_URL"];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
function withEnv(values,fn){for(const k of keys)delete process.env[k];Object.assign(process.env,values);
 try{fn()}finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}}
let pass=0;
function check(name,fn){fn();pass++;console.log("STAGE_LINK_API_PRODUCER_PASS",name)}
withEnv({NODE_ENV:"staging",TOTEM_STAGE_STRICT:"1",STAGING_ALLOWED_ORIGINS:SDK},()=>{
 check("reset_stage",()=>assert.equal(buildRuntimePasswordResetUrl({role:"master",slug:"alpha",login:"x@example.com"}),
 SDK+"/#/auth/reset?role=master&slug=alpha&login=x%40example.com"));
 check("referral_stage",()=>assert.equal(buildRuntimeReferralUrl("abc"),SDK+"/#/mobile?ref=abc"));
 check("owner_links_stage",()=>{
 const x=buildRuntimeOwnerOpeningLinks("/salon?slug=alpha","#/salon/alpha");
 assert.equal(x.publicLink,SDK+"/salon?slug=alpha");
 assert.equal(x.cabinetLink,SDK+"/#/salon/alpha");
 });
 check("owner_links_production_rejected",()=>{
 assert.throws(()=>buildRuntimeOwnerOpeningLinks("https://totemv.com/salon/alpha","#/salon/alpha"),/STAGING_LINK_/);
 assert.throws(()=>buildRuntimeOwnerOpeningLinks("/salon/alpha","https://app.totemv.com/#/salon/alpha"),/STAGING_LINK_/);
 });
 check("notification_and_cta_stage",()=>{
 assert.doesNotThrow(()=>assertRuntimeNotificationAction("#/salon/alpha/dashboard"));
 assert.throws(()=>assertRuntimeNotificationAction("https://app.totemv.com/#/salon/alpha"),/STAGING_LINK_/);
 assert.doesNotThrow(()=>assertRuntimeTemplateBookingUrl("/booking"));
 assert.throws(()=>assertRuntimeTemplateBookingUrl("https://app.totemv.com/#/booking?salon=alpha"),/STAGING_LINK_/);
 });
});
withEnv({NODE_ENV:"production"},()=>check("production_unchanged",()=>{
 assert.equal(buildRuntimeReferralUrl("abc"),"https://app.totemv.com/#/mobile?ref=abc");
 assert.equal(buildRuntimePasswordResetUrl({role:"master",slug:"alpha",login:"x@example.com"}),
 "https://app.totemv.com/#/auth/reset?role=master&slug=alpha&login=x%40example.com");
 assert.equal(buildRuntimeOwnerOpeningLinks("/salon?slug=alpha","#/salon/alpha").cabinetLink,"https://app.totemv.com/#/salon/alpha");
 assert.doesNotThrow(()=>assertRuntimeTemplateBookingUrl("https://app.totemv.com/#/booking"));
}));
console.log("STAGE_LINK_API_PRODUCERS_PASS",pass);
