// US public services use canonical price source; no database writes or
// new salon/master/service/booking rows. In-memory SQL only.
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveUsPublicServicePriceCatalog,
  resolveUsBookingServicePrice,
  verifyUsExpectedBookingServicePrice,
} from "../services/usServicePrice.service.js";

const market={
  market_id:7,market_code:"US",country_code:"US",currency_code:"USD",
};
const services=[
  {id:701,salon_id:34,master_id:41,service_pk:101,
    name:"Existing haircut",duration_min:30,active:true,
    price:999999,currency_code:"USD"},
  {id:702,salon_id:34,master_id:41,service_pk:102,
    name:"Existing styling",duration_min:60,active:true,
    price:1,currency_code:null},
];
class ExistingPriceDb {
  constructor(){
    this.calls=[];
    this.prices=new Map([[701,{amount_minor:"4500",
      price_version:2,market_id:7,salon_master_service_id:701}]]);
  }
  async query(raw,params=[]){
    const sql=String(raw).replace(/\s+/g," ").trim();
    this.calls.push({sql,params});
    if(!sql.includes("FROM public.us_service_price_amounts spa") ||
       !sql.includes("JOIN public.master_salon ms") ||
       !sql.includes("market.code='US'") && !sql.includes("mk.code='US'")){
      throw new Error("UNEXPECTED_PRICE_SQL");
    }
    const [link,salon,master,service,marketId]=params;
    const matched=services.find(s=>s.id===link &&
      s.salon_id===salon && s.master_id===master &&
      s.service_pk===service);
    const current=this.prices.get(link);
    return {rows:matched && current && marketId===7 &&
      matched.currency_code==="USD"?[{...current}]:[]};
  }
}

test("public service catalog prices always come from canonical USD cents",async()=>{
  const db=new ExistingPriceDb();
  const list=await resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services,
  });
  assert.equal(list.length,2);
  assert.equal(list[0].id,701);
  assert.equal(list[0].service_price.configured,true);
  assert.equal(list[0].service_price.amount_minor,"4500");
  assert.equal(list[0].service_price.price_version,2);
  assert.equal(list[0].service_price.source,"us_service_price_amounts");
  assert.equal(list[0].service_price.amount_type,"service_base_only");
  assert.equal(list[0].service_price.currency_code,"USD");
  assert.equal(Object.hasOwn(list[0],"price"),false);
  assert.equal(Object.hasOwn(list[0],"currency_code"),false);
  assert.equal(list[1].service_price.configured,false);
  assert.equal(list[1].service_price.amount_minor,null);
  assert.equal(list[1].service_price.price_version,0);
  assert.equal(Object.hasOwn(list[1],"price"),false);
  assert.equal(db.calls.length,2,"one canonical resolver per service");
  assert.ok(db.calls.every(q=>q.sql.includes("FOR SHARE OF spa,sms,ms,tm,m,mk")));
  assert.ok(db.calls.every(q=>!/^INSERT|^UPDATE|^DELETE|^CREATE/.test(q.sql)));
});

test("unavailable price is not fabricated from arbitrary legacy numeric price",async()=>{
  const db=new ExistingPriceDb();
  db.prices.clear();
  const list=await resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services,
  });
  assert.deepEqual(list.map(x=>x.service_price.configured),[false,false]);
  assert.deepEqual(list.map(x=>x.service_price.amount_minor),[null,null]);
});

test("price change in canonical source is visible on next public read",async()=>{
  const db=new ExistingPriceDb();
  const first=await resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services:services.slice(0,1),
  });
  db.prices.set(701,{amount_minor:"5601",price_version:3,
    market_id:7,salon_master_service_id:701});
  const second=await resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services:services.slice(0,1),
  });
  assert.equal(first[0].service_price.amount_minor,"4500");
  assert.equal(second[0].service_price.amount_minor,"5601");
  assert.equal(second[0].service_price.price_version,3);
});

test("public catalog rejects wrong market/tenant and malformed references",async()=>{
  const db=new ExistingPriceDb();
  for(const invalid of [
    {salonId:34,marketContext:{...market,market_code:"KG"},services},
    {salonId:34,marketContext:{...market,currency_code:"KGS"},services},
    {salonId:34,marketContext:{...market,country_code:"CA"},services},
    {salonId:0,marketContext:market,services},
    {salonId:34,marketContext:market,services:null},
    {salonId:34,marketContext:market,services:[
      {...services[0],salon_id:99}]},
  ])await assert.rejects(()=>resolveUsPublicServicePriceCatalog(db,invalid),
    error=>error.code==="US_SERVICE_PRICE_CONTEXT_INVALID");
  assert.equal(db.calls.length,0);
});

test("missing malformed DB prices fail closed, not 'unconfigured'",async()=>{
  const db=new ExistingPriceDb();
  db.prices.set(701,{amount_minor:"abc",price_version:1,
    market_id:7,salon_master_service_id:701});
  await assert.rejects(()=>resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services:services.slice(0,1),
  }),e=>e.code==="US_SERVICE_PRICE_INVALID");
});

test("booking optional price confirmation compares canonical version AND cents",()=>{
  const canonical={
    amount_minor:"4500",price_version:2,currency_code:"USD",
  };
  assert.equal(verifyUsExpectedBookingServicePrice({},canonical),false);
  assert.equal(verifyUsExpectedBookingServicePrice({
    expected_us_price_version:2,expected_us_amount_minor:"4500",
  },canonical),true);
  for(const old of [
    {expected_us_price_version:1,expected_us_amount_minor:"4500"},
    {expected_us_price_version:2,expected_us_amount_minor:"4600"},
  ])assert.throws(
    ()=>verifyUsExpectedBookingServicePrice(old,canonical),
    e=>e.statusCode===409 && e.code==="US_SERVICE_PRICE_CHANGED");
  for(const invalid of [
    {expected_us_price_version:2},
    {expected_us_amount_minor:"4500"},
    {expected_us_price_version:2,expected_us_amount_minor:4500},
    {expected_us_price_version:-1,expected_us_amount_minor:"4500"},
    {expected_us_price_version:2,expected_us_amount_minor:"0"},
    {expected_us_price_version:2,expected_us_amount_minor:"0004500"},
  ])assert.throws(
    ()=>verifyUsExpectedBookingServicePrice(invalid,canonical),
    e=>e.statusCode===400 && e.code==="US_EXPECTED_SERVICE_PRICE_INVALID");
});

test("same canonical price helper powers public list, availability and POST",async()=>{
  const db=new ExistingPriceDb();
  const direct=await resolveUsBookingServicePrice(db,{
    marketId:7,salonId:34,masterId:41,
    servicePk:101,serviceLinkId:701,
  });
  const list=await resolveUsPublicServicePriceCatalog(db,{
    salonId:34,marketContext:market,services:services.slice(0,1),
  });
  assert.equal(direct.amount_minor,list[0].service_price.amount_minor);
  assert.equal(direct.price_version,list[0].service_price.price_version);
});
