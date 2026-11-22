// G2 real full Money Core router authorization matrix.
// All external money services are in-memory spies; no real database or Production writes.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import express from 'express';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const source=readFileSync(join(root,'src/routes/internal/money-core.js'),'utf8');
const context=vm.createContext({console,process,Date,Buffer,setTimeout,clearTimeout,URL});
const mod=new vm.SourceTextModule(source,{context,identifier:'real-money-core.js'});
const calls=[];
const spies={
  getWithdrawSettings:async(_pool,ownerType,ownerId)=>{
    calls.push('getWithdrawSettings');
    return {owner_type:ownerType,owner_id:Number(ownerId),auto_submit_enabled:false,private_destination:'ONLY_FOR_OWNER'};
  },
  resolveOwnerCurrencyCode:async()=>{calls.push('resolveOwnerCurrencyCode');return 'KGS';},
  rebuildOwnerBalanceFromLedger:async()=>{
    calls.push('rebuildOwnerBalanceFromLedger');return {owner_type:'salon',owner_id:10,available:150};
  },
  previewSettlementSplit:async()=>{
    calls.push('previewSettlementSplit');return {ok:true,settlement:{id:7,private_bank_ref:'PRIVATE_BANK_REFERENCE'},allocations:[]};
  },
  listProviderEvents:async()=>{calls.push('listProviderEvents');return [{id:4,private_ref:'PRIVATE_PROVIDER_REF'}];},
  getProviderEventById:async()=>{calls.push('getProviderEventById');return {id:4,private_ref:'PRIVATE_PROVIDER_REF'};},
  listReconciliationRuns:async()=>{calls.push('listReconciliationRuns');return [{id:3,private_bank_ref:'PRIVATE_RECONCILIATION_REF'}];},
  listReconciliationMismatches:async()=>{calls.push('listReconciliationMismatches');return [{id:9,bank_reference:'PRIVATE_BANK_REFERENCE'}];},
  listOwnerQrDestinations:async()=>{calls.push('listOwnerQrDestinations');return [{id:4,owner_secret:'PRIVATE_DESTINATION'}];},
  getActiveOwnerQrDestination:async()=>{calls.push('getActiveOwnerQrDestination');return {id:4,owner_secret:'PRIVATE_DESTINATION'};},
  listWithdrawRequests:async()=>{calls.push('listWithdrawRequests');return [{id:8,owner_secret:'PRIVATE_WITHDRAWAL'}];}
};
await mod.link((spec)=>{
  if(spec==='express')return new vm.SyntheticModule(['default'],function(){this.setExport('default',express);},{context});
  if(spec.endsWith('/middleware/AdminRuntimeGuard.js'))return new vm.SyntheticModule(['default'],function(){this.setExport('default',(_req,_res,next)=>next());},{context});
  const found=[...source.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];/g)].filter(m=>m[2]===spec);
  assert.ok(found.length>0,'STOP_UNEXPECTED_IMPORT_'+spec);
  const names=[...new Set(found.flatMap(m=>m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)))];
  return new vm.SyntheticModule(names,function(){
    for(const name of names){
      if(name==='createOwnerQrImageUploadMiddleware')this.setExport(name,()=>((_req,_res,next)=>next()));
      else if(name==='normalizeOwnerQrImageUploadError')this.setExport(name,()=>null);
      else if(name==='requireCurrencyCode')this.setExport(name,v=>v||'KGS');
      else if(name==='getMoneyCoreFlags')this.setExport(name,()=>{calls.push('getMoneyCoreFlags');return {};});
      else if(Object.hasOwn(spies,name))this.setExport(name,spies[name]);
      else this.setExport(name,()=>{throw Error('STOP_UNEXPECTED_SERVICE_'+name);});
    }
  },{context});
});
await mod.evaluate();
const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
function principal(role,grants=[],extra={}){
  const user_id=role==='master'?44:role==='system'?900:11;
  return {
    auth:{user_id,role,source:'session',session_id:'LOCAL_TEST_SESSION',session_expires_at:future,idle_timeout_at:future,...extra},
    identity:{user_id,role,ownership:grants,salons:role==='master'?[10]:[]}
  };
}
const salon={owner_type:'salon',owner_id:10};
const actors={
  anonymous:null,
  legacy:{...principal('salon_admin',[salon]),auth:{...principal('salon_admin',[salon]).auth,source:'jwt_legacy'}},
  expired:{...principal('salon_admin',[salon]),auth:{...principal('salon_admin',[salon]).auth,session_expires_at:past}},
  idle:{...principal('salon_admin',[salon]),auth:{...principal('salon_admin',[salon]).auth,idle_timeout_at:past}},
  owner:principal('salon_admin',[salon]),
  foreign:principal('salon_admin',[{owner_type:'salon',owner_id:99}]),
  masterMember:principal('master',[{owner_type:'master',owner_id:44}]),
  forgedAuth:{...principal('salon_admin',[]),auth:{...principal('salon_admin',[]).auth,ownership:[salon]}},
  mismatched:{...principal('salon_admin',[salon]),identity:{user_id:777,role:'salon_admin',ownership:[salon]}},
  admin:principal('system',[],{service_capability:'money-core:admin'})
};
const pool={query:async(sql)=>{
  const q=String(sql);calls.push('POOL_QUERY');
  if(q.includes('FROM public.salons WHERE slug = $1'))
    return {rows:[{id:10,slug:'demo',name:'Salon',enabled:true,status:'active'}]};
  if(q.includes('FROM public.masters WHERE slug = $1'))
    return {rows:[{id:44,slug:'demo',name:'Master',active:true}]};
  if(q.includes('FROM pg_class'))return {rows:[]};
  throw Error('STOP_UNEXPECTED_POOL_QUERY_'+q.slice(0,120));
}};
const app=express();app.use(express.json());
app.use((req,res,next)=>{
  const p=actors[req.headers['x-test-actor']||'anonymous'];
  if(p){req.auth=p.auth;req.identity=p.identity;}
  next();
});
app.use(mod.namespace.default(pool));
app.use((err,_req,res,_next)=>res.status(598).json({ok:false,error:String(err?.message||'UNKNOWN')}));
const server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
after(()=>new Promise(resolve=>server.close(resolve)));
async function request(actor,method,path,body){
  calls.length=0;
  const r=await fetch('http://127.0.0.1:'+server.address().port+path,{
    method,headers:{'content-type':'application/json','x-test-actor':actor},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  return {status:r.status,data:await r.json(),calls:[...calls]};
}

const privileged=[
 {method:'GET',path:'/money-core/legacy-map',service:'getMoneyCoreFlags'},
 {method:'GET',path:'/money-core/diagnostics',service:'POOL_QUERY'},
 {method:'POST',path:'/money-core/provider-events/4/reprocess',service:'getProviderEventById'},
 {method:'GET',path:'/money-core/reconciliation-mismatches',service:'listReconciliationMismatches'}
];
for(const endpoint of privileged){
 for(const actor of ['anonymous','legacy','expired','idle']){
  test('G2 private '+endpoint.path+' rejects '+actor+' before service',async()=>{
   const r=await request(actor,endpoint.method,endpoint.path);
   assert.equal(r.status,401,JSON.stringify(r.data));
   assert.equal(r.calls.length,0);
  });
 }
 for(const actor of ['owner','foreign','masterMember','forgedAuth']){
  test('G2 private '+endpoint.path+' rejects non-admin '+actor,async()=>{
   const r=await request(actor,endpoint.method,endpoint.path);
   assert.equal(r.status,403,JSON.stringify(r.data));
   assert.equal(r.calls.length,0);
  });
 }
 test('G2 private '+endpoint.path+' accepts verified system capability',async()=>{
  const r=await request('admin',endpoint.method,endpoint.path);
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.calls.includes(endpoint.service),true);
 });
}
const ownerPaths=[
 {type:'salon',base:'/salons/demo/money-core',good:'owner',wrong:'masterMember'},
 {type:'master',base:'/masters/demo/money-core',good:'masterMember',wrong:'owner'}
];
const tails=[
 {path:'/owner-qr-destinations',service:'listOwnerQrDestinations'},
 {path:'/owner-qr-destinations/active',service:'getActiveOwnerQrDestination'},
 {path:'/withdraw-settings',service:'getWithdrawSettings'},
 {path:'/withdraw-requests',service:'listWithdrawRequests'}
];
for(const own of ownerPaths){
 for(const tail of tails){
  const route=own.base+tail.path;
  for(const actor of ['anonymous','legacy','expired','idle']){
   test('G2 '+route+' denies '+actor+' before SQL',async()=>{
    const r=await request(actor,'GET',route);
    assert.equal(r.status,401,JSON.stringify(r.data));
    assert.equal(r.calls.length,0);
   });
  }
  for(const actor of ['foreign','forgedAuth','mismatched',own.wrong]){
   test('G2 '+route+' denies unrelated/malformed principal '+actor,async()=>{
    const r=await request(actor,'GET',route);
    assert.equal(r.status,403,JSON.stringify(r.data));
    assert.equal(r.calls.includes(tail.service),false);
   });
  }
  for(const actor of [own.good,'admin']){
   test('G2 '+route+' permits exact scoped '+actor,async()=>{
    const r=await request(actor,'GET',route);
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.calls.includes(tail.service),true);
   });
  }
 }
}
