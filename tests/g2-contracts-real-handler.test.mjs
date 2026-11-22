// Usage: node --experimental-vm-modules --test tests/g2-contracts-real-handler.test.mjs; SQL is fully stubbed; Production DB never contacted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, after } from 'node:test';
import vm from 'node:vm';
import express from 'express';

// All tests execute the ACTUAL FULL contracts.js source (no source text transforms).
// Isolated Express HTTP. Every SQL operation is a deterministic in-memory stub.
// Zero network calls except 127.0.0.1; zero real PostgreSQL reads/writes.
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const src=readFileSync(join(root,'src','routes','internal','contracts.js'),'utf8');
const ctx=vm.createContext({console,process,Date,Buffer,setTimeout,clearTimeout});
const mod=new vm.SourceTextModule(src,{context:ctx,identifier:'isolated-full-contracts.js'});
const expressMod=new vm.SyntheticModule(['default'],function(){this.setExport('default',express)},{context:ctx});
const marketMod=new vm.SyntheticModule(['requireCurrencyCode'],function(){this.setExport('requireCurrencyCode',x=>x||'KGS')},{context:ctx});
await mod.link(spec=>spec==='express'?expressMod:spec.endsWith('/market-context/BusinessContext.js')?marketMod:Promise.reject(new Error('UNEXPECTED_DEPENDENCY_'+spec)));
await mod.evaluate();
const builder=mod.namespace.default;
const future=new Date(Date.now()+3600_000).toISOString();
const past=new Date(Date.now()-3600_000).toISOString();
const auth=(role,user_id,source='session')=>({user_id,role,source,session_id:'LOCAL_SYNTHETIC_SESSION',session_expires_at:future,idle_timeout_at:future});
const cases={
 'owner81':{auth:auth('salon_admin',10),identity:{user_id:10,role:'salon_admin',salons:[81],masters:[],ownership:[{owner_type:'salon',owner_id:81,relation:'active_owner_salon_direct'}]}},
 'owner82':{auth:auth('salon_admin',11),identity:{user_id:11,role:'salon_admin',salons:[82],masters:[],ownership:[{owner_type:'salon',owner_id:82,relation:'active_owner_salon_direct'}]}},
 'master29':{auth:auth('master',12),identity:{user_id:12,role:'master',salons:[81],masters:[29],ownership:[{owner_type:'master',owner_id:29,relation:'masters.user_id_direct'}]}},
 'master39':{auth:auth('master',13),identity:{user_id:13,role:'master',salons:[81],masters:[39],ownership:[{owner_type:'master',owner_id:39,relation:'masters.user_id_direct'}]}},
 'legacy':{auth:{...auth('salon_admin',10,'jwt_legacy')},identity:{salons:[81],ownership:[{owner_type:'salon',owner_id:81}]}},
 'expired':{auth:{...auth('salon_admin',10),session_expires_at:past},identity:{salons:[81]}},
 'idle':{auth:{...auth('salon_admin',10),idle_timeout_at:past},identity:{salons:[81]}},
 'identityMismatch':{auth:auth('salon_admin',10),identity:{user_id:999,role:'salon_admin',salons:[81],masters:[],ownership:[{owner_type:'salon',owner_id:81}]}}
};
const UUID='a0b1c2d3-1111-4444-8888-0123456789ab';
function mkPool(){
 const statements=[];
 const pool={
  query:async(sql,params=[])=>{
   const q=String(sql).replace(/\s+/g,' ').trim();statements.push(q);
   if(/^SELECT id FROM public\.salons WHERE slug=\$1 LIMIT 1$/i.test(q))return {rows:[{id:81}]};
   if(/^SELECT id FROM salons WHERE slug=\$1$/i.test(q))return {rows:[{id:81}]};
   if(/^SELECT id FROM public\.masters WHERE slug=\$1 LIMIT 1$/i.test(q))return {rows:[{id:29}]};
   if(/^SELECT id FROM masters WHERE slug=\$1$/i.test(q))return {rows:[{id:29}]};
   if(/^SELECT salon_id, master_id FROM public\.contracts WHERE id=\$1 LIMIT 1$/i.test(q))return {rows:[{salon_id:'81',master_id:'29'}]};
   if(/FROM public\.master_salon ms/i.test(q))return {rows: Number(params[1])===29?[{'?column?':1}]:[]};
   if(/FROM contracts c LEFT JOIN masters m/i.test(q) || /SELECT c\.id, c\.master_id/i.test(q))return {rows:[{id:UUID,salon_id:'81',master_id:'29',terms_json:{model:'percentage'},status:'active'}]};
   if(/^SELECT \* FROM contracts WHERE master_id=\$1/i.test(q))return {rows:[{id:UUID,master_id:'29',salon_id:'81',status:'active'}]};
   if(/^UPDATE contracts SET status='archived'/i.test(q))return {rows:[{id:UUID,salon_id:'81',master_id:'29',status:'archived'}]};
   if(/^SELECT \* FROM contracts WHERE /i.test(q))return {rows:[]};
   throw Error('UNEXPECTED_SQL_STUB_'+q.slice(0,100));
  },
  connect:async()=>{throw Error('TRANSACTION_NOT_ALLOWED_IN_SAFE_GUARD_TEST')}
 };
 return {pool,statements};
}
// One isolated HTTP router instance for the entire 13-route matrix. SQL is
// still reset per request and remains fully stubbed; no real database.
let currentPool=null;
const poolProxy={
 query:(...args)=>currentPool.query(...args),
 connect:(...args)=>currentPool.connect(...args)
};
const realRouter=builder(poolProxy,(_req,_res,next)=>next());
assert.equal(realRouter.stack.filter(x=>x.route).length,13,'full original 13 business routes registered');
const realApp=express();realApp.use(express.json());
realApp.use('/internal',(req,_res,next)=>{
 const item=cases[req.headers['x-local-fixture']];
 req.auth=item?.auth||null;req.identity=item?.identity||null;next();
},realRouter);
realApp.use((e,_req,res,_next)=>res.status(599).json({error:e.message}));
const realServer=await new Promise(resolve=>{const srv=realApp.listen(0,'127.0.0.1',()=>resolve(srv))});
after(()=>new Promise(resolve=>realServer.close(resolve)));
async function callRoute(principal,path,method='GET',body) {
 const {pool,statements}=mkPool();
 currentPool=pool;
 const r=await fetch(`http://127.0.0.1:${realServer.address().port}/internal${path}`,{
  method,
  headers:{'content-type':'application/json',...(principal?{'x-local-fixture':principal}:{})},
  ...(method==='GET'?{}:{body:JSON.stringify(body||{})})
 });
 return {status:r.status,body:await r.json(),sql:statements};
}
const mutation=/\b(UPDATE|INSERT|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i;
function assertDeny(result,status){assert.equal(result.status,status,JSON.stringify(result.body));assert.ok(result.sql.every(sql=>!mutation.test(sql)), 'no mutation SQL routed on denied request');assert.notEqual(result.body?.ok,true);}

test('P0-01 anonymous GET salon contract list returns 401, zero SQL',async()=>{const x=await callRoute(null,'/salons/salon81/contracts');assertDeny(x,401);assert.equal(x.sql.length,0)});
test('P0-02 foreign salon owner denied contract list before private SELECT',async()=>{const x=await callRoute('owner82','/salons/salon81/contracts');assertDeny(x,403);assert.equal(x.sql.length,1)});
test('P0-03 master with salon membership denied owner contract list',async()=>{const x=await callRoute('master29','/salons/salon81/contracts');assertDeny(x,403)});
test('P0-04 own salon contract list served by real handler only to owner',async()=>{const x=await callRoute('owner81','/salons/salon81/contracts');assert.equal(x.status,200,JSON.stringify(x.body));assert.equal(x.body.contracts.length,1)});
test('P0-05 legacy JWT denied before contract SQL',async()=>{const x=await callRoute('legacy','/salons/salon81/contracts');assertDeny(x,401);assert.equal(x.sql.length,0)});
test('P0-06 expired or idle session denied before SQL',async()=>{for(const who of ['expired','idle']){const x=await callRoute(who,'/salons/salon81/contracts');assertDeny(x,401);assert.equal(x.sql.length,0)}});
test('P0-07 anonymous archive action never executes UPDATE',async()=>{const x=await callRoute(null,`/contracts/${UUID}/archive`,'POST');assertDeny(x,401);assert.equal(x.sql.length,0)});
test('P0-08 foreign salon admin archive denied after read-only contract lookup',async()=>{const x=await callRoute('owner82',`/contracts/${UUID}/archive`,'POST');assertDeny(x,403);assert.equal(x.sql.length,1)});
test('P0-09 master cannot archive salon contract',async()=>{const x=await callRoute('master29',`/contracts/${UUID}/archive`,'POST');assertDeny(x,403)});
test('P0-10 own salon archive may reach original SQL mutation handler (stub only)',async()=>{const x=await callRoute('owner81',`/contracts/${UUID}/archive`,'POST');assert.equal(x.status,200,JSON.stringify(x.body));assert.ok(x.sql.some(sql=>mutation.test(sql)));assert.equal(x.body.contract.status,'archived')});
test('P0-11 anonymous master contract history denied',async()=>{const x=await callRoute(null,'/contracts/master/m29/history');assertDeny(x,401)});
test('P0-12 foreign master contract history denied before private query',async()=>{const x=await callRoute('master39','/contracts/master/m29/history');assertDeny(x,403)});
test('P0-13 real master contract history allowed for own master',async()=>{const x=await callRoute('master29','/contracts/master/m29/history');assert.equal(x.status,200,JSON.stringify(x.body));assert.equal(x.body.contracts.length,1)});
test('P0-14 foreign salon owner denied creation before INSERT',async()=>{const x=await callRoute('owner82','/contracts','POST',{salon_id:81,master_id:29});assertDeny(x,403);assert.equal(x.sql.length,0)});
test('P0-15 unauthenticated contract creation denied before any SQL',async()=>{const x=await callRoute(null,'/contracts','POST',{salon_id:81,master_id:29});assertDeny(x,401)});
test('P0-16 own salon creation with inactive/unrelated master rejected before INSERT',async()=>{const x=await callRoute('owner81','/contracts','POST',{salon_id:81,master_id:39,terms_json:{model:'percentage'}});assertDeny(x,403);assert.ok(x.sql.every(sql=>!mutation.test(sql)))});
test('P0-17 master cannot accept another master’s contract',async()=>{const x=await callRoute('master39',`/contracts/${UUID}/accept`,'POST');assertDeny(x,403);assert.equal(x.sql.length,1)});
test('P0-18 owner cannot accept master-signature action',async()=>{const x=await callRoute('owner81',`/contracts/${UUID}/accept`,'POST');assertDeny(x,403);assert.equal(x.sql.length,1)});
test('P0-19 no-session master JWT cannot accept contract',async()=>{const x=await callRoute(null,`/contracts/${UUID}/accept`,'POST');assertDeny(x,401);assert.equal(x.sql.length,0)});
test('P0-20 owner salon creation endpoint denies foreign owner',async()=>{const x=await callRoute('owner82','/salons/salon81/contracts','POST',{master_id:29});assertDeny(x,403);assert.equal(x.sql.length,1)});
console.log('REAL_FULL_BUSINESS_HANDLERS=13; TESTED_DENY_AND_ALLOW_WITH_FAKE_SQL; PROD_AND_LOCAL_DB_WRITES=0');


// Full 13-route matrix: reject empty, legacy, expired, idle and mismatched
// principal BEFORE any SQL, even for endpoints that normally mutate money.
const fullContractMatrix=[
 ['POST','/contracts'],
 ['GET','/salons/salon81/contracts'],
 ['POST','/salons/salon81/contracts'],
 ['POST',`/contracts/${UUID}/accept`],
 ['POST',`/contracts/${UUID}/archive`],
 ['GET','/salons/salon81/rent-obligations'],
 ['GET','/masters/m29/rent-obligations'],
 ['GET','/salons/salon81/salary-obligations'],
 ['GET','/masters/m29/salary-obligations'],
 ['POST','/salons/salon81/rent-payments/confirm'],
 ['POST','/salons/salon81/salary-obligations/confirm'],
 ['GET','/contracts/master/m29/active'],
 ['GET','/contracts/master/m29/history']
];
for(const [method,path] of fullContractMatrix){
 for(const who of [null,'legacy','expired','idle','identityMismatch']){
  test('G2 all contracts '+method+' '+path+' denies '+String(who)+' before SQL',async()=>{
   const r=await callRoute(who,path,method);
   assertDeny(r,401);
   assert.equal(r.sql.length,0);
  });
 }
}

test('G2 rent confirmation rejects invalid amount without unhandled async failure or write',async()=>{
 const r=await callRoute('owner81','/salons/salon81/rent-payments/confirm','POST',{amount:'not-a-number'});
 assertDeny(r,400);
 assert.ok(r.sql.every(sql=>!mutation.test(sql)));
});
test('G2 salary confirmation rejects invalid amount without unhandled async failure or write',async()=>{
 const r=await callRoute('owner81','/salons/salon81/salary-obligations/confirm','POST',{amount:'not-a-number'});
 assertDeny(r,400);
 assert.ok(r.sql.every(sql=>!mutation.test(sql)));
});
