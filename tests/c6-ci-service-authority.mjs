// CI ONLY: explicit synthetic entitlement fixture for downstream legacy positive-path tests.
// Real T5 authority and actual hard HOLD are tested separately by c6-held-postgres.test.mjs.
// Never imported by runtime source. No fallback to absent wallet rows.
import {mock} from "node:test";
export function installCiServiceAuthority(){
 mock.module(new URL("../src/services/billing/usSaasTransactionalWriteGuard.js",import.meta.url),{namedExports:{
  checkUsSaasTransactionalWrite:async(db,ownerType,scope)=>{
   const q=await db.query("SELECT can_write FROM public.c6_ci_service_entitlements WHERE owner_type=$1 AND owner_id=$2 AND market_id=$3 FOR SHARE",[ownerType,Number(scope.owner_id),Number(scope.market_id)]);
   return q.rows.length===1&&q.rows[0].can_write===true?null:{status:403,body:{ok:false,error:"US_SAAS_COMMERCIAL_ACCESS_DENIED",reason:"CI_FIXTURE_ENTITLEMENT_DENIED"}};
  }
 }});
}
