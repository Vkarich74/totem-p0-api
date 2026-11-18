// Only in-memory SQL stubs, no real PostgreSQL or test salon creation.
import test from "node:test";
import assert from "node:assert/strict";
import buildMastersRouter from "../routes/internal/masters.js";
import {
  normalizeUsWeeklyHours,validateUsHoursWriteBody,
  usHoursRevision,weeklyHoursDisplay,
} from "../services/usMasterWorkingHours.service.js";

const SAMPLE=[
  {weekday:1,start_time:"09:00",end_time:"17:00",
    break_start:"12:00",break_end:"13:00"},
];
const EXTENDED=[
  {weekday:1,start_time:"08:00",end_time:"17:00",
    break_start:"12:00",break_end:"13:00"},
  {weekday:5,start_time:"10:00",end_time:"16:00",
    break_start:null,break_end:null},
];
const owner={id:41,user_id:17,active:true,slug:"existing-master"};
const location={
  location_id:78,salon_id:34,salon_slug:"existing-salon",
  salon_name:"Existing salon",location_code:"primary",
  state_code:"CA",city_name:"Los Angeles",
  timezone_name:"America/Los_Angeles",
  is_primary:true,
};

class MemoryPool {
  constructor(){
    this.rows=SAMPLE.map(row=>({...row}));
    this.auth=true;this.master={...owner};this.active=true;
    this.hasUsRelation=true;this.upcoming=false;
    this.blocked=false;this.corruptReadback=false;
    this.calls=[];this.writes=0;this.rollbacks=0;
  }
  async query(sql,params=[]){return this.run(sql,params)}
  async connect(){
    const db=this;let previous=null;
    return {
      async query(sql,params=[]){
        const q=String(sql).replace(/\s+/g," ").trim();
        if(q==="BEGIN"){
          previous={rows:structuredClone(db.rows),writes:db.writes};
          db.calls.push(q);return {rows:[]};
        }
        if(q==="COMMIT"){previous=null;db.calls.push(q);return {rows:[]};}
        if(q==="ROLLBACK"){
          db.calls.push(q);db.rollbacks++;
          if(previous){db.rows=previous.rows;db.writes=previous.writes;}
          previous=null;return {rows:[]};
        }
        return db.run(sql,params);
      },
      release(){}
    };
  }
  async run(sql,params=[]){
    const q=String(sql).replace(/\s+/g," ").trim();
    this.calls.push(q);
    if(q.startsWith("SET LOCAL"))return {rows:[]};
    if(q.includes("FROM public.masters WHERE slug=$1") &&
       q.includes("user_id,active")){
      return {rows:params[0]===this.master.slug?[{...this.master}]:[]};
    }
    if(q.includes("FROM public.auth_users WHERE id=$1")){
      return {rows:this.auth?[{"?column?":1}]:[]};
    }
    if(q.includes("FROM public.master_salon ms") &&
       q.includes("JOIN public.us_salon_locations l")){
      const all=this.hasUsRelation&&this.active?[{...location}]:[];
      const selected=params.length===3
        ? all.filter(l=>l.salon_slug===params[1]&&l.location_code===params[2])
        : all;
      return {rows:selected};
    }
    if(q.includes("FROM public.billing_subscriptions")){
      return {rows:this.blocked
        ? [{subscription_status:"blocked",blocked_at:"2026-01-01"}]
        : []};
    }
    if(q.includes("FROM public.us_location_master_working_hours") &&
       q.startsWith("SELECT")){
      const data=this.corruptReadback&&this.writes
        ? [{...this.rows[0],weekday:3}]:this.rows;
      return {rows:structuredClone(data)};
    }
    if(q.startsWith("SELECT b.id FROM public.bookings b") &&
       q.includes("us_booking_location_links")){
      return {rows:this.upcoming?[{id:200}]:[]};
    }
    if(q.startsWith("DELETE FROM public.us_location_master_working_hours")){
      this.rows=[];this.writes++;return {rows:[],rowCount:1};
    }
    if(q.startsWith("INSERT INTO public.us_location_master_working_hours")){
      this.rows.push({
        weekday:params[2],
        start_time:params[3],end_time:params[4],
        break_start:params[5],break_end:params[6],
      });this.writes++;return {rows:[],rowCount:1};
    }
    throw new Error("MOCK_UNEXPECTED_SQL: "+q.slice(0,200));
  }
}
function params({
  method="GET",scope=false,salonSlug="existing-salon",
  code="primary",authRole="master",source="session",
  authUser=17,identity=[41],body,
}={}){
  return {method,
    params:{slug:"existing-master"},
    query:scope?{salon_slug:salonSlug,location_code:code}:{},
    auth:{role:authRole,source,user_id:authUser},
    identity:{masters:identity},
    body,
  };
}
async function dispatch(db,options={}){
  const req=params(options);
  const router=buildMastersRouter(db,(_req,_res,next)=>next());
  const route=router.stack.find(item =>
    item.route?.path==="/masters/:slug/us-working-hours" &&
    item.route.methods[req.method.toLowerCase()]
  );
  assert.ok(route,"CANONICAL_MASTER_WORKING_HOURS_HANDLER_MISSING");
  const res={statusCode:200,body:null,headers:{},
    set(k,v){this.headers[k]=v;return this;},
    status(v){this.statusCode=v;return this;},
    json(v){this.body=v;return this;},
  };
  await route.route.stack.at(-1).handle(req,res);
  return {status:res.statusCode,body:res.body,headers:res.headers};
}
function writeBody(revision,hours=EXTENDED){
  return {revision,hours};
}

