import test from "node:test";
import assert from "node:assert/strict";
import {ownerQueuePage,readUsOwnerQueuePage} from "../src/services/provision/ownerOpeningQueueRead.js";
const q=at=>({market:"US",cursor:JSON.stringify({v:1,market:"US",owner_type:null,status:null,id:"1",at})});
for(const suffix of ["+16","-16","+16:00","-16:00","+23:59","-23:59","+15:60","-15:60"]){
 const at="2026-11-28 12:00:00.123456"+suffix;
 test("reject offset before SQL "+suffix,async()=>{let calls=0;await assert.rejects(readUsOwnerQueuePage({query:async()=>{calls++;throw Error("unexpected SQL")}},q(at)),{code:"ADMIN_QUEUE_CURSOR_INVALID",status:400});assert.equal(calls,0)});
}
for(const suffix of ["+15:59","-15:59","+15","-15","+05:30","-03:30","+00",""]){
 const at="2026-11-28 12:00:00.123456"+suffix;
 test("preserve original valid cursor "+suffix,()=>assert.ok(ownerQueuePage(q(at)).values.includes(at)));
}
test("midnight exact boundary stays valid",()=>assert.ok(ownerQueuePage(q("2026-11-28 24:00:00+00")).values.includes("2026-11-28 24:00:00+00")));
test("scope binding stays enforced",()=>{const a=q("2026-11-28 12:00:00+00");a.owner_type="salon";assert.throws(()=>ownerQueuePage(a),{code:"ADMIN_QUEUE_CURSOR_INVALID",status:400})});
