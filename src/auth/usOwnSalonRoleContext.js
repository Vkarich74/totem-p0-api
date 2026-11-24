import {VERIFIED_SESSION_VERSION} from "./verifiedSessionContract.js";
// Existing principal and existing live session; no auth_users mutation or
// second credential/session row. Context token is narrow and short-lived.
import jwt from "jsonwebtoken";
import {assertSensitiveOwnerPassword} from "./usSensitiveOwnerReauth.js";
import {readUsOwnSalonMasterAuthority} from "../services/provision/usMasterRoleAuthority.js";
const kind="own_salon_master_v1";
const fail=(code,status=403)=>Object.assign(Error(code),{code,status});
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
export const usRoleContextEnabled=(env=process.env)=>env.TOTEM_US_OWN_SALON_ROLE_CONTEXT_ENABLED==="true"&&env.TOTEM_US_OWN_SALON_ROLE_CONTEXT_RELEASE_APPROVED==="true";
export const isUsRoleContextClaim=p=>p?.us_role_context!==undefined||p?.us_master_request_id!==undefined;
async function readActive(db,userId,requestId,env,lock=false){
 const found=await db.query(`SELECT r.id,r.slug_final FROM public.owner_opening_requests r
 JOIN public.masters m ON m.id=r.created_owner_id AND m.user_id=r.created_auth_user_id
 WHERE r.id=$1 AND r.created_auth_user_id=$2 AND r.owner_type='master'
 AND r.status IN ('activated','email_ready','email_sent','email_failed') AND m.active=true
 AND r.source_namespace='odoo_online'`,[id(requestId),id(userId)]);
 if(found.rows.length!==1)throw fail("US_ROLE_CONTEXT_NOT_ACTIVE");
 const a=await readUsOwnSalonMasterAuthority(db,id(requestId),{env,lock});
 if(lock){
   const current=await db.query("SELECT r.id FROM public.owner_opening_requests r "+
    "JOIN public.masters m ON m.id=r.created_owner_id AND m.user_id=r.created_auth_user_id "+
    "WHERE r.id=$1 AND r.created_auth_user_id=$2 AND r.owner_type='master' "+
    "AND r.status IN ('activated','email_ready','email_sent','email_failed') AND m.active=true "+
    "AND r.slug_final=$3 AND m.slug=$3 FOR UPDATE OF r,m",[id(requestId),id(userId),found.rows[0].slug_final]);
   if(current.rows.length!==1)throw fail("US_ROLE_CONTEXT_NOT_ACTIVE");
 }
 if(a.principalAuthUserId!==id(userId))throw fail("US_ROLE_CONTEXT_PRINCIPAL_MISMATCH");
 return {masterRequestId:id(requestId),masterId:a.masterId,masterSlug:found.rows[0].slug_final};
}
// First operational slice. Both flags default OFF; no cabinet-wide grant.
export const usSharedMasterProfileEnabled=(env=process.env)=>usRoleContextEnabled(env)&&
 env.TOTEM_US_SHARED_MASTER_PROFILE_ENABLED==="true"&&
 env.TOTEM_US_SHARED_MASTER_PROFILE_RELEASE_APPROVED==="true";

