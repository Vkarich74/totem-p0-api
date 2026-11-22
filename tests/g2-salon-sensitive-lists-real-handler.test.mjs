// G2 P0 real-handler regression for previously unguarded private salon lists.
// Executes the unmodified complete salons.js in isolated vm with stubbed services and SQL.
// Anonymous/foreign/expired requests must not reach personnel/service private SQL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, after } from 'node:test';
import vm from 'node:vm';
import express from 'express';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, 'src/routes/internal/salons.js'), 'utf8');
const authSource = readFileSync(join(root, 'src/middleware/requireAuth.js'), 'utf8');
const context = vm.createContext({console, Date, process, Buffer, setTimeout, clearTimeout, URL, URLSearchParams});
const bodyModule = new vm.SourceTextModule(source, {context, identifier: 'real-salons.js'});
const authModule = new vm.SourceTextModule(authSource, {context, identifier: 'real-requireAuth.js'});
const imports = {
  'express': {default: express},
  'notificationService.js': {countUnread:()=>0, listNotificationsForTarget:()=>[], markNotificationRead:()=>null},
  'webPushService.js': {revokeOwnerPushSubscription:()=>null,saveOwnerPushSubscription:()=>null},
  'ownerQrPayments.service.js': {listOwnerQrPaymentsForOwner:()=>[]},
  'paymentProjection.js': {buildPaymentProjectionResponse:()=>({}),getPaymentProjectionList:()=>[]},
  'paymentCollectionAnchors.service.js': {getCollectionAnchors:()=>[],closePaymentCollectionAnchorsForSalon:()=>[]},
  'calendarSlots.service.js': {releaseCalendarSlotForBooking:()=>null},
  'salonCalendar.service.js': {buildSalonCalendarResponse:()=>({})},
  'usOwnerLocations.js': {buildUsOwnerLocationsRouter:()=>express.Router()},
  'BusinessContext.js': {requireCurrencyCode:()=> 'KGS',resolveBusinessMarketContext:()=>({}),resolveOwnerMarketContext:()=>({})},
  'usServiceLink.service.js': {rejectLegacyUsServiceMutation:()=>false},
  'ownerCabinetProfile.service.js': {
    canonicalOwnerProfile:()=>({}),ownerProfileRevision:()=>null,
    validateOwnerProfilePatch:()=>({}),canonicalSalonContact:()=>({}),ownerProfilePayload:()=>({})
  }
};
const cache = new Map();
function moduleFor(specifier) {
  if(specifier.endsWith('/requireAuth.js')) return authModule;
  const key = specifier==='express'?'express':specifier.split('/').at(-1);
  if(!imports[key])throw new Error('STOP_UNEXPECTED_IMPORT_'+specifier);
  if(cache.has(key))return cache.get(key);
  const values=imports[key], keys=Object.keys(values);
  const mod=new vm.SyntheticModule(keys,function(){for(const k of keys)this.setExport(k,values[k])},{context});
  cache.set(key,mod);
  return mod;
}
await authModule.link(()=>{throw new Error('STOP_UNEXPECTED_AUTH_DEPENDENCY')});
await authModule.evaluate();
await bodyModule.link(moduleFor);
await bodyModule.evaluate();
const buildSalonsRouter=bodyModule.namespace.default;
const calls=[];
const pool={
  async query(sql,params){
    const s=String(sql);calls.push(s);
    if(/SELECT id FROM salons WHERE slug=\$1/i.test(s))return {rows:[{id:10}]};
    if(/FROM masters m/i.test(s))return {rows:[{id:201,name:'Synthetic Master',slug:'synthetic-master',status:'active'}]};
    if(/FROM salon_master_services sms/i.test(s))return {rows:[{id:501,salon_id:10,master_id:201,name:'Synthetic Service',price:100,active:true}]};
    throw Error('STOP_UNEXPECTED_DB_QUERY_'+s.slice(0,110));
  },
  connect(){throw Error('STOP_DB_WRITE_ATTEMPT')}
};
const future=new Date(Date.now()+3_600_000).toISOString();
const past=new Date(Date.now()-3_600_000).toISOString();
const principals={
  anonymous: null,
  legacy:{auth:{user_id:101,role:'salon_admin',source:'jwt_legacy'},identity:{salons:[10],ownership:[]}},
  expired:{auth:{user_id:101,role:'salon_admin',source:'session',session_id:'expired',session_expires_at:past,idle_timeout_at:future},identity:{salons:[10],ownership:[]}},
  foreign:{auth:{user_id:102,role:'salon_admin',source:'session',session_id:'foreign',session_expires_at:future,idle_timeout_at:future},identity:{salons:[11],ownership:[]}},
  master:{auth:{user_id:201,role:'master',source:'session',session_id:'master',session_expires_at:future,idle_timeout_at:future},identity:{salons:[10],masters:[201],ownership:[]}},
  owner:{auth:{user_id:101,role:'salon_admin',source:'session',session_id:'owner',session_expires_at:future,idle_timeout_at:future},identity:{salons:[10],ownership:[{owner_type:'salon',owner_id:10}]}}
};
const app=express();
app.use((req,res,next)=>{
  const who=principals[req.headers['x-local-test-actor']||'anonymous'];
  if(who){req.auth=who.auth;req.identity=who.identity;}
  next();
});
app.use(buildSalonsRouter(pool,(req,res,next)=>next()));
let server;
await new Promise((resolve,reject)=>{server=app.listen(0,'127.0.0.1',resolve);server.once('error',reject)});
after(()=>new Promise(resolve=>server.close(resolve)));
const port=server.address().port;
async function request(path,actor) {
  calls.length=0;
  const res=await fetch('http://127.0.0.1:'+port+path,{headers:{'x-local-test-actor':actor}});
  return {code:res.status,data:await res.json(),queries:calls.slice()};
}
for (const slug of ['masters','services']) {
  const path='/salons/synthetic-salon/'+slug;
  test('G2 '+slug+': anonymous/legacy/expired denied before ANY private SQL',async()=>{
    for(const actor of ['anonymous','legacy','expired']){
      const r=await request(path,actor);
      assert.equal(r.code,401,actor+' HTTP status');
      assert.equal(r.queries.length,0,actor+' SQL calls');
      assert.equal(r.data.ok,false);
    }
  });
  test('G2 '+slug+': unrelated owner/master rejected before personnel/service SQL',async()=>{
    for(const actor of ['foreign','master']){
      const r=await request(path,actor);
      assert.equal(r.code,403,actor+' HTTP status');
      assert.equal(r.queries.length,1,actor+' DB call count');
      assert.ok(!/FROM masters m|FROM salon_master_services sms/i.test(r.queries.join(' ')));
    }
  });
  test('G2 '+slug+': valid owner reaches original real handler',async()=>{
    const r=await request(path,'owner');
    assert.equal(r.code,200);
    assert.equal(r.data.ok,true);
    assert.equal(r.data[slug]?.length,1);
  });
}
