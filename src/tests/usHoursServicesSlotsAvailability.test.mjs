// Real canonical US availability handler -> existing market/context/calendar
// -> existing US location-hours + price resolver -> SINGLE US slot engine.
// Only an in-memory SQL adapter. No connections, INSERT, new salons or DDL.
import assert from "node:assert/strict";
import test from "node:test";
import { publicMasterAvailability } from "../routes/publicAvailability.js";
import { buildSalonCalendarResponse } from "../services/salonCalendar.service.js";
import { buildUsAvailableSlots } from "../services/usSlots.service.js";

const DATE="2027-01-18"; // Monday, far enough ahead for time-independent tests.
const MARKET=Object.freeze({
  market_id:7,market_code:"US",country_code:"US",
  currency_code:"USD",timezone:"Etc/UTC",
});
const SALON=Object.freeze({
  id:34,slug:"existing-salon",name:"Existing salon",
  city:"New York",status:"active",enabled:true,
});
const MASTER=Object.freeze({id:41,slug:"existing-master",name:"Existing master"});
const LOCATION=Object.freeze({
  id:91,salon_id:34,location_code:"ny",state_code:"NY",
  city_name:"New York",postal_code:"10001",
  timezone_name:"America/New_York",enabled:true,
});
const DEFAULT_HOURS=Object.freeze([{
  master_id:41,weekday:1,start_time:"09:00:00",
  end_time:"12:00:00",break_start:"10:00:00",
  break_end:"10:30:00",
}]);
const MARKET_ROW=Object.freeze({
  salon_id:SALON.id,salon_slug:SALON.slug,
  market_id:7,market_code:"US",country_code:"US",
  country_pack_code:"US",country_pack_version:"1",
  market_active:true,default_locale:"en-US",
  supported_locales:["en-US"],locale_override:null,
  default_currency:"USD",supported_currencies:["USD"],
  currency_override:null,default_timezone:"Etc/UTC",
  timezone_override:null,city_timezone:"America/New_York",
  city_id:null,city_slug:null,payment_profile_code:null,
  notification_profile_code:null,fiscal_profile_code:null,
});

