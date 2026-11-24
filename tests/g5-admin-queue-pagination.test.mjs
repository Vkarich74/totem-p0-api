import test from "node:test";
import assert from "node:assert/strict";
import { ownerQueueScope, ownerQueuePage, ownerQueueResult } from "../src/services/provision/ownerOpeningQueueRead.js";
test("server scope is bound and excludes unknown markets",()=>{
 const p=ownerQueuePage({market:"US",owner_type:"salon",status:"validated",limit:"15"});
 assert.deepEqual(p.values,["US","salon","validated",16]);
 assert.match(p.where,/precheck_result_json/);
 assert.match(p.where,/owner_type = \$2 AND status = \$3/);
});
test("reject invalid filters and bounded limit",()=>{
 for(const q of [{market:"US' OR 1=1"},{market:["US"]},{owner_type:"admin"},{status:"fake"},{limit:"0"},{limit:"201"},{limit:["15"]}])
   assert.throws(()=>ownerQueuePage(q),e=>e.status===400);
});
test("next cursor keeps exact microseconds and bigint id, hides internal fields",()=>{
 const p=ownerQueuePage({market:"US",limit:"1"});
 const row={id:"9007199254740993",queue_cursor_id:"9007199254740993",queue_cursor_at:"2026-11-24 01:00:00.123456+00"};
 const out=ownerQueueResult([row,{...row,id:1}],p);
 assert.deepEqual(out.requests,[{id:row.id}]);
 const next=ownerQueuePage({market:"US",limit:"1",cursor:out.pagination.next_cursor});
 assert.deepEqual(next.values,["US",row.queue_cursor_at,row.queue_cursor_id,2]);
 assert.match(next.where,/\(created_at,id\) < \(\$2,\$3\)/);
 assert.throws(()=>ownerQueuePage({market:"KG",cursor:out.pagination.next_cursor}),e=>e.status===400);
});
test("no next cursor on last page",()=>{
 assert.equal(ownerQueueResult([],ownerQueuePage()).pagination.next_cursor,null);
});
test("nullable created_at has stable tail order",()=>{
 const p=ownerQueuePage({limit:"1"});
 const out=ownerQueueResult([{id:3,queue_cursor_id:"3",queue_cursor_at:null},{id:2}],p);
 const next=ownerQueuePage({cursor:out.pagination.next_cursor});
 assert.match(next.where,/created_at IS NULL AND id < \$1/);
 assert.deepEqual(next.values,["3",101]);
});
test("reject malformed cursor",()=>{
 for(const cursor of ["{}","not-json",JSON.stringify({v:1,market:null,owner_type:null,status:null,at:"garbage",id:"3"}),JSON.stringify({v:1,market:null,owner_type:null,status:null,at:null,id:"9223372036854775808"})])
  assert.throws(()=>ownerQueuePage({cursor}),e=>e.status===400);
});
test("unknown is explicit and never attributed to US",()=>{
 assert.match(ownerQueueScope({market:"UNKNOWN"}).conditions[0],/= ''$/);
});
