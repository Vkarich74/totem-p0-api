// TOTEM isolated US staging startup guard — no network or DB access.
import assert from "node:assert/strict";
import {
  assertStagingProcessSafety, isStagingRuntime, resolveCorsAllowedOrigins,
} from "./stagingSafety.js";
const legacy=["https://app.totemv.com","https://totem-platform.odoo.com"];
const valid={
  NODE_ENV:"staging",
  TOTEM_STAGE_STRICT:"1",
  STAGING_ALLOWED_ORIGINS:"https://totem-us-staging-sdk.up.railway.app",
  DATABASE_URL:"postgresql://staging:unique@postgres.railway.internal:5432/railway",
  JWT_SECRET:"y".repeat(64),
  AUTO_FINANCE_LOOP_ENABLED:"false",
  XPAY_RELEASE_ENABLED:"false",
  XPAY_DYNAMIC_ENABLED:"false",
  XPAY_STATIC_ENABLED:"false",
};
let count=0;
function check(name,fn){fn();count++;console.log("US06_STAGING_GUARD_UNIT_PASS",name)}
check("legacy_prod_cors_exact_object_unchanged",()=>{
  assert.equal(resolveCorsAllowedOrigins({NODE_ENV:"production"},legacy),legacy);
});
check("legacy_test_mode_unmodified",()=>{
  assert.equal(isStagingRuntime({NODE_ENV:"test"}),false);
  assert.equal(resolveCorsAllowedOrigins({NODE_ENV:"test"},legacy),legacy);
});
check("staging_requires_flag",()=>{
  assert.throws(()=>assertStagingProcessSafety({...valid,TOTEM_STAGE_STRICT:"0"}),
    /STAGING_STRICT_FLAG_REQUIRED/);
});
check("staging_cors_only_staging",()=>{
  assert.deepEqual(resolveCorsAllowedOrigins(valid,legacy),
    ["https://totem-us-staging-sdk.up.railway.app"]);
});
check("staging_cors_dedup",()=>{
  assert.equal(resolveCorsAllowedOrigins({
    ...valid,STAGING_ALLOWED_ORIGINS:
      valid.STAGING_ALLOWED_ORIGINS+","+valid.STAGING_ALLOWED_ORIGINS,
  },legacy).length,1);
});
check("staging_cors_rejects_real_prod",()=>{
  for(const bad of ["https://app.totemv.com","https://www.totemv.com",
    "https://totem-platform.odoo.com",
    "https://totem-p0-api-production.up.railway.app"]){
    assert.throws(()=>resolveCorsAllowedOrigins({
      ...valid,STAGING_ALLOWED_ORIGINS:bad,
    },legacy),/STAGING_ORIGIN_REJECTED/);
  }
});
check("staging_cors_rejects_non_stage_host",()=>{
  assert.throws(()=>resolveCorsAllowedOrigins({
    ...valid,STAGING_ALLOWED_ORIGINS:"https://example.org",
  },legacy),/STAGING_ORIGIN_REJECTED/);
});
check("staging_cors_rejects_external_http",()=>{
  assert.throws(()=>resolveCorsAllowedOrigins({
    ...valid,STAGING_ALLOWED_ORIGINS:"http://totem-us-staging-sdk.example.org",
  },legacy),/STAGING_ORIGIN_REJECTED/);
});
check("staging_cors_allows_local_test",()=>{
  assert.deepEqual(resolveCorsAllowedOrigins({
    ...valid,STAGING_ALLOWED_ORIGINS:"http://127.0.0.1:5173",
  },legacy),["http://127.0.0.1:5173"]);
});
check("staging_requires_db",()=>{
  assert.throws(()=>assertStagingProcessSafety({
    ...valid,DATABASE_URL:"",
  }),/STAGING_DATABASE_URL_REQUIRED/);
});
check("staging_db_must_not_use_public_network",()=>{
  for(const bad of [
    "postgresql://postgres:pass@db.example.org:5432/prod",
    "postgresql://postgres:pass@api.totemv.com:5432/prod",
  ]){
    assert.throws(()=>assertStagingProcessSafety({
      ...valid,DATABASE_URL:bad,
    }),/STAGING_DB_MUST_USE_PRIVATE_OR_LOCAL_POSTGRES/);
  }
});
check("staging_requires_own_secure_jwt",()=>{
  assert.throws(()=>assertStagingProcessSafety({
    ...valid,JWT_SECRET:"short",
  }),/STAGING_JWT_SECRET_TOO_SHORT/);
});
check("staging_rejects_production_payment_or_finance",()=>{
  assert.throws(()=>assertStagingProcessSafety({
    ...valid,AUTO_FINANCE_LOOP_ENABLED:"true",
  }),/STAGING_FINANCE_AUTO_LOOP_FORBIDDEN/);
  assert.throws(()=>assertStagingProcessSafety({
    ...valid,XPAY_RELEASE_ENABLED:"true",
  }),/STAGING_PAID_TRANSACTIONS_FORBIDDEN/);
});
check("staging_rejects_external_service_secrets",()=>{
  for(const k of ["SMTP_PASS","ODOO_BRIDGE_TOKEN",
    "INTERNAL_API_TOKEN","GMAIL_REFRESH_TOKEN","CLOUDINARY_API_SECRET",
    "VAPID_PRIVATE_KEY"]){
    assert.throws(()=>assertStagingProcessSafety({...valid,[k]:"forbidden"}),
      /STAGING_EXTERNAL_CREDENTIAL_FORBIDDEN_/);
  }
});
check("staging_rejects_prod_redis",()=>{
  assert.throws(()=>assertStagingProcessSafety({
    ...valid,REDIS_URL:"redis://host:6379",
  }),/STAGING_REDIS_MUST_BE_SEPARATELY_PROVISIONED/);
});
check("valid_staging_private_db_passes",()=>{
  assert.doesNotThrow(()=>assertStagingProcessSafety(valid));
});
console.log("US06_STAGING_API_GUARD_ALL_UNIT_PASS",
 JSON.stringify({checks:count,external_requests:0,production_writes:0}));
