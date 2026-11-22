import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { requireRole } from '../src/middleware/requireRole.js';

// CI-safe tests: no credentials, network, mutable DB, or Production access.
// Load real guard functions from full source files to verify cross-resource policy.
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function extractFunction(source,name){
 const regex=new RegExp('\\bfunction\\s+'+name+'\\s*\\(');
 const m=regex.exec(source);
 assert.ok(m,`missing source guard ${name}`);
 const begin=m.index;
 const open=source.indexOf('{',m.index);
 let depth=0;
 for(let i=open;i<source.length;i++){
  if(source[i]==='{')depth++;
  else if(source[i]==='}' && --depth===0)return source.slice(begin,i+1);
 }
 throw Error(`unbalanced function ${name}`);
}
function guards(file,names){
 const filePath=path.join(repoRoot,'src','routes','internal',file);
 const src=readFileSync(filePath,'utf8');
 const body=names.map(name=>extractFunction(src,name)).join('\n')+'\nthis.guards={'+names.join(',')+'};';
 const context=vm.createContext({});
 vm.runInContext(body,context,{timeout:1200,filename:filePath});
 return context.guards;
}
const salons=guards('salons.js',['safeInt','getIdentitySalonIds','hasSalonOwnership']);
const masters=guards('masters.js',['safeInt','getIdentityMasterIds','hasMasterOwnership']);
const contracts=guards('contracts.js',['safeInt','getIdentitySalonIds','hasSalonOwnership','getIdentityMasterIds','hasMasterOwnership']);
const money=guards('money-core.js',['getIdentityOwnerIds','hasMoneyCoreOwnerAccess','hasMoneyCorePrivilegedAccess']);

const salonOwner={auth:{role:'salon_admin',source:'session',session_id:'test-owner-session',user_id:20},identity:{salons:[12],masters:[],ownership:[{owner_type:'salon',owner_id:12}]}};
const master={auth:{role:'master',source:'session',session_id:'test-master-session',user_id:32},identity:{salons:[12],masters:[8],ownership:[{owner_type:'master',owner_id:8}]}};
const legacyOwner={auth:{role:'owner',source:'jwt_legacy',user_id:20},identity:salonOwner.identity};
const legacySystem={auth:{role:'system',source:'jwt_legacy',user_id:1},identity:{salons:[],masters:[],ownership:[]}};
const validSystem={auth:{role:'system',source:'session',session_id:'test-system-session',user_id:1},identity:{salons:[],masters:[],ownership:[]}};
const demoTime={session_expires_at:new Date(Date.now()+600000).toISOString(),idle_timeout_at:new Date(Date.now()+600000).toISOString()};
function middlewareResponse(){
 const res={code:0,payload:null,status(n){this.code=n;return this},json(p){this.payload=p;return this}};
 let passed=0;
 return {res,next(){passed++},get passed(){return passed}};
}

