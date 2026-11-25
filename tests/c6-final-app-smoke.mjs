// Real Express startup and routing, isolated database transport for boot DDL.
// No external I/O, no production env/secrets. No release fence mock.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
if(process.env.C6_PREDEPLOY_ISOLATED!=='YES'||process.env.DATABASE_URL||process.env.REDIS_URL)throw Error('ISOLATED_ONLY');
const calls=[];
const pool={async query(sql){
 const normalized=String(sql).trim().replace(/\s+/g,' ');
 if(!/^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS slug_reservations(?:_active_slug_idx|_status_expires_idx)?\b/.test(normalized))throw Error('UNEXPECTED_STARTUP_SQL');
 calls.push(normalized);return {rows:[],rowCount:0};
},async connect(){throw Error('UNEXPECTED_CONNECTION')}};
for(const p of ['../src/db.js','../src/db/pool.js'])mock.module(new URL(p,import.meta.url),{namedExports:{pool}});
mock.module(new URL('../db/index.js',import.meta.url),{namedExports:{pool,sqlite:null},defaultExport:{pool,sqlite:null}});
const no=()=>{throw Error('UNEXPECTED_EXTERNAL_IO')};
globalThis.fetch=no;
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const options=Array.isArray(args[0])?args[0][0]:args[0];
 if(!options||typeof options!=='object'||!['127.0.0.1','localhost'].includes(options.host))throw Error('EXTERNAL_SOCKET_DENIED');
 return connect.apply(this,args);
};
const original=http.Server.prototype.listen;
let server;
http.Server.prototype.listen=function(port,host,callback){
 assert.equal(String(port),'0');assert.equal(host,'0.0.0.0');server=this;return original.call(this,0,'127.0.0.1',callback);
};
process.env.PORT='0';process.env.GIT_SHA='predeploy-ci';
process.env.AUTO_FINANCE_LOOP_ENABLED='false';process.env.FINANCE_MV_AUTO_REFRESH_ENABLED='false';
for(const k of ['RUNTIME_ENABLED','RUNTIME_RELEASE_APPROVED','RECONCILIATION_ENABLED','BATCH_READBACK_ENABLED','ACTIVATION_ENABLED','ACCESS_ENABLED'])process.env['TOTEM_US_ODOO_SAAS_'+k]='true';
try{
 await import('../src/app.js');
 assert.ok(server);if(!server.listening)await once(server,'listening');
 const port=server.address().port;
 const req=(method,path,body)=>new Promise((resolve,reject)=>{
  const r=http.request({host:'127.0.0.1',port,path,method,headers:{'Content-Type':'application/json'}},res=>{
   let data='';res.on('data',x=>data+=x);res.on('end',()=>resolve({status:res.statusCode,body:data}));
  });r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));
 });
 assert.equal((await req('GET','/')).status,200);
 const health=await req('GET','/health');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).ok,true);
 const version=await req('GET','/version');assert.equal(version.status,200);assert.equal(JSON.parse(version.body).runtime.git_sha,'predeploy-ci');
 for(const path of ['/internal/admin/open-owner/requests/1/activate','/internal/admin/open-owner/requests/1/send-email','/internal/admin/open-owner/requests/1/billing-reconcile','/internal/admin/open-owner/requests/1/email-reconcile']){
  const r=await req('POST',path,{});assert.ok([401,403].includes(r.status),path+' '+r.status);
 }
 const old=await req('POST','/internal/billing/auto-charge/run',{});assert.equal(old.status,410);
 const {commercialWriterRelease}=await import('../src/services/provision/usCommercialWriterRelease.js');
 const {usSaasRuntimeGate}=await import('../src/services/billing/usSaasRuntime.js');
 assert.equal(commercialWriterRelease().release,'HOLD');assert.equal(usSaasRuntimeGate(process.env),'HOLD');
 assert.equal(calls.length,3);
 console.log('C6_FINAL_REAL_EXPRESS_BOOT_AND_AUTH_BOUNDARY_PASS');
}finally{
 if(server)await new Promise(r=>server.close(r));
}
process.exit(0);