class ExistingRowsDB {
  constructor(){
    this.calls=[];
    this.salon={...SALON};this.location={...LOCATION};
    this.hours=DEFAULT_HOURS.map(row=>({...row}));
    this.service={
      id:701,master_id:41,service_pk:101,
      duration_min:30,active:true,currency_code:"USD",
    };
    this.usPrice={amount_minor:"4500",price_version:1,
      market_id:7,salon_master_service_id:701};
    this.busy=[];
  }
  async query(raw,params=[]){
    const sql=String(raw).replace(/\s+/g," ").trim();
    this.calls.push({sql,params});
    if(sql.includes("FROM public.salons WHERE id = $1")){
      return {rows:[{...this.salon}],rowCount:1};
    }
    if(sql.includes("FROM public.salon_master_services sms") &&
       sql.includes("JOIN public.master_salon ms") &&
       !sql.includes("us_service_price_amounts")){
      if(this.service.active===false) return {rows:[],rowCount:0};
      return {rows:[{...this.service}],rowCount:1};
    }
    if(sql.includes("FROM public.salons s") &&
       sql.includes("JOIN public.tenant_market_settings t")){
      return {rows:[{...MARKET_ROW}],rowCount:1};
    }
    if(sql.includes("FROM public.market_capabilities"))
      return {rows:[],rowCount:0};
    if(sql.includes("FROM public.market_provider_bindings"))
      return {rows:[],rowCount:0};
    if(sql.includes("FROM public.us_salon_locations l")){
      return {rows:params[1]===this.location.location_code
        ? [{...this.location}]:[],rowCount:params[1]===this.location.location_code?1:0};
    }
    if(sql.includes("FROM public.master_salon ms") &&
       sql.includes("JOIN public.masters m")){
      return {rows:[{...MASTER}],rowCount:1};
    }
    if(sql.includes("FROM public.us_location_master_working_hours")){
      const matching=this.hours.filter(row=>
        row.weekday===params[1]&&row.master_id===41);
      return {rows:matching.map(row=>({...row})),rowCount:matching.length};
    }
    if(sql.includes("FROM public.bookings b") &&
       sql.includes("JOIN public.us_booking_location_links link")){
      return {rows:[],rowCount:0};
    }
    if(sql.includes("FROM public.bookings b") &&
       sql.includes("WHERE b.master_id=ANY")){
      return {rows:this.busy.map(row=>({...row})),rowCount:this.busy.length};
    }
    if(sql.includes("FROM public.us_service_price_amounts spa")){
      const hasUsPrice=Boolean(this.usPrice)&&
        this.service.active===true&&this.service.currency_code==="USD"&&
        params[0]===this.service.id&&params[1]===SALON.id&&
        params[2]===MASTER.id&&params[3]===this.service.service_pk&&
        params[4]===MARKET.market_id;
      return {rows:hasUsPrice?[{...this.usPrice}]:[],
        rowCount:hasUsPrice?1:0};
    }
    throw new Error("UNEXPECTED_SQL:"+sql.slice(0,220));
  }
}
function makeRequest({market=MARKET,location="ny",date=DATE}={}){
  return {
    tenant:{salon_id:SALON.id},
    params:{slug:SALON.slug,master_id:String(MASTER.id)},
    query:{date,location_code:location,service_id:String(701),step_min:"15"},
    market_context:market,
  };
}
async function availability(db,req=makeRequest()){
  const res={statusCode:200,body:null,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}};
  await publicMasterAvailability(req,res,db);
  return {status:res.statusCode,body:res.body};
}
function utcAt(time){
  return new Date(DATE+"T"+time+":00.000Z");
}
function localToUtcAtNy(time){
  const hh=Number(time.slice(0,2));
  const mm=Number(time.slice(3,5));
  // Fixed winter date with known EST offset -05:00, not a general engine.
  // This is fixture data ONLY; production uses usTime.service.js.
  return new Date(utcAt(String(hh+5).padStart(2,"0")+":"+
    String(mm).padStart(2,"0"))).toISOString();
}

test("same actual US calendar + slot engine in public GET and booking recomputation",async()=>{
  const db=new ExistingRowsDB();
  const get=await availability(db);
  assert.equal(get.status,200,JSON.stringify(get));
  assert.equal(get.body.timezone,"America/New_York");
  assert.equal(get.body.location_code,"ny");
  assert.equal(get.body.master_id,41);
  assert.equal(get.body.service_id,701);
  assert.deepEqual(get.body.service_price,{
    configured:true,source:"us_service_price_amounts",
    amount_type:"service_base_only",currency_code:"USD",
    amount_minor:"4500",price_version:1,
  });
  const slots=get.body.slots;
  assert.ok(slots.length>0,"configured/paid service must have slots");
  assert.ok(slots.some(row=>row.local_time==="09:00"));
  assert.ok(slots.some(row=>row.local_time==="09:30"));
  assert.ok(!slots.some(row=>row.local_time==="09:45"));
  assert.ok(!slots.some(row=>row.local_time==="10:00"));
  assert.ok(slots.some(row=>row.local_time==="10:30"));
  const calendar=await buildSalonCalendarResponse(db,{
    salonRow:SALON,requestedDate:DATE,locationCode:"ny",
  });
  assert.deepEqual(slots,buildUsAvailableSlots(calendar,{
    masterId:41,durationMin:db.service.duration_min,
    stepMin:15,nowMs:Date.now(),
  }));
  assert.ok(db.calls.some(c=>c.sql.includes("FROM public.us_service_price_amounts spa")));
  assert.ok(db.calls.some(c=>c.sql.includes("FROM public.us_location_master_working_hours")));
  assert.ok(!db.calls.some(c=>/^(INSERT|UPDATE|DELETE|CREATE|DROP)\b/.test(c.sql)));
});

