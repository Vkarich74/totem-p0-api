// Local-only actual resolveAuth + requireAuth HTTP revocation regression.
// Requires a disposable clone, never connects to Production or writes real data.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const dbName=String(process.env.G2_AUTH_REVOKE_ISOLATED_DB||'');
assert.equal(dbName,'totem_g2_auth_revoke_isolated_20261122','STOP_NON_ISOLATED_DATABASE');
assert.ok(!process.env.JWT_SECRET,'STOP_TEST_MUST_NOT_RECEIVE_RUNTIME_SECRET');
const secret=randomBytes(32).toString('hex');
process.env.JWT_SECRET=secret;
process.env.G2_LOCAL_NO_SSL='1';
process.env.DATABASE_URL='postgres://postgres@127.0.0.1:5432/'+dbName;
const {resolveAuth}=await import('../../src/middleware/resolveAuth.js');
const {requireAuth}=await import('../../src/middleware/requireAuth.js');
const client=new pg.Client({host:'127.0.0.1',port:5432,user:'postgres',database:dbName,ssl:false});
await client.connect();
const db=await client.query('SELECT current_database() AS name');
assert.equal(db.rows[0].name,dbName);
const owners=await client.query(`
SELECT u.id AS uid, s.id AS sid
FROM public.auth_users u JOIN public.owner_salon os ON os.owner_id=u.id::text
JOIN public.salons s ON s.id=os.salon_id
WHERE u.enabled IS TRUE AND u.role='salon_admin' AND os.status='active'
  AND s.status='active' AND s.enabled IS TRUE
ORDER BY u.id LIMIT 1`);
assert.ok(owners.rows.length===1,'STOP_NO_VALID_OWNER_FIXTURE');
const userId=Number(owners.rows[0].uid),salonId=Number(owners.rows[0].sid);
const sessionId='local-only-g2-'+randomUUID();
await client.query(`INSERT INTO public.auth_sessions
(id,user_id,expires_at,last_seen_at,created_at,revoked_at)
VALUES($1,$2,NOW()+INTERVAL '1 hour',NOW(),NOW(),NULL)`,[sessionId,userId]);
const token=(id=userId,includeSession=true)=>jwt.sign(
 {user_id:id,role:'salon_admin',...(includeSession?{session_id:sessionId}:{})},
 secret,{expiresIn:'1h'}
);
const app=express();
app.use('/internal',resolveAuth,requireAuth);
app.get('/internal/money-core-guard-proof',(req,res)=>{
 const ownerGrant=(req.identity?.ownership||[]).some(g=>g.owner_type==='salon'&&Number(g.owner_id)===salonId);
 res.json({ok:true,verified_role:req.auth?.role,owner_grant:ownerGrant,session_source:req.auth?.source});
});
const server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
after(async()=>{
 await new Promise(resolve=>server.close(resolve));
 await client.end();
 delete process.env.JWT_SECRET;delete process.env.DATABASE_URL;delete process.env.G2_LOCAL_NO_SSL;
});
async function probe(proof){
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/internal/money-core-guard-proof',{
  headers:proof?{authorization:'Bearer '+proof}:{}
 });
 return {status:r.status,body:await r.json()};
}
test('verified active session constructs direct owner grant',async()=>{
 const r=await probe(token());assert.equal(r.status,200);
 assert.equal(r.body.owner_grant,true);assert.equal(r.body.session_source,'session');
});
test('missing bearer rejected without authenticated claims',async()=>{
 const r=await probe(null);assert.equal(r.status,401);
});
test('legacy JWT without session rejected',async()=>{
 const r=await probe(token(userId,false));assert.equal(r.status,401);
});
test('forged user/session mismatch rejected',async()=>{
 const r=await probe(token(userId+9000));assert.equal(r.status,401);
});
test('revoked previously-active session rejected on next HTTP request',async()=>{
 await client.query('UPDATE public.auth_sessions SET revoked_at=NOW(),revoked_reason=$2 WHERE id=$1',[sessionId,'G2_LOCAL_QA']);
 const r=await probe(token());assert.equal(r.status,401);
});
test('expired previously-active session rejected on next HTTP request',async()=>{
 await client.query(`UPDATE public.auth_sessions SET revoked_at=NULL,expires_at=NOW()-INTERVAL '10 seconds' WHERE id=$1`,[sessionId]);
 const r=await probe(token());assert.equal(r.status,401);
});
test('idle-expired session rejected on next HTTP request',async()=>{
 await client.query(`UPDATE public.auth_sessions SET expires_at=NOW()+INTERVAL '1 hour',
 last_seen_at=NOW()-INTERVAL '26 hours' WHERE id=$1`,[sessionId]);
 const r=await probe(token());assert.equal(r.status,401);
});
test('session restored within TTL works without legacy identity hints',async()=>{
 await client.query('UPDATE public.auth_sessions SET last_seen_at=NOW() WHERE id=$1',[sessionId]);
 const r=await probe(token());assert.equal(r.status,200);assert.equal(r.body.owner_grant,true);
});
