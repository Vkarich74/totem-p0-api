import assert from "node:assert/strict";
import { buildEntryContract, buildAuthLoginUrl } from "../services/entry/entryContract.js";

let passed=0;
function check(name,fn){fn();passed++;console.log("US_SHARED_ENTRY_LOGIN_PASS",name)}
check("us_salon_uses_shared_sdk_hash_login",()=>{
 const x=buildAuthLoginUrl("salon","us-salon",null,"US");
 assert.equal(x.auth_login_url,"#/auth/login?role=salon_admin&slug=us-salon");
 assert.equal(x.auth_login_absolute_url,"https://app.totemv.com/#/auth/login?role=salon_admin&slug=us-salon");
});
check("us_master_uses_shared_sdk_hash_login",()=>{
 const x=buildAuthLoginUrl("master","us-master",null,"US");
 assert.equal(x.auth_login_url,"#/auth/login?role=master&slug=us-master");
});
check("market_bound_us_owner_contract",()=>{
 const c=buildEntryContract({owner_type:"salon",canonical_slug:"us-salon",market_code:"US"},{public_visible:true});
 assert.equal(c.public_absolute_url,"https://totemv.com/salon/us-salon");
 assert.equal(c.cabinet_absolute_url,"https://totemv.com/#/salon/us-salon");
 assert.equal(c.auth_login_absolute_url,"https://app.totemv.com/#/auth/login?role=salon_admin&slug=us-salon");
});
check("kz_default_contract_unmodified",()=>{
 const c=buildEntryContract({owner_type:"salon",canonical_slug:"kz-salon",market_code:"KZ"},{public_visible:true});
 assert.equal(c.auth_login_absolute_url,"https://totemv.com/auth/login?owner_type=salon&slug=kz-salon");
});
check("kg_default_contract_unmodified",()=>{
 const x=buildAuthLoginUrl("master","kg-master",null,"KG");
 assert.equal(x.auth_login_url,"/auth/login?owner_type=master&slug=kg-master");
});
check("us_invalid_slugs_rejected",()=>{
 assert.throws(()=>buildAuthLoginUrl("salon","../escape",null,"US"),/INVALID_CANONICAL_SLUG/);
 assert.throws(()=>buildAuthLoginUrl("admin","us-salon",null,"US"),/INVALID_OWNER_TYPE/);
});
console.log("US_SHARED_ENTRY_LOGIN_ALL_PASS",passed);
