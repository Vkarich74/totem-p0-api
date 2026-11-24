// G5 T6: server-side Owner Opening scope and stable PostgreSQL cursor.
// No inferred market, no mutations, no dependency on uninstalled migrations.
export const OWNER_QUEUE_MARKET_SQL = "UPPER(BTRIM(COALESCE(NULLIF(precheck_result_json->'normalized'->>'market_code',''),precheck_result_json->>'market_code','')))";
const MARKETS = new Set(["US","KG","KZ","UNKNOWN"]);
const ROLES = new Set(["salon","master"]);
const STATUSES = new Set(["draft","validated","validation_failed","approved","provisioning","provisioned","email_ready","email_sent","email_failed","activated","rejected","suspended","failed"]);
function invalid(code) { const e = new Error(code); e.code = code; e.status = 400; return e; }
function optional(query,key,allowed) {
  const value=query[key];
  if(value===undefined) return null;
  if(typeof value!=="string"||!allowed.has(value)) throw invalid("ADMIN_QUEUE_FILTER_INVALID");
  return value;
}
export function ownerQueueScope(query={}) {
  const market=optional(query,"market",MARKETS);
  const role=optional(query,"owner_type",ROLES);
  const status=optional(query,"status",STATUSES);
  const values=[], conditions=[];
  const bind=v=>{values.push(v);return "$"+values.length;};
  if(market==="UNKNOWN") conditions.push(OWNER_QUEUE_MARKET_SQL+" = ''");
  else if(market) conditions.push(OWNER_QUEUE_MARKET_SQL+" = "+bind(market));
  if(role) conditions.push("owner_type = "+bind(role));
  if(status) conditions.push("status = "+bind(status));
  return {scope:{market,owner_type:role,status},values,conditions};
}
const ID=/^[1-9][0-9]{0,18}$/;
// PostgreSQL ISO DateStyle, including exact microseconds and optional UTC offset.
const STAMP=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[+-]\d{2}(?::\d{2})?)?$/;
function validId(id){return typeof id==="string"&&ID.test(id)&&BigInt(id)<=9223372036854775807n;}
function validStamp(t){return t===null||(typeof t==="string"&&STAMP.test(t)&&Number.isFinite(Date.parse(t.replace(" ","T").replace(/([+-]\d{2})$/,"$1:00"))));}
export function ownerQueuePage(query={}) {
  const result=ownerQueueScope(query);
  const {scope,values,conditions}=result;
  const raw=query.limit;
  if(raw!==undefined&&(typeof raw!=="string"||!/^\d{1,3}$/.test(raw)||Number(raw)<1||Number(raw)>200)) throw invalid("ADMIN_QUEUE_LIMIT_INVALID");
  const limit=raw===undefined?100:Number(raw);
  const bind=v=>{values.push(v);return "$"+values.length;};
  if(query.cursor!==undefined){
    let c;
    if(typeof query.cursor!=="string"||query.cursor.length>400) throw invalid("ADMIN_QUEUE_CURSOR_INVALID");
    try{c=JSON.parse(query.cursor);}catch{throw invalid("ADMIN_QUEUE_CURSOR_INVALID");}
    if(!c||c.v!==1||!validId(c.id)||!validStamp(c.at)||
       c.market!==scope.market||c.owner_type!==scope.owner_type||c.status!==scope.status)
      throw invalid("ADMIN_QUEUE_CURSOR_INVALID");
    if(c.at===null) conditions.push("(created_at IS NULL AND id < "+bind(c.id)+")");
    else conditions.push("((created_at,id) < ("+bind(c.at)+","+bind(c.id)+") OR created_at IS NULL)");
  }
  const limitParam=bind(limit+1);
  return {...result,limit,limitParam,where:conditions.length?"WHERE "+conditions.join(" AND "):""};
}
export function ownerQueueResult(rows,{scope,limit}){
  const more=rows.length>limit, page=rows.slice(0,limit), last=page.at(-1);
  const next_cursor=more?JSON.stringify({v:1,...scope,at:last.queue_cursor_at,id:last.queue_cursor_id}):null;
  return {requests:page.map(({queue_cursor_at,queue_cursor_id,...row})=>row),
    pagination:{contract:"g5_owner_queue_v1",scope,limit,has_more:more,next_cursor}};
}