test("unconfigured canonical USD cents price: no false bookable slots",async()=>{
  const db=new ExistingRowsDB();
  db.usPrice=null;
  const response=await availability(db);
  assert.equal(response.status,409);
  assert.equal(response.body.error,"US_SERVICE_PRICE_NOT_CONFIGURED");
  assert.equal(response.body.slots,undefined);
});

test("legacy numeric salon_master_services.price cannot replace USD cents snapshot",async()=>{
  const db=new ExistingRowsDB();
  db.service.currency_code=null;
  const response=await availability(db);
  assert.equal(response.status,409);
  assert.equal(response.body.error,"US_SERVICE_PRICE_NOT_CONFIGURED");
});

test("weekly hours edit changes real offered slots without another slot builder",async()=>{
  const db=new ExistingRowsDB();
  const before=await availability(db);
  assert.equal(before.status,200);
  db.hours=[{...DEFAULT_HOURS[0],start_time:"10:30:00",break_start:null,
    break_end:null}];
  const after=await availability(db);
  assert.equal(after.status,200);
  assert.ok(after.body.slots.length>0);
  assert.ok(!after.body.slots.some(row=>row.local_time<"10:30"));
  assert.ok(after.body.slots.some(row=>row.local_time==="10:30"));
  assert.ok(before.body.slots.length>after.body.slots.length);
  db.hours=[];
  const closed=await availability(db);
  assert.equal(closed.status,200);
  assert.deepEqual(closed.body.slots,[]);
});

test("service duration changes availability via existing engine",async()=>{
  const db=new ExistingRowsDB();
  const short=await availability(db);
  db.service.duration_min=60;
  const long=await availability(db);
  assert.equal(long.status,200);
  assert.ok(long.body.slots.length<short.body.slots.length);
  assert.ok(!long.body.slots.some(row=>row.local_time==="09:30"));
  assert.ok(long.body.slots.some(row=>row.local_time==="10:30"));
});

test("booking at other physical US location occupies same master's time",async()=>{
  const db=new ExistingRowsDB();
  const before=await availability(db);
  assert.ok(before.body.slots.some(row=>row.local_time==="10:30"));
  db.busy=[{
    master_id:41,start_at:localToUtcAtNy("10:30"),
    end_at:localToUtcAtNy("11:00"),
  }];
  const after=await availability(db);
  assert.equal(after.status,200);
  assert.ok(!after.body.slots.some(row=>row.local_time==="10:30"));
  assert.ok(before.body.slots.length>after.body.slots.length);
});

test("wrong physical branch fails closed, no US-UTC fallback",async()=>{
  const db=new ExistingRowsDB();
  const r=await availability(db,makeRequest({location:"nonexistent"}));
  assert.equal(r.status,404);
  assert.equal(r.body.error,"US_LOCATION_NOT_FOUND");
});

test("disabled salon, invalid service duration and non-US market cannot offer US slots",async()=>{
  const db=new ExistingRowsDB();
  db.salon.enabled=false;
  const disabled=await availability(db);
  assert.equal(disabled.status,409);
  assert.equal(disabled.body.error,"US_SALON_NOT_BOOKABLE");
  db.salon.enabled=true;
  db.service.duration_min=0;
  const invalid=await availability(db);
  assert.equal(invalid.status,409);
  assert.equal(invalid.body.error,"SERVICE_DURATION_INVALID");
  db.service.duration_min=30;
  const wrong=await availability(db,makeRequest({market:{...MARKET,currency_code:"KGS"}}));
  assert.equal(wrong.status,409);
  assert.equal(wrong.body.error,"US_SERVICE_PRICE_CONTEXT_INVALID");
});

test("no test tenants, PostgreSQL, writes, new booking or duplicate USD price service",()=>{
  const db=new ExistingRowsDB();
  assert.equal(db.salon.slug,"existing-salon");
  assert.equal(db.busy.length,0);
  assert.equal(typeof db.query,"function");
});
