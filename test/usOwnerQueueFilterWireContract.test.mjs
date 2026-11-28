import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import {readUsOwnerQueueStats,readUsOwnerQueuePage} from "../src/services/provision/ownerOpeningQueueRead.js";
const require=createRequire(import.meta.url);
const parse=require("express")().get("query parser fn");
const source=readFileSync(process.env.QUEUE_ROUTE_SOURCE??new URL("../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b)};
const routes=new Map(),calls=[];
const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes("WITH scoped AS")?[{total:0,by_status:{},by_email_status:{}}]:[]}}};
vm.runInNewContext(section("function toCountMap(","function normalizeOwnerType(")+section("function ownerQueueMarketDispatch(","export default function buildAdminOpenOwnerRouter")+section('  r.get("/stats",','  r.post("/precheck",')+section('  r.get("/requests",','  r.get("/requests/:id",'),{r:{get:(p,h)=>routes.set(p,h)},pool,readUsOwnerQueueStats,readUsOwnerQueuePage,OWNER_TYPES:[],REQUEST_STATUSES:[],EMAIL_STATUSES:[],URLSearchParams,console:{error:()=>{}}});
async function run(path,raw){calls.length=0;let status,body;const res={status(n){status=n;return this},json(v){body=v;return this}};await routes.get(path)({query:parse(raw),originalUrl:path+"?"+raw},res);return {status,body,calls:[...calls]}}
const cursor=JSON.stringify({v:1,market:"US",owner_type:null,status:null,at:"2026-11-28 10:00:00+06",id:"9"});
const fields={owner_type:"salon",status:"approved",limit:"5",cursor};
const overflow="market=US&"+Array.from({length:1000},(_,i)=>"x"+i+"=1").join("&");
for(const path of ["/requests","/stats"]){
 const keys=path==="/stats"?["owner_type","status","cursor"]:Object.keys(fields);
 for(const key of keys){
  const raw=overflow+"&"+key+"="+encodeURIComponent(fields[key]);
  test(path+" rejects discarded "+key,async()=>{assert.equal(parse(raw)[key],undefined);const x=await run(path,raw);assert.equal(x.status,400);assert.equal(x.body.error,path==="/stats"?"ADMIN_QUEUE_FILTER_INVALID":key==="limit"?"ADMIN_QUEUE_LIMIT_INVALID":key==="cursor"?"ADMIN_QUEUE_CURSOR_INVALID":"ADMIN_QUEUE_FILTER_INVALID");assert.equal(x.calls.length,0)});
 }
 test(path+" allows absent optional fields",async()=>{const x=await run(path,"market=US");assert.equal(x.status,200);assert.equal(x.calls.length,1)});
}
for(const key of Object.keys(fields)){
 for(const suffix of ["[]=x","[__proto__]=x","="+encodeURIComponent(fields[key])+"&"+key+"=x"]){
  test("requests rejects invalid shape "+key+suffix.slice(0,20),async()=>{const x=await run("/requests","market=US&"+key+suffix);assert.equal(x.status,400);assert.equal(x.calls.length,0)});
 }
}
test("valid filter and limit",async()=>{const x=await run("/requests","market=US&owner_type=salon&status=approved&limit=5");assert.equal(x.status,200);assert.equal(x.body.pagination.limit,5);assert.equal(x.body.pagination.scope.owner_type,"salon");assert.equal(x.body.pagination.scope.status,"approved");assert.deepEqual(x.calls[0].args,["US","salon","approved",6])});
test("valid encoded cursor",async()=>{const x=await run("/requests","market=US&cursor="+encodeURIComponent(cursor));assert.equal(x.status,200);assert.deepEqual(x.calls[0].args,["US","2026-11-28 10:00:00+06","9",101])});
test("stats limit remains ignored as before",async()=>{const x=await run("/stats","market=US&limit=5");assert.equal(x.status,200);assert.equal(x.calls.length,1)});
