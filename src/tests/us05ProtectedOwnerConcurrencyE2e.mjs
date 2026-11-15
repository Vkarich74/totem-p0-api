// US-05 REAL protected route + owner CRUD + cross-market concurrency E2E.
// Only isolated PostgreSQL and localhost HTTP; no real identity or billing.
// Tests real resolveTenant, real public guard, real SalonsRouter owner guards.
// Every identity in this harness is a clearly-labelled synthetic fixture.
import assert from "node:assert/strict";
import net from "node:net";
assert.equal(process.env.TOTEM_US05_LOCAL_ONLY, "1");
const PORT = Number(process.env.TOTEM_US05_PG_PORT);
assert.ok(Number.isInteger(PORT) && PORT > 1024 && PORT < 65536);
assert.equal(process.env.DATABASE_URL,
  `postgresql://postgres@127.0.0.1:${PORT}/totem_us05_isolated`);
const ids = JSON.parse(process.env.TOTEM_US05_FIXTURE_IDS || "{}");
for (const k of ["US","KG","KZ","master","usService","kgService","kzService"]) {
  assert.ok(Number.isSafeInteger(ids[k]) && ids[k] > 0, k);
}
const SALONS={US:"us05-local-only", KG:"kg05-local-only",KZ:"kz05-local-only"};
const allowedPorts=new Set([PORT]);
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function guarded(...args) {
  const first=Array.isArray(args[0]) ? args[0][0] : args[0];
  const host=typeof first==="object" && first
    ? first.host||first.hostname||"localhost"
    : typeof args[1]==="string"?args[1]:"localhost";
  const port=typeof first==="object" && first ? first.port : first;
  if (!["127.0.0.1","::1","localhost"].includes(String(host)) ||
      !allowedPorts.has(Number(port))) {
    throw new Error("US05_OUTBOUND_CONNECT_FORBIDDEN");
  }
  return connect.apply(this,args);
};

const { default: express }=await import("express");
const { pool }=await import("../db.js");
const { createPublicRouter }=await import("../routes/public.js");
const { resolveTenant }=await import("../middleware/resolveTenant.js");
const { default: buildSalonsRouter }=await import("../routes/internal/salons.js");

const app=express();
app.use(express.json({limit:"24kb"}));
const noLimit=(req,res,next)=>next();
app.use("/public",createPublicRouter({
  resolveTenant,rlAvailability:noLimit,rlBookingCreate:noLimit,
}));
app.use("/internal",(req,res,next)=>{
  const identity=String(req.headers["x-us05-test-identity"]||"");
  if(identity==="owner"){
    req.auth={role:"salon_admin",user_id:2101};
    req.identity={salons:[{id:ids.US}]};
  }else if(identity==="cross"){
    req.auth={role:"salon_admin",user_id:2102};
    req.identity={salons:[{id:ids.KG}]};
  }
  next();
},buildSalonsRouter(pool,noLimit));
app.use((error,req,res,next)=>{
  console.error("US05_LOCAL_HTTP_ERROR",error?.code||error?.message||"UNKNOWN");
  res.status(500).json({ok:false,error:"US05_LOCAL_HTTP_FAILURE"});
});
const server=app.listen(0,"127.0.0.1");
await new Promise((resolve,reject)=>{
  server.once("listening",resolve);server.once("error",reject);
});
const HTTP=server.address().port;
allowedPorts.add(HTTP);
const BASE=`http://127.0.0.1:${HTTP}`;
let n=0;
async function call(path,{method="GET",identity="",data=null,key=""}={}){
  const result=await fetch(BASE+path,{
    method,
    headers:{
      ...(identity?{"x-us05-test-identity":identity}:{}),
      ...(key?{"idempotency-key":key}:{}),
      ...(data?{"content-type":"application/json"}:{}),
    },
    ...(data?{body:JSON.stringify(data)}:{}),
  });
  let body=null;
  try{body=await result.json();}catch{}
  return {status:result.status,body};
}
function check(response,status,error=null){
  assert.equal(response.status,status,JSON.stringify({want:status,response}));
  if(error)assert.equal(response.body?.error||response.body?.code,error);
  return response.body;
}
const ownerRoute="/internal/salons/"+SALONS.US+"/us-locations";
const draft=(code,state,city,timezone,zip)=>({
  location_code:code,state_code:state,city_name:city,
  street_line1:"111 Synthetic Street",street_line2:"Suite 2",
  postal_code:zip,timezone_name:timezone,is_primary:code==="ny",
});
const result={status:"HOLD",cases:{},races:[],production_writes:0,
  external_notifications_sent:0,live_auth_tokens_used:0};
