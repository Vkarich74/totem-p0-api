import test from "node:test";
import assert from "node:assert/strict";
import {ownerQueuePage,readUsOwnerQueuePage} from "../src/services/provision/ownerOpeningQueueRead.js";
const q=at=>({market:"US",cursor:JSON.stringify({v:1,market:"US",owner_type:null,status:null,id:"1",at})});
const invalid=["2026-02-30 12:00:00.123456+00","2025-02-29 00:00:00","1900-02-29 00:00:00+00","2026-04-31 00:00:00+00","2026-06-31 00:00:00+00","2026-11-31 00:00:00+00","2026-09-31 00:00:00+00","0000-01-01 00:00:00+00","2026-02-00 00:00:00+00","2026-13-01 00:00:00+00"];
for(const at of invalid)test("reject before SQL: "+at,async()=>{let calls=0;await assert.rejects(readUsOwnerQueuePage({query:async()=>{calls++;throw Error("must not query")}},q(at)),{code:"ADMIN_QUEUE_CURSOR_INVALID",status:400});assert.equal(calls,0)});
const valid=["2024-02-29 00:00:00.123456+00","2000-02-29 00:00:00","2026-02-28 23:59:59.999999+06:00","2026-04-30 12:00:00-05","2026-12-31 23:59:59","2026-01-01 00:00:00+00",null];
for(const at of valid)test("preserve valid cursor: "+at,()=>{const p=ownerQueuePage(q(at));if(at!==null)assert.ok(p.values.includes(at));else assert.match(p.where,/created_at IS NULL AND id/);});
test("existing cursor scope remains enforced",()=>{const a=q(valid[0]);a.owner_type="salon";assert.throws(()=>ownerQueuePage(a),{code:"ADMIN_QUEUE_CURSOR_INVALID",status:400})});
