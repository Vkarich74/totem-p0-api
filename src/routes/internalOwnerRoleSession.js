import express from "express";
import {switchUsOwnSalonRole,listUsOwnSalonRoleOptions} from "../auth/usOwnSalonRoleContext.js";
function uniqueNumberList(values = []){
return [...new Set(
(values || [])
.map((value) => Number(value))
.filter((value) => Number.isInteger(value) && value > 0)
)];
}

function isAuthResolveSessionExpired(auth){
if(!auth?.session_expires_at){
return false;
}

const exp = new Date(auth.session_expires_at).getTime();
if(!Number.isFinite(exp)){
return false;
}

return exp < Date.now();
}

function isAuthResolveIdleExpired(auth){
if(!auth?.idle_timeout_at){
return false;
}

const idle = new Date(auth.idle_timeout_at).getTime();
if(!Number.isFinite(idle)){
return false;
}

return idle < Date.now();
}


export function buildOwnerRoleSessionRouter(pool,internalReadRateLimit){
const r=express.Router();
r.get("/auth/session/resolve", async (req,res)=>{
try{
const auth = req.auth || null;
const identity = req.identity || null;
const hasAuth = Boolean(auth?.user_id && auth?.role);
const sessionExpired = isAuthResolveSessionExpired(auth);
const idleExpired = isAuthResolveIdleExpired(auth);
const authenticated = hasAuth && !sessionExpired && !idleExpired;

if(!authenticated){
return res.status(200).json({
ok:true,
authenticated:false,
role:"public",
reason:sessionExpired ? "SESSION_EXPIRED" : idleExpired ? "IDLE_TIMEOUT" : "NO_AUTH",
auth:null,
identity:{
user_id:null,
role:"public",
salons:[],
masters:[],
ownership:[]
}
});
}

const salons = uniqueNumberList(Array.isArray(identity?.salons) ? identity.salons : []);
const masters = uniqueNumberList(Array.isArray(identity?.masters) ? identity.masters : []);
const ownership = Array.isArray(identity?.ownership) ? identity.ownership : [];

return res.status(200).json({
ok:true,
authenticated:true,
role:String(auth?.role || "public"),
auth:{
user_id:Number(auth?.user_id),
role:String(auth?.role || "public"),
source:auth?.source || null,
session_id:auth?.session_id || null,
session_source:auth?.session_source || null,
...(auth?.kg_shared_master_request_id?{master_slug:auth.master_slug}:{}),
...(auth?.us_role_context==="own_salon_master_v1"?{master_slug:auth.master_slug,us_role_context:auth.us_role_context,master_request_id:auth.master_request_id}:{}),
session_expires_at:auth?.session_expires_at || null,
last_seen_at:auth?.last_seen_at || null,
idle_timeout_at:auth?.idle_timeout_at || null
},
identity:{
user_id:Number(identity?.user_id || auth?.user_id),
role:String(identity?.role || auth?.role || "public"),
salons,
masters,
ownership
}
});
}catch(err){
console.error("AUTH_SESSION_RESOLVE_ROUTE_ERROR", err);
return res.status(500).json({
ok:false,
error:"auth_session_resolve_failed"
});
}
});

// Existing auth namespace, explicit password reauthentication of the same principal.
// No role or principal selected from arbitrary body fields.
r.get("/auth/role/options",internalReadRateLimit,async(req,res)=>{
  res.set("Cache-Control","private, no-store");
  if(req.auth?.source!=="session"||req.auth?.role!=="salon_admin")
    return res.status(403).json({ok:false,error:"US_ROLE_CONTEXT_INVALID"});
  try{return res.json({ok:true,options:await listUsOwnSalonRoleOptions(pool,{auth:req.auth})});}
  catch(e){return res.status(503).json({ok:false,error:"US_ROLE_CONTEXT_UNAVAILABLE"});}
});
r.post("/auth/role/switch", internalReadRateLimit, async(req,res)=>{
  res.set("Cache-Control","no-store");
  const b=req.body||{};
  if(Object.keys(b).some(k=>!["role","master_request_id","password"].includes(k)))
    return res.status(400).json({ok:false,error:"US_ROLE_CONTEXT_BODY_INVALID"});
  try{
    const result=await switchUsOwnSalonRole({pool,auth:req.auth,role:b.role,
      masterRequestId:b.master_request_id,password:b.password});
    return res.json({ok:true,...result});
  }catch(e){
    return res.status([403,409].includes(e?.status)?e.status:503).json({ok:false,error:
      typeof e?.code==="string"&&/^US_(ROLE_CONTEXT|OWNER_REAUTH)_[A-Z0-9_]+$/.test(e.code)?e.code:"US_ROLE_CONTEXT_UNAVAILABLE"});
  }
});

return r;
}
