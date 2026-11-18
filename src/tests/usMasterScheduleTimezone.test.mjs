// Canonical GET /masters/:slug/bookings, isolated SQL adapter.
// No PostgreSQL connections, INSERTs, test salons, API duplicates or writes.
import assert from "node:assert/strict";
import test from "node:test";
import buildMastersRouter from "../routes/internal/masters.js";

const mkBooking = (id, start_at="2026-11-01T05:30:00.000Z") => ({
  id,status:"confirmed",start_at,
  end_at:new Date(new Date(start_at).getTime()+30*60_000).toISOString(),
  client_name:"Existing client",phone:null,
  payment_id:null,payment_provider:null,payment_status:null,
  payment_is_active:false,payment_amount:null,
});
const mkLocation = (booking_id,zone,code) => ({
  booking_id,salon_id:34,location_code:code,
  location_timezone:zone,salon_slug:"existing-salon",
  salon_name:"Existing salon",
});

class BookingMockDB {
  constructor(){
    this.calls=[];
    this.markets=["US"];
    this.bookingRows=[
      mkBooking(501,"2026-11-01T05:30:00.000Z"),
      mkBooking(502,"2026-11-01T06:30:00.000Z")
    ];
    this.locations=[
      mkLocation(501,"America/New_York","east"),
      mkLocation(502,"America/Los_Angeles","west")
    ];
  }
  async query(raw,values=[]){
    const sql=String(raw).replace(/\s+/g," ").trim();
    this.calls.push({sql,values});
    if(sql.includes("SELECT id,user_id FROM masters WHERE slug=$1")){
      return {rows: values[0]==="existing-master"
        ?[{id:41,user_id:17}]:[]};
    }
    if(sql.includes("SELECT DISTINCT mk.code") &&
       sql.includes("FROM public.master_salon ms")){
      return {rows:this.markets.map(code=>({code}))};
    }
    if(sql.includes("FROM bookings b") &&
       sql.includes("LEFT JOIN clients c")){
      return {rows:this.bookingRows};
    }
    if(sql.includes("FROM public.bookings b") &&
       sql.includes("JOIN public.us_booking_location_links link")){
      const ids=values[1]||[];
      return {rows:this.locations.filter(x=>ids.includes(x.booking_id))};
    }
    if(sql.includes("FROM public.billing_subscriptions")){
      return {rows:[]};
    }
    throw new Error("UNEXPECTED_SQL:"+sql.slice(0,150));
  }
}
async function read(db,{scope=false,role="master",source="session",
  user_id=17,masters=[41],slug="existing-master"}={}){
  const router=buildMastersRouter(db,(_req,_res,next)=>next());
  const route=router.stack.find(x=>x.route?.path==="/masters/:slug/bookings"
    && x.route.methods.get);
  assert.ok(route,"existing master bookings handler missing");
  const req={
    params:{slug},
    query:scope?{calendar_scope:"us_location"}:{},
    auth:{role,source,user_id},
    identity:{masters},
  };
  const res={statusCode:200,body:null,
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;}};
  await route.route.stack.at(-1).handle(req,res);
  return {status:res.statusCode,body:res.body};
}

test("KG/KZ default API does not touch US tables or add location fields",async()=>{
  const db=new BookingMockDB();
  db.markets=["KG"];
  const r=await read(db);
  assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.body.bookings.length,2);
  assert.equal(r.body.bookings[0].location_timezone,undefined);
  assert.equal(r.body.calendar_scope,undefined);
  assert.equal(r.body.market_code,undefined);
  assert.equal(db.calls.filter(c=>c.sql.includes("us_booking_location_links")).length,0);
  assert.equal(db.calls.filter(c=>c.sql.includes("SELECT DISTINCT mk.code")).length,0);
  db.markets=["KZ"];
  assert.equal((await read(db)).status,200);
});

test("US master in multiple US locations sees separate IANA zones",async()=>{
  const db=new BookingMockDB();
  const r=await read(db,{scope:true});
  assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.body.calendar_scope,"us_location");
  assert.equal(r.body.market_code,"US");
  assert.deepEqual(r.body.bookings.map(b=>b.location_code),["east","west"]);
  assert.deepEqual(r.body.bookings.map(b=>b.location_timezone),
    ["America/New_York","America/Los_Angeles"]);
  assert.ok(db.calls.some(c=>c.sql.includes("JOIN public.us_booking_location_links link")));
  assert.equal(db.calls.filter(c=>c.sql.startsWith("UPDATE")||
    c.sql.startsWith("DELETE")||c.sql.startsWith("INSERT")).length,0);
});

test("US opt-in rejects foreign master and non-owner sessions",async()=>{
  const db=new BookingMockDB();
  for(const opts of [
    {scope:true,masters:[]},
    {scope:true,role:"salon_admin"},
    {scope:true,source:"jwt_legacy"},
    {scope:true,user_id:99},
  ]){
    const r=await read(db,opts);
    assert.equal(r.status,403,JSON.stringify(opts));
  }
});

test("US opt-in cannot silently fetch KG, KZ, or mixed-market bookings",async()=>{
  const db=new BookingMockDB();
  for(const markets of [["KG"],["KZ"],["KG","US"],[]]){
    db.markets=markets;
    const r=await read(db,{scope:true});
    assert.equal(r.status,409,JSON.stringify(markets));
    assert.equal(r.body.error,"MASTER_US_MARKET_SCOPE_REQUIRED");
  }
});

test("US missing location metadata fails closed with 409",async()=>{
  const db=new BookingMockDB();
  db.locations=db.locations.slice(0,1);
  const r=await read(db,{scope:true});
  assert.equal(r.status,409);
  assert.equal(r.body.error,"MASTER_US_BOOKING_LOCATION_REQUIRED");
});

test("US invalid/default/unknown IANA zone fails closed",async()=>{
  const db=new BookingMockDB();
  for(const zone of ["Etc/UTC","UTC","Unknown/Place",""]){
    db.locations[0].location_timezone=zone;
    const r=await read(db,{scope:true});
    assert.equal(r.status,409,zone);
    assert.equal(r.body.error,"MASTER_US_BOOKING_TIMEZONE_INVALID");
  }
});

test("US empty bookings do not manufacture a salon or timetable",async()=>{
  const db=new BookingMockDB();
  db.bookingRows=[];
  db.locations=[];
  const r=await read(db,{scope:true});
  assert.equal(r.status,200);
  assert.deepEqual(r.body.bookings,[]);
  assert.equal(db.calls.filter(c=>c.sql.includes("us_booking_location_links")).length,0);
});
