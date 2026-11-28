import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url);
const express=require("express");
const parse=express().get("query parser fn");
assert.equal(typeof parse,"function");
// Evaluate the exact registered GET handlers and helper, not the service's
// other imports (Gmail, provisioning etc.). All database calls are fixtures.
function factory(source){
 const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b)};
 const helper=source.includes("function ownerQueueMarketDispatch(")?section("function ownerQueueMarketDispatch(","export default function buildAdminOpenOwnerRouter"):"";
 const stats=section('  r.get("/stats",','  r.post("/precheck",');
 const requests=section('  r.get("/requests",','  r.get("/requests/:id",');
 const count=section("function toCountMap(","function normalizeOwnerType(");
 const routes=new Map();
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push({kind:"legacy-sql",sql,args});return {rows:[]}}};
 const scoped=async(_pool,query)=>{calls.push({kind:"US",query});return {ok:true,scope:{market:"US"}}};
 const context={r:{get:(path,handler)=>routes.set(path,handler)},pool,readUsOwnerQueueStats:scoped,readUsOwnerQueuePage:scoped,OWNER_TYPES:[],REQUEST_STATUSES:[],EMAIL_STATUSES:[],URLSearchParams,console:{error:()=>{}}};
 vm.runInNewContext(count+helper+stats+requests,context);
 return async(path,raw)=>{calls.length=0;const query=parse(raw);let status,body;
 const req={query,originalUrl:path+(raw?"?"+raw:"")};
 const res={status(n){status=n;return this},json(v){body=v;return this}};
 await routes.get(path)(req,res);
 return {status,body,calls:[...calls]};};
}
const source=readFileSync(new URL("../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
const run=factory(source);
const invalid=["market=US&market=KG","market=US&market=US","market[]=US","market[code]=US","market[__proto__]=US","market=","market=us","market=XX","market=US%20","market=US&market%5B%5D=KG","market%5B=US","market=US%00",Array.from({length:1001},(_,i)=>"x"+i+"=1").join("&")+"&market=US"];
const legacy=["","limit=5","market=KG","market=KZ","market=UNKNOWN"];
const scoped=["market=US","market=%55S","market=US&limit=2&owner_type=salon"];
for(const path of ["/stats","/requests"]){
 for(const raw of invalid)test(path+" rejects ambiguous/invalid market "+raw.slice(0,64),async()=>{const x=await run(path,raw);assert.equal(x.status,400);assert.equal(x.body.error,"ADMIN_QUEUE_FILTER_INVALID");assert.equal(x.calls.length,0)});
 for(const raw of legacy)test(path+" preserves existing legacy dispatch "+raw,async()=>{const x=await run(path,raw);assert.equal(x.status,200);assert.ok(x.calls.length>0&&x.calls.every(c=>c.kind==="legacy-sql"))});
 for(const raw of scoped)test(path+" retains scoped US dispatch "+raw,async()=>{const x=await run(path,raw);assert.equal(x.status,200);assert.equal(x.calls.length,1);assert.equal(x.calls[0].kind,"US");assert.equal(x.calls[0].query.market,"US")});
}
