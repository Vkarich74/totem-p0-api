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
  listReconciliationRuns:async()=>{calls.push('listReconciliationRuns');return [{id:3,private_bank_ref:'PRIVATE_RECONCILIATION_REF'}];}
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
      else if(name==='getMoneyCoreFlags')this.setExport(name,()=>({}));
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
const pool={query:async()=>{calls.push('POOL_QUERY');throw Error('STOP_UNEXPECTED_POOL_QUERY');}};
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
const secured=[
  {method:'POST',path:'/money-core/settlements/7/split/preview',service:'previewSettlementSplit'},
  {method:'POST',path:'/money-core/owners/salon/10/balance/rebuild',service:'rebuildOwnerBalanceFromLedger'},
  {method:'GET',path:'/money-core/provider-events',service:'listProviderEvents'},
  {method:'GET',path:'/money-core/provider-events/4',service:'getProviderEventById'},
  {method:'GET',path:'/money-core/reconciliation',service:'listReconciliationRuns'}
];
for(const endpoint of secured){
  for(const who of ['anonymous','legacy','expired','idle']){
    test('G2 '+endpoint.path+' rejects '+who+' before private service',async()=>{
      const r=await request(who,endpoint.method,endpoint.path);
      assert.equal(r.status,401,JSON.stringify(r.data));
      assert.equal(r.calls.length,0);
    });
  }
  for(const who of ['owner','foreign','masterMember','forgedAuth']){
    test('G2 '+endpoint.path+' rejects non-privileged '+who,async()=>{
      const r=await request(who,endpoint.method,endpoint.path);
      assert.equal(r.status,403,JSON.stringify(r.data));
      assert.equal(r.calls.length,0);
    });
  }
  test('G2 '+endpoint.path+' allows only authorized system capability',async()=>{
    const r=await request('admin',endpoint.method,endpoint.path);
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.calls.includes(endpoint.service),true);
  });
}
const setting='/money-core/owners/salon/10/withdraw-settings';
for(const who of ['anonymous','legacy','expired','idle']){
  test('G2 withdraw-settings '+who+' fails before SQL',async()=>{
    const r=await request(who,'GET',setting);
    assert.equal(r.status,401,JSON.stringify(r.data));
    assert.equal(r.calls.length,0);
  });
}
for(const who of ['foreign','masterMember','forgedAuth','mismatched']){
  test('G2 withdraw-settings rejects '+who+' owner spoof',async()=>{
    const r=await request(who,'GET',setting);
    assert.equal(r.status,403,JSON.stringify(r.data));
    assert.equal(r.calls.length,0);
  });
}
for(const who of ['owner','admin']){
  test('G2 withdraw-settings permits '+who+' direct scope',async()=>{
    const r=await request(who,'GET',setting);
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.settings.private_destination,'ONLY_FOR_OWNER');
    assert.deepEqual(r.calls,['getWithdrawSettings']);
  });
}
for(const bad of ['10garbage','0','1.2','-4']){
  test('G2 withdraw-settings refuses noncanonical owner id '+bad,async()=>{
    const r=await request('owner','GET','/money-core/owners/salon/'+bad+'/withdraw-settings');
    assert.notEqual(r.status,200);
    assert.equal(r.calls.length,0);
  });
}
