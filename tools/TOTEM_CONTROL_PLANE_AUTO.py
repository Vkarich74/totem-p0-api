# TOTEM_CONTROL_PLANE_AUTO.py
# EXECUTION MODE — CONTROL_PLANE (FINAL FIX)

import os, sys, subprocess, hashlib, secrets, time, re
from datetime import datetime

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
API = "https://totem-p0-api-production.up.railway.app"

PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PG_EXE = os.path.join(PG_BIN, "psql.exe")
PG_URL = "postgresql://postgres:prZkCbCpYTlLPXPkSprHnliKsXCQjoSU@interchange.proxy.rlwy.net:55042/railway"

SYSTEM_TOKEN = "TECH_SYSTEM_TOKEN_TEMP_2026"

TS = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
REPORT_DIR = os.path.join(ROOT, "reports")
REPORT = os.path.join(REPORT_DIR, f"CONTROL_PLANE_AUTO_{TS}.md")

SQL_FILE = os.path.join(ROOT, "sql", "control_plane.sql")
JS_ONBOARDING = os.path.join(ROOT, "routes", "system_onboarding.js")
INDEX_JS = os.path.join(ROOT, "index.js")

def log(m):
    print(m)
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(REPORT, "a", encoding="utf-8") as f:
        f.write(m + "\n")

def fail(stage, msg):
    log(f"[FAIL] {stage}")
    log(f"ERROR: {msg}")
    log(f"REPORT: {REPORT}")
    sys.exit(1)

def run(stage, args, cwd=None):
    log("\n$ " + " ".join(args))
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if p.stdout: log(p.stdout.rstrip())
    if p.stderr: log(p.stderr.rstrip())
    if p.returncode != 0:
        fail(stage, f"exit={p.returncode}")
    log(f"[OK] {stage}")
    return p.stdout or ""

def sha256_hex(s): return hashlib.sha256(s.encode()).hexdigest()

def ensure():
    for p in [ROOT, PG_EXE, INDEX_JS]:
        if not os.path.exists(p): fail("PRECHECK", f"missing {p}")
    os.makedirs(os.path.join(ROOT, "sql"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "routes"), exist_ok=True)
    log("[OK] PRECHECK")

def health():
    out = run("HEALTH", ["curl", "-i", f"{API}/health"])
    if "200" not in out: fail("HEALTH", "not 200")

def db_probe():
    run("DB PROBE", [PG_EXE, PG_URL, "-v", "ON_ERROR_STOP=1", "-c", "select 1;"], cwd=PG_BIN)

def write_sql():
    th = sha256_hex(SYSTEM_TOKEN)
    sql = f"""
BEGIN;
CREATE TABLE IF NOT EXISTS audit_events(
 id BIGSERIAL PRIMARY KEY,
 event_type TEXT NOT NULL,
 actor TEXT NOT NULL,
 lead_id TEXT,
 core_user_id BIGINT,
 data JSONB NOT NULL DEFAULT '{{}}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS onboarding_state_transitions(
 id BIGSERIAL PRIMARY KEY,
 core_user_id BIGINT NOT NULL,
 from_state TEXT NOT NULL,
 to_state TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permission_snapshots(
 id BIGSERIAL PRIMARY KEY,
 core_user_id BIGINT NOT NULL,
 role TEXT NOT NULL,
 snapshot JSONB NOT NULL DEFAULT '{{}}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS system_tokens(
 id BIGSERIAL PRIMARY KEY,
 token_hash TEXT UNIQUE NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ
);
INSERT INTO system_tokens(token_hash,status)
VALUES('{th}','ACTIVE') ON CONFLICT(token_hash) DO NOTHING;
COMMIT;
"""
    open(SQL_FILE,"w",encoding="utf-8").write(sql)
    log("[OK] WRITE SQL")

def apply_sql():
    run("DB APPLY", [PG_EXE, PG_URL, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE], cwd=PG_BIN)

def write_router():
    js = r"""
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
"""
    open(JS_ONBOARDING,"w",encoding="utf-8").write(js)
    log("[OK] WRITE ROUTER")

def patch_index():
    s=open(INDEX_JS,"r",encoding="utf-8").read()
    if "system_onboarding.js" not in s:
        if "import systemRoutes from './routes/system.js';" in s:
            s=s.replace(
              "import systemRoutes from './routes/system.js';\n",
              "import systemRoutes from './routes/system.js';\nimport systemOnboardingRoutes from './routes/system_onboarding.js';\n"
            )
        else:
            s=s.replace("import express from 'express';\n","import express from 'express';\nimport systemOnboardingRoutes from './routes/system_onboarding.js';\n")
        s=s.replace(
          "app.use('/system', systemRoutes);\n",
          "app.use('/system/onboarding', systemOnboardingRoutes);\napp.use('/system', systemRoutes);\n"
        )
        open(INDEX_JS,"w",encoding="utf-8").write(s)
    log("[OK] PATCH index.js")

def git_push():
    run("GIT ADD", ["git","add","sql/control_plane.sql","routes/system_onboarding.js","index.js"])
    run("GIT COMMIT", ["git","commit","-m","control-plane: final fix"])
    run("GIT PUSH", ["git","push"])

def regression():
    lead=f"cp-{TS}"
    out=run("IDENTITY",["curl","-i","-X","POST",f"{API}/system/onboarding/identity","-H","Content-Type: application/json","-H",f"X-System-Token: {SYSTEM_TOKEN}","-d",f'{{"lead_id":"{lead}","odoo_user_id":"1","email":"a@a","requested_role":"MASTER"}}'])
    m=re.search(r'"core_user_id"\s*:\s*(\d+)',out)
    if not m: fail("REGRESSION","no core_user_id")
    cid=m.group(1)
    run("STATE",["curl","-i","-X","POST",f"{API}/system/onboarding/state","-H","Content-Type: application/json","-H",f"X-System-Token: {SYSTEM_TOKEN}","-d",f'{{"core_user_id":{cid},"to_state":"ACTIVE","reason":"ok"}}'])
    run("AUDIT",["curl","-i","-H",f"X-System-Token: {SYSTEM_TOKEN}",f"{API}/system/onboarding/audit?lead_id={lead}&limit=10"])
    log("[OK] REGRESSION")

def main():
    log("# CONTROL_PLANE AUTO")
    log(f"TS: {TS}")
    ensure()
    health()
    db_probe()
    write_sql()
    apply_sql()
    write_router()
    patch_index()
    git_push()
    time.sleep(8)
    health()
    regression()
    log("[OK] DONE")
    log(f"REPORT: {REPORT}")

if __name__=="__main__":
    main()