test('G2-01 owner direct salon is allowed',()=>assert.equal(salons.hasSalonOwnership(salonOwner,12),true));
test('G2-02 owner unrelated salon is denied',()=>assert.equal(salons.hasSalonOwnership(salonOwner,13),false));
test('G2-03 master salon membership is never owner access',()=>assert.equal(salons.hasSalonOwnership(master,12),false));
test('G2-04 legacy salon owner token is denied',()=>assert.equal(salons.hasSalonOwnership(legacyOwner,12),false));
test('G2-05 master direct record is allowed',()=>assert.equal(masters.hasMasterOwnership(master,8),true));
test('G2-06 cross-master record denied',()=>assert.equal(masters.hasMasterOwnership(master,9),false));
test('G2-07 owner cannot inherit master record',()=>assert.equal(masters.hasMasterOwnership({...salonOwner,identity:{...salonOwner.identity,masters:[8]}},8),false));
test('G2-08 contracts direct salon party allowed',()=>assert.equal(contracts.hasSalonOwnership(salonOwner,12),true));
test('G2-09 contracts master is not salon owner',()=>assert.equal(contracts.hasSalonOwnership(master,12),false));
test('G2-10 contracts direct master allowed',()=>assert.equal(contracts.hasMasterOwnership(master,8),true));
test('G2-11 contracts owner cannot impersonate master',()=>assert.equal(contracts.hasMasterOwnership(salonOwner,8),false));
test('G2-12 money-core owner may read own salon only',()=>assert.equal(money.hasMoneyCoreOwnerAccess(salonOwner,'salon',12),true));
test('G2-13 money-core owner cannot claim foreign salon or master',()=>{assert.equal(money.hasMoneyCoreOwnerAccess(salonOwner,'salon',13),false);assert.equal(money.hasMoneyCoreOwnerAccess(salonOwner,'master',8),false)});
test('G2-14 money-core master may read own master only',()=>{assert.equal(money.hasMoneyCoreOwnerAccess(master,'master',8),true);assert.equal(money.hasMoneyCoreOwnerAccess(master,'master',9),false);assert.equal(money.hasMoneyCoreOwnerAccess(master,'salon',12),false)});
test('G2-15 owner not globally privileged for money',()=>assert.equal(money.hasMoneyCorePrivilegedAccess(salonOwner),false));
test('G2-16 legacy owner has no money access',()=>assert.equal(money.hasMoneyCoreOwnerAccess(legacyOwner,'salon',12),false));
test('G2-17 legacy system JWT has no global bypass',()=>{assert.equal(money.hasMoneyCorePrivilegedAccess(legacySystem),false);assert.equal(money.hasMoneyCoreOwnerAccess(legacySystem,'salon',12),false);assert.equal(contracts.hasSalonOwnership(legacySystem,12),false)});
test('G2-18 verified system session without explicit service capability is not global',()=>{assert.equal(money.hasMoneyCorePrivilegedAccess(validSystem),false);assert.equal(money.hasMoneyCoreOwnerAccess(validSystem,'master',8),false)});
test('G2-19 forged capability on legacy JWT is denied',()=>assert.equal(money.hasMoneyCorePrivilegedAccess({...legacySystem,auth:{...legacySystem.auth,session_id:'faked',service_capability:'money-core:admin'}}),false));
test('G2-20 explicit authenticated service capability is necessary',()=>assert.equal(money.hasMoneyCorePrivilegedAccess({...validSystem,auth:{...validSystem.auth,service_capability:'money-core:admin'}}),true));
test('G2-21 requireAuth denies missing principal',()=>{const h=middlewareResponse();requireAuth({auth:null},h.res,h.next);assert.equal(h.res.code,401);assert.equal(h.passed,0)});
test('G2-22 requireAuth denies jwt_legacy without session',()=>{const h=middlewareResponse();requireAuth({auth:{user_id:20,role:'owner',source:'jwt_legacy'}},h.res,h.next);assert.equal(h.res.code,401);assert.equal(h.passed,0)});
test('G2-23 requireAuth accepts only valid session principal',()=>{const h=middlewareResponse();requireAuth({auth:{...salonOwner.auth,...demoTime}},h.res,h.next);assert.equal(h.passed,1)});
test('G2-24 requireAuth fails closed on invalid expiry',()=>{for(const exp of ['garbage',null,new Date(Date.now()-60000).toISOString()]){const h=middlewareResponse();requireAuth({auth:{...master.auth,session_expires_at:exp,idle_timeout_at:demoTime.idle_timeout_at}},h.res,h.next);assert.equal(h.res.code,401);assert.equal(h.passed,0)}});
test('G2-25 requireRole rejects forged role without active session',()=>{const h=middlewareResponse();requireRole('master')({auth:{user_id:32,role:'master',source:'jwt_legacy'}},h.res,h.next);assert.equal(h.res.code,401)});
test('G2-26 requireRole denies owner acting as master',()=>{const h=middlewareResponse();requireRole('master')({auth:{...salonOwner.auth,...demoTime}},h.res,h.next);assert.equal(h.res.code,403);assert.equal(h.passed,0)});
test('G2-27 requireRole allows own verified master',()=>{const h=middlewareResponse();requireRole('master')({auth:{...master.auth,...demoTime}},h.res,h.next);assert.equal(h.passed,1)});
test('G2-28 no tenant rights for blank principal',()=>{assert.equal(salons.hasSalonOwnership({auth:null,identity:null},12),false);assert.equal(money.hasMoneyCoreOwnerAccess({auth:null,identity:null},'salon',12),false)});