test("pure US weekly contract rejects malformed, duplicate or overnight days",()=>{
  assert.deepEqual(normalizeUsWeeklyHours([]),[]);
  assert.equal(weeklyHoursDisplay(SAMPLE).length,7);
  assert.equal(usHoursRevision(SAMPLE).length,64);
  assert.equal(validateUsHoursWriteBody(writeBody(usHoursRevision(SAMPLE))).hours.length,2);
  for(const rows of [
    [{...SAMPLE[0],weekday:7}],
    [SAMPLE[0],SAMPLE[0]],
    [{...SAMPLE[0],end_time:"07:00"}],
    [{...SAMPLE[0],break_start:null}],
    [{...SAMPLE[0],start_time:"09:61"}],
    [{...SAMPLE[0],comment:"injection"}],
  ])assert.throws(()=>normalizeUsWeeklyHours(rows),/US_HOURS_/);
  assert.throws(()=>validateUsHoursWriteBody({
    revision:usHoursRevision(SAMPLE),hours:SAMPLE,role:"admin",
  }),/US_HOURS_BODY_INVALID/);
});

test("GET lists ONLY active US master→salon→enabled locations",async()=>{
  const db=new MemoryPool();
  const result=await dispatch(db);
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(result.body.market_code,"US");
  assert.equal(result.body.locations.length,1);
  assert.equal(result.body.locations[0].timezone,"America/Los_Angeles");
  assert.equal(db.writes,0);
  assert.equal(result.headers["Cache-Control"],"no-store");
  db.active=false;
  assert.deepEqual((await dispatch(db)).body.locations,[]);
});

test("GET scoped existing US schedule, without mutating any rows",async()=>{
  const db=new MemoryPool();
  const result=await dispatch(db,{scope:true});
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(result.body.week.length,7);
  assert.equal(result.body.week[1].configured,true);
  assert.equal(result.body.week[0].configured,false);
  assert.deepEqual(result.body.hours,SAMPLE);
  assert.equal(result.body.revision,usHoursRevision(SAMPLE));
  assert.equal(result.body.location.salon_slug,"existing-salon");
  assert.equal(db.writes,0);
});