// For writes caller MUST pass the existing transaction client with lock=true.
// Use the same canonical paid salon projection as role switching/activation.
export async function readUsOwnSalonProfileAccess(db,{auth,slug,env=process.env,lock=false}={}){
 if(!usSharedMasterProfileEnabled(env))throw fail("US_ROLE_CONTEXT_PROFILE_HOLD");
 if(auth?.source!=="session"||auth.role!=="master"||auth.us_role_context!==kind||
    auth.kg_shared_master_request_id||!id(auth.user_id)||!id(auth.master_request_id)||
    typeof auth.session_id!=="string"||!auth.session_id||auth.session_id.length>128||
    typeof slug!=="string"||slug!==auth.master_slug)
   throw fail("US_ROLE_CONTEXT_PROFILE_SCOPE");
 const sessions=await db.query("SELECT s.id FROM public.auth_sessions s "+
    "JOIN public.auth_users u ON u.id=s.user_id "+
    "WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL "+
    "AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '24 hours' "+
    "AND u.enabled=true AND u.role='salon_admin'"+(lock?" FOR UPDATE OF s,u":""),[auth.session_id,id(auth.user_id)]);
 if(sessions.rows.length!==1)throw fail("US_ROLE_CONTEXT_SESSION_INVALID");
 const a=await readActive(db,auth.user_id,auth.master_request_id,env,lock);
 if(a.masterSlug!==slug)throw fail("US_ROLE_CONTEXT_PROFILE_SCOPE");
 return a;
}
// Only the exact own-profile PATCH is added. All other mutations remain HOLD.
export function isUsRoleContextRouteAllowed(req,slug,env=process.env){
 const method=String(req.method||"").toUpperCase(),path=String(req.path||"");
 if(method==="GET"&&path==="/auth/session/resolve")return true;
 if(method==="POST"&&["/auth/role/switch","/auth/logout","/auth/logout-all"].includes(path))return true;
 return (method==="GET"||method==="PATCH"&&usSharedMasterProfileEnabled(env))&&/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)&&path==="/masters/"+slug;
}
export async function resolveUsOwnSalonRoleContext(db,{payload,session,req,env=process.env}={}){
 if(!usRoleContextEnabled(env)||payload.us_role_context!==kind||payload.role!=="master"||
    session.role!=="salon_admin"||session.enabled!==true||!id(payload.us_master_request_id)||
    !Number.isFinite(payload.exp)||payload.exp*1000<=Date.now())
   throw fail("US_ROLE_CONTEXT_INVALID");
 const a=await readActive(db,session.user_id,payload.us_master_request_id,env);
 if(!isUsRoleContextRouteAllowed(req,a.masterSlug,env))throw fail("US_ROLE_CONTEXT_ROUTE_HOLD");
 return {role:"master",master_request_id:a.masterRequestId,master_slug:a.masterSlug,
   identity:{salons:[],masters:[a.masterId],ownership:[{owner_type:"master",owner_id:a.masterId,relation:"verified_own_salon_role_context"}]}};
}
export async function switchUsOwnSalonRole({pool,auth,role,masterRequestId,password,env=process.env}={}){
 if(!usRoleContextEnabled(env))throw fail("US_ROLE_CONTEXT_HOLD",409);
 if(auth?.source!=="session"||!id(auth.user_id)||!auth.session_id||
   !["salon_admin","master"].includes(auth.role)||!["salon_admin","master"].includes(role)||
   auth.role==="master"&&auth.us_role_context!==kind||auth.role===role)
   throw fail("US_ROLE_CONTEXT_INVALID");
 const db=await pool.connect();
 try{
   await db.query("BEGIN");
   const rows=await db.query(`SELECT s.id,s.user_id,s.expires_at,u.role,u.enabled
    FROM public.auth_sessions s JOIN public.auth_users u ON u.id=s.user_id
    WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL
    AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '24 hours'
    AND u.enabled=true AND u.role='salon_admin' FOR UPDATE OF s,u`,[auth.session_id,id(auth.user_id)]);
   if(rows.rows.length!==1)throw fail("US_ROLE_CONTEXT_SESSION_INVALID");
   await assertSensitiveOwnerPassword(db,auth.user_id,password);
   let a=null;
   if(role==="master")a=await readActive(db,auth.user_id,masterRequestId,env);
   else await readActive(db,auth.user_id,auth.master_request_id,env);
   const ttl=Math.min(300,Math.floor((new Date(rows.rows[0].expires_at).getTime()-Date.now())/1000));
   if(ttl<1||!env.JWT_SECRET)throw fail("US_ROLE_CONTEXT_SESSION_INVALID");
   const payload={user_id:id(auth.user_id),role,session_id:auth.session_id,auth_session_version:VERIFIED_SESSION_VERSION,
     ...(a?{us_role_context:kind,us_master_request_id:a.masterRequestId}:{})};
   const token=jwt.sign(payload,env.JWT_SECRET,{expiresIn:ttl});
   await db.query(`INSERT INTO public.audit_events(event_type,actor,core_user_id,data)
    VALUES('auth.us_own_salon_role_context','owner:'||($1::bigint)::text,$1::bigint,$2::jsonb)`,
    [id(auth.user_id),JSON.stringify({role,master_request_id:a?.masterRequestId??id(auth.master_request_id)})]);
   await db.query("COMMIT");
   return {access_token:token,token_type:"Bearer",role,session_id:auth.session_id,
    expires_in:ttl,master_slug:a?.masterSlug??null,role_context_limited:Boolean(a)};
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
 finally{db.release();}
}
