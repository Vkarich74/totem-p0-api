import assert from "node:assert/strict";
import { buildAuthLoginUrl, buildEntryContract } from "../services/entry/entryContract.js";
import { createStageLinkPolicy } from "./stageLinkPolicy.js";

const STAGE="https://totem-us-staging-sdk-staging.up.railway.app";
const PUBLIC="https://totem-us-public-staging.example.com";
const KEYS=["NODE_ENV","TOTEM_STAGE_STRICT","STAGING_ALLOWED_ORIGINS",
  "TOTEM_STAGE_PUBLIC_ORIGIN","TOTEM_STAGE_APP_ORIGIN",
  "WEB_BASE","APP_BASE_URL","PUBLIC_APP_BASE_URL","PUBLIC_WEB_BASE_URL"];
const saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
function withEnv(values,fn) {
  for(const key of KEYS) delete process.env[key];
  Object.assign(process.env,values);
  try { fn(); }
  finally { for(const [key,val] of Object.entries(saved)) {
    if(val===undefined) delete process.env[key]; else process.env[key]=val;
  }}
}
let passed=0;
function test(name,fn){fn();passed++;console.log("STAGING_AUTH_ROUTE_PASS",name)}
const stage={NODE_ENV:"staging",TOTEM_STAGE_STRICT:"1",STAGING_ALLOWED_ORIGINS:STAGE};
withEnv(stage,()=>{
  const policy=createStageLinkPolicy({strict:true,appOrigin:STAGE,publicOrigin:STAGE});
  test("salon_admin_hash_login",()=>{
    const u=buildAuthLoginUrl("salon","us-salon");
    assert.equal(u.auth_login_url,"#/auth/login?role=salon_admin&slug=us-salon");
    assert.equal(u.auth_login_absolute_url,STAGE+"/#/auth/login?role=salon_admin&slug=us-salon");
    assert.equal(policy.assert(u.auth_login_absolute_url,"cabinet"),u.auth_login_absolute_url);
  });
  test("master_hash_login",()=>{
    const u=buildAuthLoginUrl("master","us-master");
    assert.equal(u.auth_login_url,"#/auth/login?role=master&slug=us-master");
    assert.equal(u.auth_login_absolute_url,STAGE+"/#/auth/login?role=master&slug=us-master");
  });
  test("entry_contract_matches_sdk",()=>{
    const entry=buildEntryContract({owner_type:"salon",canonical_slug:"us-salon"},{public_visible:true});
    assert.equal(entry.auth_login_absolute_url,STAGE+"/#/auth/login?role=salon_admin&slug=us-salon");
    assert.equal(entry.public_absolute_url,STAGE+"/salon/us-salon");
  });
  test("malformed_owner_rejected",()=>{
    assert.throws(()=>buildAuthLoginUrl("manager","us-salon"),/INVALID_OWNER_TYPE/);
    assert.throws(()=>buildAuthLoginUrl("salon","../../evil"),/INVALID_CANONICAL_SLUG/);
  });
});
withEnv({...stage,STAGING_ALLOWED_ORIGINS:STAGE+","+PUBLIC,
  TOTEM_STAGE_PUBLIC_ORIGIN:PUBLIC,TOTEM_STAGE_APP_ORIGIN:STAGE},()=>{
  test("separate_public_origin_does_not_contaminate_auth",()=>{
    const u=buildAuthLoginUrl("master","us-master",PUBLIC);
    assert.equal(u.auth_login_absolute_url,STAGE+"/#/auth/login?role=master&slug=us-master");
    const entry=buildEntryContract({owner_type:"salon",canonical_slug:"us-salon"},{public_visible:true},PUBLIC);
    assert.equal(entry.public_absolute_url,PUBLIC+"/salon/us-salon");
    assert.equal(entry.auth_login_absolute_url,STAGE+"/#/auth/login?role=salon_admin&slug=us-salon");
  });
});
withEnv({NODE_ENV:"production"},()=>{
  test("production_public_login_contract_unchanged",()=>{
    const u=buildAuthLoginUrl("salon","us-salon");
    assert.equal(u.auth_login_url,"/auth/login?owner_type=salon&slug=us-salon");
    assert.equal(u.auth_login_absolute_url,"https://totemv.com/auth/login?owner_type=salon&slug=us-salon");
  });
});
console.log("STAGING_AUTH_ROUTE_ALL_PASS",passed);