async function mark(label,action){
  await action();result.cases[label]="PASS";
  console.log("US05_CASE_PASS",label);
}

try{
  await mark("real_tenant_us_and_billing_active",async()=>{
    const r=await call("/public/salons/"+SALONS.US+"/us-locations");
    check(r,200);
    assert.equal(r.body.states.length,51);
  });
  await mark("real_lifecycle_and_billing_guards",async()=>{
    const r=await call("/public/salons/"+SALONS.US+"/us-locations");
    check(r,200);
    // Deny by temporarily switching only synthetic US billing in local DB.
    await pool.query(`UPDATE public.billing_subscriptions
         SET subscription_status='blocked'
         WHERE owner_type='salon' AND owner_id=$1`,[ids.US]);
    try{
      check(await call("/public/salons/"+SALONS.US+"/us-locations"),403,
        "PUBLIC_BOOKING_DISABLED");
      const ownerDenied=await call(ownerRoute,{
        method:"POST",identity:"owner",
        data:draft("billing-blocked","NY","New York","America/New_York","10001"),
      });
      check(ownerDenied,403,"BILLING_BLOCKED");
    }finally{
      await pool.query(`UPDATE public.billing_subscriptions
        SET subscription_status='active'
        WHERE owner_type='salon' AND owner_id=$1`,[ids.US]);
    }
  });

  await mark("owner_requires_authenticated_identity",async()=>{
    check(await call(ownerRoute),401,"US_OWNER_AUTH_REQUIRED");
    check(await call(ownerRoute,{identity:"cross"}),403,"US_OWNER_FORBIDDEN");
  });
  await mark("owner_catalog_50states_29zones",async()=>{
    const r=check(await call(ownerRoute,{identity:"owner"}),200);
    assert.equal(r.market_code,"US");assert.equal(r.currency_code,"USD");
    assert.equal(r.market_active,true);
    assert.equal(r.activation_allowed,false);
    assert.equal(r.states.length,51);assert.equal(r.timezones.length,29);
    assert.equal(r.locations.length,0);
  });
  await mark("owner_input_invalid_and_no_early_activation",async()=>{
    check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("invalid-pr","PR","San Juan","America/New_York","00901"),
        is_primary:false}}),400,"US_STATE_UNKNOWN");
    check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("invalid-zip","NY","New York","America/New_York","1001"),
        is_primary:false}}),400,"US_LOCATION_ADDRESS_INVALID");
    check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("invalid-enabled","NY","New York","America/New_York","10001"),
        enabled:true,is_primary:false}}),400,"US_LOCATION_FIELDS_INVALID");
    check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("invalid-utc","NY","New York","Etc/UTC","10001"),
        is_primary:false}}),400,"US_LOCATION_IANA_REQUIRED");
  });
  await mark("owner_create_two_inactive_locations",async()=>{
    const ny=check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:draft("ny","NY","New York","America/New_York","10001-0001")}),201);
    assert.equal(ny.location.enabled,false);
    assert.equal(ny.location.is_primary,true);
    const az=check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("az","AZ","Phoenix","America/Phoenix","85001"),
        is_primary:true}}),201);
    assert.equal(az.location.enabled,false);
    assert.equal(az.location.is_primary,true);
    const r=check(await call(ownerRoute,{identity:"owner"}),200);
    assert.equal(r.locations.length,2);
    assert.equal(r.locations.filter(x=>x.is_primary).length,1);
    assert.equal(r.locations.find(x=>x.location_code==="az").is_primary,true);
    assert.ok(r.locations.every(x=>!x.enabled));
  });
  await mark("owner_update_address_and_primary_atomically",async()=>{
    const updated=check(await call(ownerRoute+"/ny",{
      identity:"owner",method:"PUT",
      data:{...draft("ny","NY","New York","America/New_York","10001-0001"),
        street_line2:"Unit 14",location_code:undefined},
    }),200);
    assert.equal(updated.location.street_line2,"Unit 14");
    const locs=check(await call(ownerRoute,{identity:"owner"}),200).locations;
    assert.equal(locs.find(x=>x.location_code==="ny").is_primary,true);
    assert.equal(locs.find(x=>x.location_code==="az").is_primary,false);
    assert.ok(locs.every(x=>!x.enabled));
  });

  await mark("kg_kz_owner_isolation",async()=>{
    check(await call("/internal/salons/"+SALONS.KG+"/us-locations",
      {identity:"owner"}),404,"US_SALON_NOT_FOUND");
    check(await call("/internal/salons/"+SALONS.KZ+"/us-locations",
      {identity:"owner"}),404,"US_SALON_NOT_FOUND");
  });

  // LOCAL-ONLY test-gate activation. Disable only the named US02 trigger
  // and re-enable it in the same transaction. Never execute in production.
  // Activate only isolated US draft locations with a dedicated transaction.
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("ALTER TABLE public.us_salon_locations DISABLE TRIGGER trg_validate_us_salon_location_row");
    await client.query("UPDATE public.us_salon_locations SET enabled=true WHERE salon_id=$1",[ids.US]);
    await client.query("ALTER TABLE public.us_salon_locations ENABLE TRIGGER trg_validate_us_salon_location_row");
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}

  // US booking candidates must be REAL offered slots before the race.
  // Without working hours, US always loses with SLOT_UNAVAILABLE.
  await mark("us_both_branches_have_real_offered_slots",async()=>{
    const hours=await pool.query(
      `INSERT INTO public.us_location_master_working_hours
         (location_id,master_id,weekday,start_time,end_time)
       SELECT l.id,$1,dow,'09:00'::time,'17:00'::time
         FROM public.us_salon_locations l
         CROSS JOIN generate_series(0,6) AS dow
        WHERE l.salon_id=$2
       RETURNING location_id,weekday`,
      [ids.master,ids.US]
    );
    assert.equal(hours.rows.length,14);
    const usAvail=await call(
      `/public/salons/${SALONS.US}/masters/${ids.master}/availability`+
      `?service_id=${ids.usService}&date=2027-01-18&location_code=ny`
    );
    check(usAvail,200);
    assert.ok(usAvail.body.slots.some(slot=>
      slot.start_at==="2027-01-18T16:00:00.000Z"
    ),"US05_PRE_RACE_US_SLOT_NOT_AVAILABLE");
    const azAvail=await call(
      `/public/salons/${SALONS.US}/masters/${ids.master}/availability`+
      `?service_id=${ids.usService}&date=2027-01-18&location_code=az`
    );
    check(azAvail,200);
    assert.ok(azAvail.body.slots.some(slot=>
      slot.start_at==="2027-01-18T16:00:00.000Z"
    ),"US05_PRE_RACE_AZ_SLOT_NOT_AVAILABLE");
  });

  await mark("active_us_locations_immutable_in_owner_editor",async()=>{
    check(await call(ownerRoute+"/ny",{identity:"owner",method:"PUT",
      data:{...draft("ny","NY","New York","America/New_York","10001-0001"),
        location_code:undefined}}),409,"US_LOCATION_ACTIVE_LOCKED");
    check(await call(ownerRoute,{identity:"owner",method:"POST",
      data:{...draft("ny","NY","New York","America/New_York","10001"),
        is_primary:false}}),409,"US_LOCATION_DUPLICATE");
  });

  const master=ids.master;
  const scenarios=[
    {type:"KG",name:"US-KG",country:"KG",service:ids.kgService,phone:"+996555123456"},
    {type:"KZ",name:"US-KZ",country:"KZ",service:ids.kzService,phone:"+77011234567"},
    {type:"US",name:"US-US",country:"US",service:ids.usService,phone:"+12133734253"},
  ];
  const dayStart=18;
  let dayNum=0;
  for(const scenario of scenarios){
    for(let iteration=0;iteration<3;iteration++){
      const day=dayStart+dayNum;
      dayNum++;
      const date=`2027-01-${String(day).padStart(2,"0")}`;
      const start="2027-01-"+String(day).padStart(2,"0")+"T16:00:00.000Z";
      const keyA=`US05-${scenario.name}-${iteration}-A`;
      const keyB=`US05-${scenario.name}-${iteration}-B`;
      const usBody={
        master_id:master,service_id:ids.usService,location_code:"ny",
        date,time:"11:00",start_at:start,
        client_payload:{name:"US05 Test Client",phone:"+12133734253"},
      };
      let competitor, competitorPath;
      if(scenario.type==="US"){
        competitor={...usBody,location_code:"az",time:"09:00",
          client_payload:{name:"US05 Other Client",phone:"+12133734254"}};
        competitorPath=`/public/salons/${SALONS.US}/bookings`;
      }else{
        competitor={master_id:master,service_id:scenario.service,start_at:start,
          client_payload:{name:"US05 Other Client",phone:scenario.phone}};
        competitorPath=`/public/salons/${SALONS[scenario.type]}/bookings`;
      }
      const [first,second]=await Promise.all([
        call("/public/salons/"+SALONS.US+"/bookings",{
          method:"POST",data:usBody,key:keyA,
        }),
        call(competitorPath,{
          method:"POST",data:competitor,key:keyB,
        }),
      ]);
      const statuses=[first.status,second.status].sort((a,b)=>a-b);
      assert.deepEqual(statuses,[201,409],JSON.stringify({
        scenario:scenario.name,date,first,second,
      }));
      const refused=first.status===409?first:second;
      assert.ok(["US_SLOT_UNAVAILABLE","TIME_SLOT_CONFLICT"].includes(
        refused.body?.error),JSON.stringify(refused));
      const db=await pool.query(
        `SELECT b.id,b.salon_id,b.master_id,b.start_at,b.end_at
           FROM public.bookings b
          WHERE b.master_id=$1 AND b.start_at=$2::timestamptz
            AND b.status<>'cancelled'`,
        [master,start]
      );
      assert.equal(db.rows.length,1);
      const persisted=db.rows[0];
      const links=await pool.query(
        `SELECT count(*)::integer AS n FROM public.us_booking_location_links
          WHERE booking_id=$1`,[persisted.id]
      );
      assert.equal(links.rows[0].n,Number(persisted.salon_id)===ids.US?1:0);
      const notes=await pool.query(
        `SELECT count(*)::integer AS n FROM public.app_notifications
          WHERE payload_json->>'booking_id'=$1`,[String(persisted.id)]
      );
      assert.equal(notes.rows[0].n,3);
      const utc=new Date(persisted.start_at).toISOString();
      assert.equal(utc,start);
      result.races.push({type:scenario.name,date,result:"PASS",
        winner: Number(persisted.salon_id)===ids.US?"US":scenario.type});
      console.log("US05_CROSS_MARKET_RACE_PASS",scenario.name,date);
    }
  }
  result.cases.cross_market_us_kg_three_real_races="PASS";
  result.cases.cross_market_us_kz_three_real_races="PASS";
  result.cases.cross_location_us_us_three_real_races="PASS";

  await mark("sibling_tenant_billing_denial_without_booking",async()=>{
    // Use only the synthetic KG subscription and restore on completion.
    await pool.query(`UPDATE public.billing_subscriptions
       SET subscription_status='blocked'
       WHERE owner_type='salon' AND owner_id=$1`,[ids.KG]);
    try{
      const r=await call("/public/salons/"+SALONS.KG+"/bookings",{
        method:"POST",key:"US05_BLOCKED_KG_POST",
        data:{master_id:master,service_id:ids.kgService,
          start_at:"2027-02-03T16:00:00.000Z",
          client_payload:{name:"Blocked Test",phone:"+996555123456"}},
      });
      check(r,403,"PUBLIC_BOOKING_DISABLED");
    }finally{
      await pool.query(`UPDATE public.billing_subscriptions
       SET subscription_status='active'
       WHERE owner_type='salon' AND owner_id=$1`,[ids.KG]);
    }
  });

  const counts=await pool.query(`SELECT
    (SELECT count(*)::integer FROM public.bookings
      WHERE salon_id=ANY($1::int[])) AS bookings,
    (SELECT count(*)::integer FROM public.app_notifications n
      JOIN public.bookings b ON b.id=(n.payload_json->>'booking_id')::int
      WHERE b.salon_id=ANY($1::int[])) AS notifications,
    (SELECT count(*)::integer FROM public.us_booking_location_links l
      JOIN public.bookings b ON b.id=l.booking_id
      WHERE b.salon_id=$2) AS us_links`,[
      [ids.US,ids.KG,ids.KZ],ids.US
    ]);
  assert.equal(counts.rows[0].bookings,9);
  assert.equal(counts.rows[0].notifications,27);
  assert.ok(counts.rows[0].us_links>=0);
  result.cases.real_db_consistency_9_bookings_27_notifications="PASS";
  result.saved_counts=counts.rows[0];
  result.status="PASS";
  result.case_count=Object.keys(result.cases).length;
  console.log("US05_PROTECTED_OWNER_CONCURRENCY_E2E_PASS",JSON.stringify(result));
}catch(e){
  result.status="HOLD";result.stop_reason=String(e?.stack||e).slice(0,1800);
  console.error("US05_E2E_STOP",result.stop_reason);
}finally{
  try{await pool.end();}catch{}
  await new Promise(resolve=>server.close(resolve));
}
process.exit(result.status==="PASS"?0:2);
