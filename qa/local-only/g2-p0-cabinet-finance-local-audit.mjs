// LOCAL-ONLY, NOT AUTOMATIC CI: requires explicitly prepared localhost PostgreSQL
// database totem_us_g2_authz_http_20261122; no network except 127.0.0.1.
// Command: node --experimental-vm-modules --test qa/local-only/g2-p0-cabinet-finance-local-audit.mjs
import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import {buildIdentityWithClient} from '../../src/middleware/resolveAuth.js';
import {requireAuth} from '../../src/middleware/requireAuth.js';

// G2 CABINET P0: actual, unmodified FULL production-derived salons.js and masters.js.
// All GETs use isolated local PostgreSQL in a single READ ONLY / REPEATABLE READ transaction.
// All POSTs use a throw-on-write SQL stub. No Production networking, mutations, secrets or deploy.
const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DATABASE='totem_us_g2_authz_http_20261122';
if(process.env.DATABASE_URL||process.env.JWT_SECRET||process.env.INTERNAL_API_TOKEN)throw Error('STOP_UNEXPECTED_RUNTIME_CREDENTIALS');
const client=new pg.Client({host:'127.0.0.1',port:5432,user:'postgres',database:DATABASE,ssl:false,connectionTimeoutMillis:6000,statement_timeout:11000});
await client.connect();
assert.equal((await client.query('SELECT current_database() AS db')).rows[0].db,DATABASE);
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const sqlLog=[];
const read=async (sql,params=[])=>{
  const q=String(sql).trim();
  if(!/^SELECT\b/i.test(q))throw Error('G2_BLOCKED_NON_READ_SQL');
  sqlLog.push({q,params});
  return client.query(q,params);
};
const db={query:read};
let writesAttempted=0;
const pool={query:read,connect:async()=>({
  query:async(sql,params=[])=>{
    const q=String(sql).trim();
    if(q==='BEGIN'||q==='ROLLBACK')return {rows:[],rowCount:0};
    if(/^SELECT\s+id\s+FROM\s+masters\s+WHERE\s+slug=\$1/i.test(q))return read(q,params);
    writesAttempted++;
    throw Error('G2_BLOCKED_TRANSACTION_QUERY');
  },release:()=>{}
})};