test("PUT replaces only existing US table and fresh GET confirms readback",async()=>{
  const db=new MemoryPool();
  const before=await dispatch(db,{scope:true});
  const saved=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(before.body.revision)});
  assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal(saved.body.saved,true);
  const after=await dispatch(db,{scope:true});
  assert.deepEqual(after.body.hours,EXTENDED);
  assert.equal(after.body.revision,saved.body.revision);
  assert.notEqual(before.body.revision,after.body.revision);
  assert.equal(db.writes,3);
  assert.ok(db.calls.some(s=>s.startsWith("DELETE FROM public.us_location_master_working_hours")));
  assert.ok(db.calls.some(s=>s.startsWith("INSERT INTO public.us_location_master_working_hours")));
  assert.ok(!db.calls.some(s=>s.includes("FROM master_working_hours")||
    s.includes("INTO master_working_hours")));
});

test("no lost-update: second writer with stale revision cannot overwrite",async()=>{
  const db=new MemoryPool();
  const before=await dispatch(db,{scope:true});
  assert.equal((await dispatch(db,{method:"PUT",scope:true,
    body:writeBody(before.body.revision)})).status,200);
  const existing=db.writes;
  const collision=await dispatch(db,{method:"PUT",scope:true,
    body:writeBody(before.body.revision,[])});
  assert.equal(collision.status,409);
  assert.equal(collision.body.error,"US_HOURS_REVISION_CONFLICT");
  assert.equal(db.writes,existing);
});

test("future confirmed US bookings cannot be invalidated by a changed week",async()=>{
  const db=new MemoryPool();
  const get=await dispatch(db,{scope:true});
  db.upcoming=true;
  const edit=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(get.body.revision)});
  assert.equal(edit.status,409);
  assert.equal(edit.body.error,"US_HOURS_FUTURE_BOOKINGS_CONFLICT");
  assert.equal(db.writes,0);
  assert.deepEqual(db.rows,SAMPLE);
});

test("direct master authorization and exact salon/location required",async()=>{
  const db=new MemoryPool();
  const before=await dispatch(db,{scope:true});
  for(const o of [
    {authRole:"salon_admin"},{source:"jwt_legacy"},
    {authUser:18},{identity:[]},
  ]){
    const result=await dispatch(db,{scope:true,method:"PUT",
      body:writeBody(before.body.revision),...o});
    assert.equal(result.status,403,JSON.stringify(o));
  }
  db.auth=false;
  assert.equal((await dispatch(db,{scope:true})).status,403);
  db.auth=true;
  for(const o of [{salonSlug:"other-salon"},{code:"unknown"}]){
    const result=await dispatch(db,{scope:true,method:"PUT",
      body:writeBody(before.body.revision),...o});
    assert.equal(result.status,404);
  }
  assert.equal(db.writes,0);
});

test("KG/KZ master has no US location or writes; no legacy table touched",async()=>{
  const db=new MemoryPool();
  db.hasUsRelation=false;
  assert.deepEqual((await dispatch(db)).body.locations,[]);
  const r=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(usHoursRevision(SAMPLE))});
  assert.equal(r.status,404);
  assert.equal(db.writes,0);
  assert.ok(db.calls.every(x=>!x.includes("DELETE FROM master_working_hours")));
});

test("blocked master billing rejects PUT; empty week is explicit closed",async()=>{
  const db=new MemoryPool();
  const before=await dispatch(db,{scope:true});
  db.blocked=true;
  const denied=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(before.body.revision,[])});
  assert.equal(denied.status,403);
  assert.equal(db.writes,0);
  db.blocked=false;
  const closed=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(before.body.revision,[])});
  assert.equal(closed.status,200);
  assert.deepEqual((await dispatch(db,{scope:true})).body.hours,[]);
});

test("forced SQL mismatch is rolled back and never reported saved",async()=>{
  const db=new MemoryPool();
  const before=await dispatch(db,{scope:true});
  db.corruptReadback=true;
  const outcome=await dispatch(db,{scope:true,method:"PUT",
    body:writeBody(before.body.revision)});
  assert.equal(outcome.status,409);
  assert.equal(outcome.body.error,"US_HOURS_READBACK_MISMATCH");
  assert.equal(db.writes,0);
  assert.deepEqual(db.rows,SAMPLE);
  assert.ok(db.rollbacks>0);
});
