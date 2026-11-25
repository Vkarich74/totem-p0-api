// Actual public lifecycle transaction with a strict in-memory SQL adapter.
// No credentials, DB connections, real accounts, records or notification sends.
import assert from "node:assert/strict";
import {test} from "node:test";
import {executeUsLifecycleTransaction} from "../routes/publicLifecycle.js";
const auth={role:"master",source:"session",user_id:17,session_id:"11111111-1111-4111-8111-111111111111"};
const active={subscription_status:"active",blocked_at:null,next_charge_at:null,grace_until:null,provider_namespace:null};
class Fixture {
  constructor(options={}){
    Object.assign(this,{market:"KG",marketId:1,marketActive:true,session:true,ownership:true,masterBilling:{...active},salonBilling:{...active},typed:false,pendingCash:false,denyAtCommit:false,denySessionAtCommit:false,status:"reserved",...options});
    this.events=[];this.writes=0;this.commits=0;this.rollbacks=0;this.sessions=0;this.releaseCount=0;
    this.row={id:91,salon_id:32,master_id:41,salon_slug:"fixture-salon",master_slug:"fixture-master",status:this.status,client_id:1,service_id:1,price_snapshot:100};
  }
  async connect(){
    const f=this;let tx=false,snapshot;
    return {async query(raw,args=[]){
      const q=String(raw).replace(/\s+/g," ").trim();
      f.events.push(q);
      if(q==="BEGIN"){assert.equal(tx,false);tx=true;snapshot={...f.row};return {rows:[]};}
      assert.equal(tx,true,"single transaction client required");
      if(q==="COMMIT"){tx=false;f.commits++;return {rows:[]};}
      if(q==="ROLLBACK"){tx=false;f.rollbacks++;f.row=snapshot;return {rows:[]};}
      if(q.startsWith("SET LOCAL"))return {rows:[]};
      if(q.includes("FROM public.bookings b")&&q.includes("FOR UPDATE OF b"))return {rows:args[0]===91&&args[1]===32?[{...f.row}]:[]};
      if(q.includes("FROM public.auth_sessions s")){
        assert.match(q,/FOR SHARE OF s,u/);f.sessions++;
        return {rows:f.session&&!(f.denySessionAtCommit&&f.writes)?[{ok:1}]:[]};
      }
      if(q.includes("SELECT m.id AS market_id,m.code,m.active")){
        assert.match(q,/FOR SHARE OF t,m/);assert.deepEqual(args,[32]);
        return {rows:[{market_id:f.marketId,code:f.market,active:f.marketActive}]};
      }
      if(q.startsWith("SELECT id FROM public.owner_salon"))return {rows:[]};
      if(q.includes("FROM public.auth_users u")){
        assert.match(q,/FOR SHARE OF/);
        assert.deepEqual(args, args.length===3?[17,32,41]:[17,32]);
        return {rows:f.ownership?[{ok:1}]:[]};
      }
      if(q.includes("FROM public.owner_opening_requests")){
        assert.match(q,/FOR SHARE/);
        if(f.market==="US")return {rows:[{id:7,status:"activated",source_namespace:"odoo_online",source_company_id:4,source_website_id:5,source_partner_id:71,source_request_id:"fixture"}]};
        return {rows:f.typed&&args[0]==="master"?[{id:7}]:[]};
      }
      if(q.includes("SELECT EXISTS")&&q.includes("AS us"))return {rows:[{us:f.market==="US"}]};
      if(q.includes("FROM public.billing_subscriptions")){
        assert.match(q,/FOR SHARE/);
        const data=args[0]==="master"?f.masterBilling:f.salonBilling;
        return {rows:data==null?[]:[{...data,...(f.denyAtCommit&&f.writes&&args[0]==="master"?{blocked_at:"2026-11-25T01:00:00Z"}:{})}]};
      }
      if(q==="SELECT clock_timestamp() AS now")return {rows:[{now:new Date()}]};
      if(q.includes("FROM public.payments")&&q.startsWith("SELECT"))return {rows:f.pendingCash?[{id:1,provider:"direct",status:"pending",is_active:true}]:[]};
      if(q.startsWith("UPDATE public.bookings")){
        assert.ok(f.sessions>0);
        assert.match(q,/salon_id=\$2 AND status IS NOT DISTINCT FROM \$3/);
        assert.deepEqual(args.slice(0,3),[91,32,f.row.status]);
        f.row.status=q.includes("confirmed_at=NOW()")?"confirmed":args[3];f.writes++;
        return {rows:[{id:91}],rowCount:1};
      }
      if(q.startsWith("UPDATE public.payments")){f.writes++;return {rowCount:0,rows:[]};}
      if(q.startsWith("SELECT id, calendar_slot_id"))return {rows:[{id:91,calendar_slot_id:null}]};
      throw Error("UNEXPECTED_SQL:"+q);
    },release(){assert.equal(tx,false);f.releaseCount++;}};
  }
}
const execute=(f,action="confirm",overrides={})=>executeUsLifecycleTransaction(f,{auth,salonId:32,bookingId:91,action,marketCode:f.market,marketId:f.marketId,...overrides});
const deny=async(f,code,action="confirm",overrides={})=>{
 const result=await execute(f,action,overrides);
 assert.equal(result.body.error,code);assert.equal(f.commits,0);assert.equal(f.writes,0);assert.equal(f.rollbacks,1);assert.equal(f.releaseCount,1);
 return result;
};
test("legacy blocked master cannot confirm, complete or cancel through direct Backend",async()=>{
 for(const action of ["confirm","complete","cancel"]){
  const f=new Fixture({masterBilling:{...active,blocked_at:"2026-11-25T00:00:00Z"}});
  await deny(f,"BILLING_BLOCKED",action);
 }
});
test("legacy master overdue without grace denied, existing grace and missing master row unchanged",async()=>{
 const past=new Date(Date.now()-60000).toISOString(),future=new Date(Date.now()+60000).toISOString();
 await deny(new Fixture({masterBilling:{...active,next_charge_at:past}}),"BILLING_BLOCKED");
 for(const billing of [null,{...active,next_charge_at:past,grace_until:future}]){
  const f=new Fixture({masterBilling:billing});assert.equal((await execute(f)).body.status,"confirmed");assert.equal(f.commits,1);
 }
});
test("missing or blocked salon retains public booking restriction",async()=>{
 for(const billing of [null,{...active,subscription_status:"blocked"}])await deny(new Fixture({salonBilling:billing}),"PUBLIC_BOOKING_DISABLED");
});
test("salon_admin actor uses own existing cabinet write policy, not master subscription",async()=>{
 const f=new Fixture({masterBilling:{...active,subscription_status:"blocked"}});
 assert.equal((await execute(f,"confirm",{auth:{...auth,role:"salon_admin"}})).body.status,"confirmed");
 assert.ok(!f.events.some(x=>x.includes("m.user_id=u.id")));
 const blocked=new Fixture({salonBilling:{...active,next_charge_at:new Date(Date.now()-60000).toISOString()}});
 await deny(blocked,"BILLING_BLOCKED","confirm",{auth:{...auth,role:"salon_admin"}});
});
test("revoked session and wrong master membership denied before writes",async()=>{
 await deny(new Fixture({session:false}),"BOOKING_OWNER_SESSION_INVALID");
 await deny(new Fixture({ownership:false}),"BOOKING_OWNER_FORBIDDEN");
});
test("invalid session id cannot reach commercial writes",async()=>{
 await deny(new Fixture(),"BOOKING_OWNER_SESSION_INVALID","confirm",{auth:{...auth,session_id:"not-a-uuid"}});
});
test("market drift or inactive binding denied within transaction",async()=>{
 await deny(new Fixture({marketActive:false}),"BOOKING_OWNER_MARKET_SCOPE_INVALID");
 await deny(new Fixture(),"BOOKING_OWNER_MARKET_SCOPE_INVALID","confirm",{marketId:2});
 await deny(new Fixture(),"BOOKING_OWNER_MARKET_SCOPE_INVALID","confirm",{marketCode:"US"});
});
test("typed Odoo source or projection cannot inherit legacy active wallet access",async()=>{
 await deny(new Fixture({typed:true}),"US_SAAS_COMMERCIAL_ACCESS_DENIED");
 await deny(new Fixture({masterBilling:{...active,provider_namespace:"odoo_online"}}),"US_SAAS_COMMERCIAL_ACCESS_DENIED");
});
test("actual published US commercial guard remains HOLD, even if legacy subscription active",async()=>{
 for(const role of ["master","salon_admin"]){
  const f=new Fixture({market:"US",marketId:4});
  const x=await deny(f,"US_SAAS_COMMERCIAL_ACCESS_DENIED","confirm",{auth:{...auth,role}});
  assert.equal(x.body.reason,"US_SAAS_PROJECTION_RELEASE_HOLD");
 }
});
test("successful legacy confirmation uses locks and rechecks rights before commit",async()=>{
 const f=new Fixture();const result=await execute(f);
 assert.equal(result.body.status,"confirmed");assert.equal(f.row.status,"confirmed");assert.equal(f.sessions,2);assert.equal(f.commits,1);assert.equal(f.writes,1);
 assert.ok(f.events.indexOf("COMMIT")>f.events.findLastIndex(q=>q.includes("FROM public.billing_subscriptions")));
});
test("commit-time billing or session denial rolls back mutated booking",async()=>{
 for(const [options,code] of [[{denyAtCommit:true},"BILLING_BLOCKED"],[{denySessionAtCommit:true},"BOOKING_OWNER_SESSION_INVALID"]]){
  const f=new Fixture(options);const result=await execute(f);
  assert.equal(result.body.error,code);assert.equal(f.writes,1);assert.equal(f.row.status,"reserved");assert.equal(f.commits,0);assert.equal(f.rollbacks,1);assert.equal(result.notify,undefined);
 }
});
test("existing pending-cash completion guard remains in transaction",async()=>{
 await deny(new Fixture({status:"confirmed",pendingCash:true}),"CASH_PAYMENT_PENDING_CONFIRMATION","complete");
});
test("legacy cancellation updates pending cash only after authority, commits before notification",async()=>{
 const f=new Fixture({status:"confirmed"});const result=await execute(f,"cancel");
 assert.equal(result.body.status,"cancelled");assert.equal(result.notify,true);assert.equal(f.commits,1);assert.equal(f.writes,2);
 assert.ok(f.events.indexOf("COMMIT")>f.events.findLastIndex(q=>q.includes("FROM public.billing_subscriptions")));
});
