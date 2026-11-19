import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAdminMarketCode,
  listAdminMarkets,
  readScopedAdminList,
  assertAdminOwnerActionMarket,
  assertAdminOpeningMarketPolicy,
} from "../routes/internal/adminMarketsContract.js";

function dbFromRows(rows, calls = []) {
  return {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: typeof rows === "function" ? rows(sql, params) : rows };
    },
  };
}

test("KG and US are explicit, KZ is always inactive for operations", () => {
  assert.equal(parseAdminMarketCode("KG"), "KG");
  assert.equal(parseAdminMarketCode("us"), "US");
  assert.throws(() => parseAdminMarketCode("KZ"),
    { code: "ADMIN_MARKET_INACTIVE", statusCode: 409 });
  assert.throws(() => parseAdminMarketCode(""), { code: "ADMIN_MARKET_CODE_UNSUPPORTED" });
  assert.throws(() => parseAdminMarketCode("US;DROP TABLE salons"),
    { code: "ADMIN_MARKET_CODE_UNSUPPORTED" });
  assert.throws(() => parseAdminMarketCode(["US"]), { code: "ADMIN_MARKET_CODE_INVALID" });
});

test("catalog exposes DB truth but blocks KZ even if DB active conflicts with policy", async () => {
  const calls = [];
  const markets = await listAdminMarkets(dbFromRows([
    {code:"KG",active:true,default_currency:"KGS",country_code:"KG"},
    {code:"US",active:true,default_currency:"USD",country_code:"US"},
    {code:"KZ",active:true,default_currency:"KZT",country_code:"KZ"},
  ], calls));
  assert.equal(markets[0].admin_operation_enabled, true);
  assert.equal(markets[1].admin_operation_enabled, true);
  assert.equal(markets[2].database_active, true);
  assert.equal(markets[2].admin_operation_enabled, false);
  assert.equal(markets[2].configuration_conflict, true);
  assert.equal(markets[2].admin_status, "inactive_policy");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /CASE code WHEN 'KG'/);
});