function stubExports(spec,src,context){
  if(spec==='express')return new vm.SyntheticModule(['default'],function(){this.setExport('default',express)},{context});
  if(spec==='crypto')return new vm.SyntheticModule(['default'],function(){this.setExport('default',crypto)},{context});
  if(spec.endsWith('/middleware/AdminRuntimeGuard.js'))return new vm.SyntheticModule(['default'],function(){this.setExport('default',(_req,_res,next)=>next())},{context});
  const found=[...src.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+["\']([^"\']+)["\'];/g)].filter(m=>m[2]===spec);
  assert.ok(found.length>=1,'source import '+spec);
  const set=new Set();
  for(const m of found){
    for(const piece of m[1].split(',')){
      const name=piece.trim().split(/\s+as\s+/)[0].trim();
      if(name)set.add(name);
    }
  }
  const names=[...set];
  return new vm.SyntheticModule(names,function(){
    for(const name of names){
      if(name==='buildUsOwnerLocationsRouter')this.setExport(name,()=>express.Router());
      else if(name==='createOwnerQrImageUploadMiddleware')this.setExport(name,()=>((_req,_res,next)=>next()));
      else if(name==='requireCurrencyCode')this.setExport(name,(v)=>v??'KGS');
      else if(spec.endsWith('/money-core/ledger.service.js') && name==='listMoneyLedgerEntries')this.setExport(name,async(_pool,params)=>{
        moneyCalls++;
        return (await read(`SELECT le.id,w.owner_type,w.owner_id,le.direction,le.amount_cents FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE w.owner_type=$1 AND w.owner_id=$2 ORDER BY le.id LIMIT 100`,[params.owner_type,Number(params.owner_id)])).rows;
      });
      else if(spec.endsWith('/money-core/ledger.service.js') && name==='getOwnerMoneyLedger')this.setExport(name,async(_pool,type,id)=>{
        moneyCalls++;
        return (await read(`SELECT le.id,w.owner_type,w.owner_id,le.direction,le.amount_cents FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE w.owner_type=$1 AND w.owner_id=$2 ORDER BY le.id LIMIT 100`,[type,Number(id)])).rows;
      });
      else if(spec.endsWith('/money-core/ledger.service.js') && name==='getMoneyLedgerEntryById')this.setExport(name,async(_pool,id)=>{
        moneyCalls++;
        return (await read(`SELECT le.id,w.owner_type,w.owner_id,le.direction,le.amount_cents FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE le.id=$1 LIMIT 1`,[id])).rows[0]??null;
      });
      else this.setExport(name,()=>{throw Error('G2_UNEXPECTED_SERVICE_CALLED_'+spec+'_'+name)});
    }
  },{context});
}
async function fullRouter(file){
  const srcRoot=root;
  const src=readFileSync(join(srcRoot,'src','routes','internal',file),'utf8');
  const context=vm.createContext({console,process,Date,Buffer,crypto,setTimeout,clearTimeout,URL});
  const mod=new vm.SourceTextModule(src,{context,identifier:'UNMODIFIED_FULL_'+file});
  await mod.link(spec=>stubExports(spec,src,context));
  await mod.evaluate();
  return mod.namespace.default;
}
let moneyCalls=0;
const buildSalons=await fullRouter('salons.js');
const buildMasters=await fullRouter('masters.js');
const buildMoney=await fullRouter('money-core.js');
const activeOwners=(await read(`SELECT u.id AS uid,s.id AS sid,s.slug
  FROM public.auth_users u JOIN public.owner_salon os ON os.owner_id=u.id::text
  JOIN public.salons s ON s.id=os.salon_id
  WHERE u.enabled IS TRUE AND u.role='salon_admin' AND os.status='active'
  AND s.enabled IS TRUE AND s.status='active' ORDER BY s.id,u.id`)).rows;
const activeMasters=(await read(`SELECT u.id AS uid,m.id AS mid,m.slug
  FROM public.auth_users u JOIN public.masters m ON m.user_id=u.id
  WHERE u.enabled IS TRUE AND u.role='master' AND m.active IS TRUE ORDER BY m.id`)).rows;
assert.ok(activeOwners.length>=2&&activeMasters.length>=2,'REAL_DIRECT_PRINCIPALS_NEEDED');
const identityByUser=new Map();
async function identity(uid){if(!identityByUser.has(uid))identityByUser.set(uid,await buildIdentityWithClient(db,uid,''));return identityByUser.get(uid)}
function choose(records,kind){return records.find(x=>kind==='salon'?x.sid>0:x.mid>0)}
const salon=choose(activeOwners,'salon');
const ownerId=await identity(salon.uid);
const foreignOwner=await (async()=>{for(const x of activeOwners){const id=await identity(x.uid);if(!id.salons.includes(salon.sid))return {...x,identity:id};}throw Error('NO_UNRELATED_OWNER')})();
const sameSalonMaster=await (async()=>{for(const x of activeMasters){const id=await identity(x.uid);if(id.salons.includes(salon.sid))return {...x,identity:id}}return null})();
const master=activeMasters.find(x=>x.mid>0);
const masterIdentity=await identity(master.uid);
const foreignMaster=await (async()=>{for(const x of activeMasters){const id=await identity(x.uid);if(!id.masters.includes(master.mid))return {...x,identity:id};}throw Error('NO_UNRELATED_MASTER')})();
const future=new Date(Date.now()+3600_000).toISOString();
const expired=new Date(Date.now()-3600_000).toISOString();
const realMoneySalons=(await read(`SELECT DISTINCT s.id AS sid,u.id AS uid,s.slug FROM public.salons s JOIN public.owner_salon os ON os.salon_id=s.id JOIN public.auth_users u ON u.id::text=os.owner_id JOIN totem_test.wallets w ON w.owner_type='salon' AND w.owner_id=s.id JOIN totem_test.ledger_entries le ON le.wallet_id=w.id WHERE os.status='active' AND s.enabled IS TRUE AND s.status='active' AND u.enabled IS TRUE AND u.role='salon_admin' ORDER BY s.id LIMIT 5`)).rows;
const realMoneyMasters=(await read(`SELECT DISTINCT m.id AS mid,u.id AS uid,m.slug FROM public.masters m JOIN public.auth_users u ON u.id=m.user_id JOIN totem_test.wallets w ON w.owner_type='master' AND w.owner_id=m.id JOIN totem_test.ledger_entries le ON le.wallet_id=w.id WHERE m.active IS TRUE AND u.enabled IS TRUE AND u.role='master' ORDER BY m.id LIMIT 5`)).rows;
assert.ok(realMoneySalons.length>=1&&realMoneyMasters.length>=1,'REAL_FINANCE_OWNER_FIXTURE_REQUIRED');
const moneySalon=realMoneySalons[0],moneyMaster=realMoneyMasters[0];
const makeAuth=(user,role,expiry=future,source='session')=>({user_id:user,role,source,session_id:'G2_RO_FIXTURE_ONLY',session_expires_at:expiry,idle_timeout_at:expiry});
const who={
 owner:{auth:makeAuth(salon.uid,'salon_admin'),identity:ownerId},
 foreignOwner:{auth:makeAuth(foreignOwner.uid,'salon_admin'),identity:foreignOwner.identity},
 master:{auth:makeAuth(master.uid,'master'),identity:masterIdentity},
 foreignMaster:{auth:makeAuth(foreignMaster.uid,'master'),identity:foreignMaster.identity},
 legacy:{auth:makeAuth(salon.uid,'salon_admin',future,'jwt_legacy'),identity:ownerId},
 expired:{auth:makeAuth(salon.uid,'salon_admin',expired),identity:ownerId}
};
if(sameSalonMaster)who.sameSalonMaster={auth:makeAuth(sameSalonMaster.uid,'master'),identity:sameSalonMaster.identity};
who.moneySalon={auth:makeAuth(moneySalon.uid,'salon_admin'),identity:await identity(moneySalon.uid)};
who.moneyMaster={auth:makeAuth(moneyMaster.uid,'master'),identity:await identity(moneyMaster.uid)};
// Mirror real resolveAuth: buildIdentityWithClient returns relationship arrays,
// then resolveAuth adds principal user_id and role to req.identity.
for(const entry of Object.values(who)){
  if(entry?.auth && entry?.identity){
    entry.identity={...entry.identity,user_id:entry.auth.user_id,role:entry.auth.role};
  }
}
const app=express();app.use(express.json());
app.use('/internal',(req,_res,next)=>{const v=who[req.headers['x-g2-principal']];req.auth=v?.auth||null;req.identity=v?.identity||null;next()},requireAuth,
  buildSalons(pool,(_req,_res,next)=>next()),buildMasters(pool,(_req,_res,next)=>next()),buildMoney(pool));
app.use((err,_req,res,_next)=>res.status(598).json({ok:false,error:String(err.message||'unknown').slice(0,75)}));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
const base=`http://127.0.0.1:${server.address().port}/internal`;
const send=async(actor,path,method='GET',body={})=>{
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(actor?{'x-g2-principal':actor}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(7000)});
  return {status:response.status,body:await response.json()};
};
after(async()=>{await new Promise(resolve=>server.close(resolve));try{await client.query('ROLLBACK')}finally{await client.end()}});
const ownSalon=`/salons/${encodeURIComponent(salon.slug)}`;
const ownMaster=`/masters/${encodeURIComponent(master.slug)}`;
const getRows=async(sql,params=[])=> (await read(sql,params)).rows;
const salPaths=['clients','bookings','ledger'];
const mstPaths=['clients','bookings','ledger'];

// Six REAL business handlers × anonymous, foreign, role-mismatched and authorized.
for(const field of salPaths){
  test(`S-${field}: anonymous denied before ANY private SQL`,async()=>{const before=sqlLog.length;const r=await send(null,`${ownSalon}/${field}`);assert.equal(r.status,401);assert.equal(sqlLog.length,before)});
  test(`S-${field}: foreign owner rejected, no PII`,async()=>{const r=await send('foreignOwner',`${ownSalon}/${field}`);assert.equal(r.status,403);assert.equal(r.body.ok,false)});
  test(`S-${field}: master cannot read owner cabinet`,async()=>{const r=await send('master',`${ownSalon}/${field}`);assert.equal(r.status,403)});
  test(`S-${field}: real active owner GET matches isolated DB`,async()=>{
    const r=await send('owner',`${ownSalon}/${field}`);assert.equal(r.status,200,'EXPECTED_200_'+field);
    assert.equal(r.body.ok,true);
    const list=r.body[field];assert.ok(Array.isArray(list),'EXPECTED_'+field+'_ARRAY');
    const want=field==='clients' ? await getRows('SELECT id FROM public.clients WHERE salon_id=$1',[salon.sid]) :
      field==='bookings' ? await getRows('SELECT id FROM public.bookings WHERE salon_id=$1',[salon.sid]) :
      await getRows("SELECT le.id FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE w.owner_type='salon' AND w.owner_id=$1 ORDER BY le.created_at DESC LIMIT 100",[salon.sid]);
    assert.equal(list.length,want.length,'SCOPED_ROW_COUNT_'+field);
    const ids=new Set(want.map(x=>String(x.id)));
    assert.ok(list.every(row=>ids.has(String(row.id))),'NEVER_RETURN_CROSS_SALON_'+field);
  });
}
for(const field of mstPaths){
  test(`M-${field}: anonymous denied before ANY private SQL`,async()=>{const before=sqlLog.length;const r=await send(null,`${ownMaster}/${field}`);assert.equal(r.status,401);assert.equal(sqlLog.length,before)});
  test(`M-${field}: foreign master denied`,async()=>{const r=await send('foreignMaster',`${ownMaster}/${field}`);assert.equal(r.status,403)});
  test(`M-${field}: owner cannot read master private resource`,async()=>{const r=await send('owner',`${ownMaster}/${field}`);assert.equal(r.status,403)});
  test(`M-${field}: real active master GET matches isolated DB`,async()=>{
    const r=await send('master',`${ownMaster}/${field}`);assert.equal(r.status,200,'EXPECTED_200_'+field);
    assert.equal(r.body.ok,true);const list=r.body[field];assert.ok(Array.isArray(list),'EXPECTED_'+field+'_ARRAY');
    const want=field==='clients' ? await getRows('SELECT DISTINCT c.id FROM public.clients c JOIN public.bookings b ON b.client_id=c.id WHERE b.master_id=$1',[master.mid]) :
      field==='bookings' ? await getRows('SELECT id FROM public.bookings WHERE master_id=$1',[master.mid]) :
      await getRows("SELECT le.id FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE w.owner_type='master' AND w.owner_id=$1 ORDER BY le.created_at DESC LIMIT 100",[master.mid]);
    assert.equal(list.length,want.length,'SCOPED_ROW_COUNT_'+field);
    const ids=new Set(want.map(x=>String(x.id)));
    assert.ok(list.every(row=>ids.has(String(row.id))),'NEVER_RETURN_CROSS_MASTER_'+field);
  });
}
test('S-clients: legacy token denied at actual middleware',async()=>{const before=sqlLog.length;const r=await send('legacy',`${ownSalon}/clients`);assert.equal(r.status,401);assert.equal(before,sqlLog.length)});
test('S-ledger: expired session denied at actual middleware',async()=>{const before=sqlLog.length;const r=await send('expired',`${ownSalon}/ledger`);assert.equal(r.status,401);assert.equal(before,sqlLog.length)});
for(const actor of [null,'foreignMaster','owner']){
 test(`M-bookings-POST: ${actor||'anonymous'} never causes SQL mutation`,async()=>{
  const count=writesAttempted;
  const r=await send(actor,`${ownMaster}/bookings`,'POST',{client_name:'SYNTHETIC_DO_NOT_WRITE',phone:'+996700000000',service_id:999999,start_at:new Date(Date.now()+3600000).toISOString()});
  assert.ok([401,403].includes(r.status),'M_BOOKING_AUTH_DENY_EXPECTED');
  assert.equal(writesAttempted,count,'NO_BUSINESS_SQL_AFTER_DENY');
 });
}

// Extra finance-core actual money-core business handlers; financial ledger service is
// replaced ONLY by explicit read-only SELECTs against the isolated PostgreSQL clone.
// Direct route authorization and parameter handling are the unmodified original code.
const moneyLedgerOwn=await read(`SELECT le.id,w.owner_type,w.owner_id FROM totem_test.ledger_entries le JOIN totem_test.wallets w ON w.id=le.wallet_id WHERE w.owner_type='salon' AND w.owner_id=$1 ORDER BY le.id LIMIT 1`,[moneySalon.sid]);
assert.ok(moneyLedgerOwn.rows.length>0,'ACTUAL_LOCAL_FINANCE_LEDGER_ROW');
const entryId=moneyLedgerOwn.rows[0].id;
const moneySalonPath='/money-core/ledger?owner_type=salon&owner_id='+moneySalon.sid;
const moneyMasterPath='/money-core/owners/master/'+moneyMaster.mid+'/ledger';
for(const [label,path,actor] of [
 ['MC-01 anonymous finance list',moneySalonPath,null],
 ['MC-02 unrelated master finance list',moneySalonPath,'moneyMaster'],
 ['MC-03 non-owner salon finance list',moneySalonPath,'foreignOwner'],
 ['MC-04 salon user foreign master finance list',moneyMasterPath,'moneySalon'],
 ['MC-05 anon finance entry by id','/money-core/ledger/'+entryId,null],
]){
 test(label+' denied without finance service call',async()=>{
    const before=moneyCalls;
    const x=await send(actor,path);
    assert.equal(x.status,actor?403:401);
    assert.equal(moneyCalls,before,'MONEY_CORE_SERVICE_MUST_NOT_BE_CALLED');
 });
}
test('MC-06 foreign master gets 403 after one read-only entry-ownership lookup',async()=>{
  // The handler must resolve ownership of an entry before deciding access.
  // A read-only lookup is permitted; a returned private entry is not.
  const before=moneyCalls;
  const x=await send('moneyMaster','/money-core/ledger/'+entryId);
  assert.equal(x.status,403);
  assert.equal(x.body.ok,false);
  assert.equal(x.body.entry,undefined);
  assert.equal(moneyCalls,before+1,'ONE_READONLY_METADATA_LOOKUP');
});
test('MC-07 valid finance salon owner can read only its ledger',async()=>{
  const x=await send('moneySalon',moneySalonPath);
  assert.equal(x.status,200);assert.equal(x.body.ok,true);assert.ok(Array.isArray(x.body.entries));assert.ok(x.body.entries.length>0);
  assert.ok(x.body.entries.every(v=>v.owner_type==='salon'&&Number(v.owner_id)===moneySalon.sid));
});
test('MC-08 valid master can read only its ledger',async()=>{
  const x=await send('moneyMaster',moneyMasterPath);
  assert.equal(x.status,200);assert.equal(x.body.ok,true);assert.ok(x.body.entries.length>0);
  assert.ok(x.body.entries.every(v=>v.owner_type==='master'&&Number(v.owner_id)===moneyMaster.mid));
});
test('MC-09 valid finance owner can read own single entry',async()=>{
  const x=await send('moneySalon','/money-core/ledger/'+entryId);
  assert.equal(x.status,200);assert.equal(x.body.ok,true);assert.equal(String(x.body.entry.id),String(entryId));
});
test('MC-10 noncanonical owner id is never treated as numeric identifier',async()=>{
  const before=moneyCalls;
  const x=await send('moneySalon','/money-core/ledger?owner_type=salon&owner_id='+moneySalon.sid+'garbage');
  assert.equal(x.status,403,'STRICT_INTEGER_REQUIRED');assert.equal(moneyCalls,before,'NO_SERVICE_ON_INVALID_ID');
});
for(const principal of [null,'moneySalon','moneyMaster']){
 test('MC-11 ledger mutation denied to '+(principal||'anonymous'),async()=>{
   const before=moneyCalls;
   const x=await send(principal,'/money-core/ledger/movements','POST',{owner_type:'salon',owner_id:moneySalon.sid,amount_cents:100});
   assert.ok([401,403].includes(x.status));assert.equal(moneyCalls,before,'NO_LEDGER_SERVICE_WRITE');
 });
}
console.log('G2_FULL_MONEY_ROUTER=85_ROUTES; ACTUAL_HANDLERS_WITH_READONLY_FINANCE_SELECT=TRUE; PRODUCTION_WRITES=0');

console.log('G2_ACTUAL_BUSINESS_HANDLERS=6; AUTH_SOURCE=REAL_LOCAL_POSTGRES_DIRECT_GRANTS; DATABASE=ISOLATED_READ_ONLY; NO_FINANCE_WRITE; REQUESTS=29+; SIDE_EFFECTS=0');
