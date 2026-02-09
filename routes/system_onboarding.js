
import express from "express";
import crypto from "crypto";
import db from "../db.js";
const router = express.Router();
const sha = s=>crypto.createHash("sha256").update(String(s)).digest("hex");

async function audit(e,a,l,c,d){
 try{
  const q=db.mode==="POSTGRES"
   ?"INSERT INTO audit_events(event_type,actor,lead_id,core_user_id,data) VALUES ($1,$2,$3,$4,$5::jsonb)"
   :"INSERT INTO audit_events(event_type,actor,lead_id,core_user_id,data) VALUES (?,?,?,?,?)";
  await db.run(q,[e,a,l||null,c||null,JSON.stringify(d||{})]);
 }catch(_){}
}

router.use(async(req,res,next)=>{
 const t=req.header("X-System-Token"); if(!t) return res.status(401).json({error:"unauthorized"});
 const h=sha(t);
 const q=db.mode==="POSTGRES"
  ?"SELECT id FROM system_tokens WHERE token_hash=$1 AND status='ACTIVE' LIMIT 1"
  :"SELECT id FROM system_tokens WHERE token_hash=? AND status='ACTIVE' LIMIT 1";
 const r=await db.get(q,[h]); if(!r) return res.status(401).json({error:"unauthorized"});
 req._actor="SYSTEM"; next();
});

router.post("/identity", async(req,res)=>{
 const {lead_id,odoo_user_id,email,requested_role}=req.body||{};
 if(!lead_id||!odoo_user_id||!email||!requested_role){
  await audit("identity.reject",req._actor,lead_id,null,{});
  return res.status(400).json({error:"INVALID_INPUT"});
 }
 const sel=db.mode==="POSTGRES"
  ?"SELECT id AS core_user_id,granted_role,state FROM onboarding_identities WHERE lead_id=$1"
  :"SELECT id AS core_user_id,granted_role,state FROM onboarding_identities WHERE lead_id=?";
 const ex=await db.get(sel,[String(lead_id)]);
 if(ex){ await audit("identity.idempotent",req._actor,lead_id,ex.core_user_id,ex); return res.json(ex); }
 const ins=db.mode==="POSTGRES"
  ?"INSERT INTO onboarding_identities(lead_id,odoo_user_id,email,requested_role,granted_role,state) VALUES ($1,$2,$3,$4,$5,'PENDING')"
  :"INSERT INTO onboarding_identities(lead_id,odoo_user_id,email,requested_role,granted_role,state) VALUES (?,?,?,?,?,'PENDING')";
 await db.run(ins,[String(lead_id),String(odoo_user_id),String(email),String(requested_role),String(requested_role)]);
 const cr=await db.get(sel,[String(lead_id)]);
 await audit("identity.created",req._actor,lead_id,cr.core_user_id,cr);
 res.json(cr);
});

router.post("/state", async(req,res)=>{
 const {core_user_id,to_state,reason}=req.body||{};
 if(!core_user_id||!to_state) return res.status(400).json({error:"INVALID_INPUT"});
 const get=db.mode==="POSTGRES"
  ?"SELECT id AS core_user_id,granted_role,state,lead_id FROM onboarding_identities WHERE id=$1"
  :"SELECT id AS core_user_id,granted_role,state,lead_id FROM onboarding_identities WHERE id=?";
 const r=await db.get(get,[Number(core_user_id)]);
 if(!r) return res.status(404).json({error:"NOT_FOUND"});
 const f=String(r.state), t=String(to_state);
 const ok=(f==="PENDING"&&t==="ACTIVE")||(f==="ACTIVE"&&t==="SUSPENDED")||(f==="SUSPENDED"&&t==="ACTIVE");
 if(!ok) return res.status(409).json({error:"INVALID_TRANSITION",from_state:f,to_state:t});
 const upd=db.mode==="POSTGRES"
  ?"UPDATE onboarding_identities SET state=$1 WHERE id=$2"
  :"UPDATE onboarding_identities SET state=? WHERE id=?";
 await db.run(upd,[t,Number(core_user_id)]);
 const tr=db.mode==="POSTGRES"
  ?"INSERT INTO onboarding_state_transitions(core_user_id,from_state,to_state,reason) VALUES ($1,$2,$3,$4)"
  :"INSERT INTO onboarding_state_transitions(core_user_id,from_state,to_state,reason) VALUES (?,?,?,?)";
 await db.run(tr,[Number(core_user_id),f,t,String(reason||"")]);
 if(f==="PENDING"&&t==="ACTIVE"){
  const snap={role:r.granted_role,resources:["calendar","booking","reports"],version:1};
  const ins=db.mode==="POSTGRES"
   ?"INSERT INTO permission_snapshots(core_user_id,role,snapshot) VALUES ($1,$2,$3::jsonb)"
   :"INSERT INTO permission_snapshots(core_user_id,role,snapshot) VALUES (?,?,?)";
  await db.run(ins,[Number(core_user_id),String(r.granted_role),JSON.stringify(snap)]);
 }
 await audit("state.changed",req._actor,r.lead_id,r.core_user_id,{from:f,to:t});
 res.json({ok:true,from_state:f,to_state:t});
});

router.post("/token/rotate", async(req,res)=>{
 const nt=crypto.randomBytes(24).toString("hex");
 const nh=sha(nt);
 const rv=db.mode==="POSTGRES"
  ?"UPDATE system_tokens SET status='REVOKED',revoked_at=NOW() WHERE status='ACTIVE'"
  :"UPDATE system_tokens SET status='REVOKED',revoked_at=datetime('now') WHERE status='ACTIVE'";
 await db.run(rv,[]);
 const ins=db.mode==="POSTGRES"
  ?"INSERT INTO system_tokens(token_hash,status) VALUES ($1,'ACTIVE')"
  :"INSERT INTO system_tokens(token_hash,status) VALUES (?,'ACTIVE')";
 await db.run(ins,[nh]);
 await audit("token.rotated",req._actor,null,null,{});
 res.json({ok:true,new_token:nt});
});

router.get("/audit", async(req,res)=>{
 const lead=req.query.lead_id||null;
 const cuid=req.query.core_user_id?Number(req.query.core_user_id):null;
 const lim=Math.min(200,Math.max(1,Number(req.query.limit||50)));
 let sql="SELECT id,event_type,actor,lead_id,core_user_id,data,created_at FROM audit_events";
 const a=[]; const w=[];
 if(lead){ w.push(db.mode==="POSTGRES"?`lead_id=$${a.length+1}`:"lead_id=?"); a.push(lead); }
 if(cuid){ w.push(db.mode==="POSTGRES"?`core_user_id=$${a.length+1}`:"core_user_id=?"); a.push(cuid); }
 if(w.length) sql+=" WHERE "+w.join(" AND ");
 sql+=" ORDER BY id DESC ";
 sql+=db.mode==="POSTGRES"?`LIMIT $${a.length+1}`:"LIMIT ?";
 a.push(lim);
 const rows=await db.all(sql,a);
 res.json({ok:true,rows});
});

export default router;