test("scoped SQL filters BEFORE LIMIT and returns real total and market proof", async () => {
  for (const kind of ["salons","masters","clients","bookings"]) {
    const calls=[];
    const db = dbFromRows((sql, params) => sql.startsWith("SELECT code, active")
      ? [{code:"US",active:true,country_code:"US",default_currency:"USD"}]
      : [{total_count:1204,items:[{id:9,market_code:"US",market_active:true,currency_code:"USD"}]}], calls);
    const data=await readScopedAdminList(db,{kind,marketCode:"US",limit:20,offset:20});
    assert.equal(data.pagination.total,1204);
    assert.equal(data.pagination.limit,20);
    assert.equal(data.pagination.offset,20);
    assert.equal(data.items.length,1);
    assert.equal(data.market_code,"US");
    assert.match(calls[1].sql, /COUNT\(\*\)::int/);
    assert.match(calls[1].sql, /market\.code=\$1 AND market\.active=true/);
    assert.match(calls[1].sql, /LIMIT \$2 OFFSET \$3/);
    assert.deepEqual(calls[1].params,["US",20,20]);
    assert.doesNotMatch(calls[1].sql, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  }
});

test("scoped SQL remains safely empty on offset beyond final page", async () => {
  const db=dbFromRows((sql) => sql.startsWith("SELECT code, active")
    ? [{code:"KG",active:true,country_code:"KG",default_currency:"KGS"}] : [{total_count:47,items:[]}]);
  const data=await readScopedAdminList(db,{kind:"salons",marketCode:"KG",limit:20,offset:60});
  assert.equal(data.pagination.total,47);
  assert.deepEqual(data.items,[]);
});

test("server never accepts mismatched market or inactive market readback", async () => {
  const wrong=dbFromRows(sql=>sql.startsWith("SELECT code, active")
    ? [{code:"US",active:true,country_code:"US",default_currency:"USD"}]
    : [{total_count:1,items:[{market_code:"KG",market_active:true}]}]);
  await assert.rejects(readScopedAdminList(wrong,{kind:"clients",marketCode:"US",limit:10,offset:0}),
    {code:"ADMIN_MARKET_READBACK_MISMATCH"});
  const inactive=dbFromRows([{code:"US",active:false}]);
  await assert.rejects(readScopedAdminList(inactive,{kind:"clients",marketCode:"US",limit:10,offset:0}),
    {code:"ADMIN_MARKET_INACTIVE"});
});

test("KG historical owner action requires no new fields", async () => {
  const rows=[{market_code:"KG",market_active:true}];
  assert.deepEqual(await assertAdminOwnerActionMarket(dbFromRows(rows),{
    ownerType:"salon",ownerId:32,
  }),{market_code:"KG",legacy_unclassified:false});
});

test("existing unbound legacy owner is not silently reclassified KG and US spoof denied", async () => {
  const db=dbFromRows([{market_code:null,market_active:null}]);
  const legacy=await assertAdminOwnerActionMarket(db,{ownerType:"salon",ownerId:32});
  assert.equal(legacy.market_code,null);
  assert.equal(legacy.legacy_unclassified,true);
  await assert.rejects(assertAdminOwnerActionMarket(db,{ownerType:"salon",ownerId:32,requestedMarketCode:"US"}),
    {code:"ADMIN_OWNER_MARKET_MISMATCH"});
});

test("US salon action needs explicit US, wrong market and KZ are always denied", async () => {
  const us=dbFromRows([{market_code:"US",market_active:true,currency_code:"USD"}]);
  await assert.rejects(assertAdminOwnerActionMarket(us,{ownerType:"salon",ownerId:41}),
    {code:"ADMIN_US_EXPLICIT_MARKET_REQUIRED"});
  await assert.rejects(assertAdminOwnerActionMarket(us,{ownerType:"salon",ownerId:41,requestedMarketCode:"KG"}),
    {code:"ADMIN_OWNER_MARKET_MISMATCH"});
  const ok=await assertAdminOwnerActionMarket(us,{ownerType:"salon",ownerId:41,requestedMarketCode:"US"});
  assert.equal(ok.market_code,"US");
  const kz=dbFromRows([{market_code:"KZ",market_active:true}]);
  await assert.rejects(assertAdminOwnerActionMarket(kz,{ownerType:"salon",ownerId:41}),
    {code:"ADMIN_MARKET_INACTIVE"});
});

test("US master requires one active salon and disallows cross-market ambiguity", async () => {
  const live={salon_id:42,relation_status:"active",salon_enabled:true,salon_status:"active",market_code:"US",market_active:true,currency_code:"USD"};
  const single=dbFromRows([live]);
  await assert.rejects(assertAdminOwnerActionMarket(single,{ownerType:"master",ownerId:66}),
    {code:"ADMIN_US_EXPLICIT_MARKET_REQUIRED"});
  assert.equal((await assertAdminOwnerActionMarket(single,{
    ownerType:"master",ownerId:66,requestedMarketCode:"US",
  })).market_code,"US");
  const suspended=dbFromRows([{...live,relation_status:"pending"}]);
  await assert.rejects(assertAdminOwnerActionMarket(suspended,{
    ownerType:"master",ownerId:66,requestedMarketCode:"US",
  }),{code:"ADMIN_US_ACTIVE_SALON_REQUIRED"});
  const mixed=dbFromRows([live,{...live,salon_id:99,market_code:"KG"}]);
  await assert.rejects(assertAdminOwnerActionMarket(mixed,{
    ownerType:"master",ownerId:66,requestedMarketCode:"US",
  }),{code:"ADMIN_OWNER_MARKET_AMBIGUOUS"});
  const multiple=dbFromRows([live,{...live,salon_id:99}]);
  await assert.rejects(assertAdminOwnerActionMarket(multiple,{
    ownerType:"master",ownerId:66,requestedMarketCode:"US",
  }),{code:"ADMIN_US_ACTIVE_SALON_REQUIRED"});
});

test("KZ inactive policy and DB market active gate both fail closed", async () => {
  await assert.rejects(assertAdminOwnerActionMarket(
    dbFromRows([{market_code:"KZ",market_active:false}]),
    {ownerType:"master",ownerId:7,requestedMarketCode:"KZ"},
  ),{code:"ADMIN_MARKET_INACTIVE"});
  await assert.rejects(assertAdminOwnerActionMarket(
    dbFromRows([{market_code:"US",market_active:false}]),
    {ownerType:"salon",ownerId:7,requestedMarketCode:"US"},
  ),{code:"ADMIN_MARKET_INACTIVE"});
});


test("legacy opening policy: KG and missing legacy market work, KZ/US are held", () => {
  assert.equal(assertAdminOpeningMarketPolicy("KG"),"KG");
  assert.equal(assertAdminOpeningMarketPolicy(""),null);
  assert.throws(() => assertAdminOpeningMarketPolicy("KZ"),
    {code:"ADMIN_MARKET_INACTIVE",statusCode:409});
  assert.throws(() => assertAdminOpeningMarketPolicy("US"),
    {code:"ADMIN_US_OPEN_OWNER_PENDING",statusCode:409});
  assert.throws(() => assertAdminOpeningMarketPolicy({
    precheck_result_json:{normalized:{market_code:"US"}}
  }),{code:"ADMIN_US_OPEN_OWNER_PENDING"});
  assert.throws(() => assertAdminOpeningMarketPolicy({
    precheck_result_json:{normalized:{market_code:"KZ"}}
  }),{code:"ADMIN_MARKET_INACTIVE"});
});

test("US unsuspend cannot circumvent the later geo/readiness activation gate", async () => {
  const db=dbFromRows([{market_code:"US",market_active:true,currency_code:"USD"}]);
  await assert.rejects(assertAdminOwnerActionMarket(db,{
    ownerType:"salon",ownerId:55,requestedMarketCode:"US",action:"unsuspend",
  }),{code:"ADMIN_US_ACTIVATION_GATE_PENDING"});
  const suspend=await assertAdminOwnerActionMarket(db,{
    ownerType:"salon",ownerId:55,requestedMarketCode:"US",action:"suspend",
  });
  assert.equal(suspend.market_code,"US");
});


test("tenant currency mismatch cannot masquerade as USD in US scoped records", async () => {
  const bad=dbFromRows((sql) => sql.startsWith("SELECT code, active")
    ? [{code:"US",active:true,country_code:"US",default_currency:"USD"}]
    : [{total_count:1,items:[{id:2,market_code:"US",market_active:true,currency_code:"KGS"}]}]);
  await assert.rejects(readScopedAdminList(bad,{
    kind:"salons",marketCode:"US",limit:10,offset:0,
  }),{code:"ADMIN_MARKET_READBACK_MISMATCH"});
  await assert.rejects(assertAdminOwnerActionMarket(
    dbFromRows([{market_code:"US",market_active:true,currency_code:"KGS"}]),
    {ownerType:"salon",ownerId:2,requestedMarketCode:"US",action:"suspend"},
  ),{code:"ADMIN_OWNER_CURRENCY_MISMATCH"});
});

test("misconfigured market country or USD default fails closed", async () => {
  const db=dbFromRows([{code:"US",active:true,country_code:"US",default_currency:"KGS"}]);
  await assert.rejects(readScopedAdminList(db,{
    kind:"bookings",marketCode:"US",limit:10,offset:0,
  }),{code:"ADMIN_MARKET_CONFIGURATION_CONFLICT"});
});
