// Own-salon master activation is the existing owner's second role, never
// a second paid grant or identity. Call only from locked canonical activation.
import {assertUsImportedMasterProvision} from "./usImportedMasterProvision.js";
import {readUsOwnSalonMasterAuthority} from "./usMasterRoleAuthority.js";
import {assertUsSalonLocationReady} from "./usOpenOwnerGuards.js";
const fail=code=>Object.assign(Error(code),{code,status:409});
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
export const isUsOwnSalonMaster=r=>r?.owner_type==="master"&&r.source_namespace==="odoo_online"&&r.precheck_result_json?.odoo_source_proof?.entry_mode==="own_salon";
export async function assertUsOwnSalonActivationReady(db,r,receipt,{env=process.env}={}){
 if(!isUsOwnSalonMaster(r)||r.status!=="provisioned"||
    env.TOTEM_US_OWN_SALON_MASTER_ACTIVATION_ENABLED!=="true"||
    env.TOTEM_US_OWN_SALON_MASTER_ACTIVATION_RELEASE_APPROVED!=="true"||
    env.TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED!=="true"||
    env.TOTEM_US_OWN_SALON_ROLE_CONTEXT_ENABLED!=="true"||
    env.TOTEM_US_OWN_SALON_ROLE_CONTEXT_RELEASE_APPROVED!=="true")
   throw fail("US_OWN_SALON_MASTER_ACTIVATION_HOLD");
 const source=await assertUsImportedMasterProvision(db,r,receipt,{env});
 const a=await readUsOwnSalonMasterAuthority(db,r.id,{env,lock:true});
 if(source.mode!=="own_salon"||source.principalId!==a.principalAuthUserId||
    source.salonId!==a.salonId||a.masterId!==id(r.created_owner_id)||
    a.principalAuthUserId!==id(r.created_auth_user_id))throw fail("US_MASTER_SHARED_IDENTITY_REQUIRED");
 const master=await db.query("SELECT id FROM public.masters WHERE id=$1 AND user_id=$2 AND slug=$3 AND active=false FOR UPDATE",
   [a.masterId,a.principalAuthUserId,r.slug_final]);
 if(master.rows.length!==1)throw fail("US_MASTER_SHARED_ENTITY_NOT_PENDING");
 await assertUsSalonLocationReady(db,a.salonId);
 return a;
}
