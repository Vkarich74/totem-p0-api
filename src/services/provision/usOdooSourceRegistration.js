// Source-correlation helper for the EXISTING Core owner_opening_requests.
// Not an endpoint, alternate registration system, CRM bridge, or payment grant.
// Must be wired only after a trusted server-side Odoo readback is implemented.
// The callback creates the normal Owner Opening request + moderation + audit.
const SOURCE_NAMESPACE = "odoo_online";

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`US_ODOO_PROOF_${label}_INVALID`);
  }
  return number;
}

function normalizeVerifiedProof(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("US_ODOO_VERIFIED_SOURCE_REQUIRED");
  }
  if (input.source_namespace !== SOURCE_NAMESPACE) {
    throw new Error("US_ODOO_SOURCE_NAMESPACE_INVALID");
  }
  const companyId = positiveInteger(input.company_id, "COMPANY");
  const websiteId = positiveInteger(input.website_id, "WEBSITE");
  const partnerId = positiveInteger(input.partner_id, "PARTNER");
  if (companyId !== 4 || websiteId !== 5) {
    throw new Error("US_ODOO_SOURCE_SCOPE_INVALID");
  }
  const sourceId = String(input.source_request_id ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceId)) {
    throw new Error("US_ODOO_SOURCE_REQUEST_ID_INVALID");
  }
  if (input.owner_type !== "salon" && input.owner_type !== "master") {
    throw new Error("US_ODOO_SOURCE_OWNER_TYPE_INVALID");
  }
  return Object.freeze({
    source_namespace: SOURCE_NAMESPACE,
    source_company_id: companyId,
    source_website_id: websiteId,
    source_partner_id: partnerId,
    source_request_id: sourceId,
    owner_type: input.owner_type,
  });
}

const GET_EXISTING = `
  SELECT id, status, source_partner_id, precheck_result_json
  FROM public.owner_opening_requests
  WHERE source_namespace = $1
    AND source_company_id = $2
    AND source_website_id = $3
    AND source_request_id = $4
    AND owner_type = $5
  FOR UPDATE
`;

// One source-level transaction, existing role-scoped UNIQUE remains authoritative.
// The single-role wrapper preserves the historical internal API.
export async function registerVerifiedUsOdooSources({
  pool,candidate,readVerifiedOdooSources,createExistingOpeningRequest,
  assertExisting=null,exactRoles=true,
}={}){
  if(!pool||typeof pool.connect!=="function")throw Error("US_ODOO_POSTGRES_POOL_REQUIRED");
  if(typeof readVerifiedOdooSources!=="function"||typeof createExistingOpeningRequest!=="function"||
     (assertExisting!==null&&typeof assertExisting!=="function"))throw Error("US_ODOO_TRUSTED_CALLBACKS_REQUIRED");
  const raw=await readVerifiedOdooSources(candidate);
  if(!Array.isArray(raw)||raw.length<1||raw.length>2)throw Error("US_ODOO_SOURCE_ROLE_SET_INVALID");
  const proofs=raw.map(normalizeVerifiedProof).sort((a,b)=>a.owner_type==="salon"?-1:b.owner_type==="salon"?1:0);
  const first=proofs[0],key=[first.source_namespace,first.source_company_id,first.source_website_id,first.source_request_id].join(":");
  const tuple=[first.source_namespace,first.source_company_id,first.source_website_id,first.source_request_id];
  const roles=new Set(proofs.map(p=>p.owner_type));
  if(roles.size!==proofs.length||proofs.some(p=>p.source_namespace!==first.source_namespace||
    p.source_company_id!==first.source_company_id||p.source_website_id!==first.source_website_id||
    p.source_request_id!==first.source_request_id||p.source_partner_id!==first.source_partner_id))
    throw Error("US_ODOO_SOURCE_ROLE_SET_INVALID");
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[key]);
    // Also retain the original role lock for compatibility with an old caller.
    for(const p of proofs)await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[key+":"+p.owner_type]);
    if(exactRoles){
      const prior=await db.query(`SELECT owner_type,source_partner_id FROM public.owner_opening_requests
        WHERE source_namespace=$1 AND source_company_id=$2 AND source_website_id=$3 AND source_request_id=$4 FOR UPDATE`,tuple);
      if(prior.rows.some(r=>!roles.has(r.owner_type)||Number(r.source_partner_id)!==first.source_partner_id))
        throw Error("US_ODOO_SOURCE_ROLE_SET_CHANGED");
    }
    const results=[];
    for(const proof of proofs){
      const existing=await db.query(GET_EXISTING,[...tuple,proof.owner_type]);
      if(existing.rows.length){
        if(existing.rows.length!==1||Number(existing.rows[0].source_partner_id)!==proof.source_partner_id)
          throw Error("US_ODOO_SOURCE_PARTNER_MISMATCH");
        const record=existing.rows[0];
        if(assertExisting)await assertExisting(record,proof);
        results.push(Object.freeze({request_id:Number(record.id),status:record.status,duplicate:true,owner_type:proof.owner_type}));
        continue;
      }
      const created=await createExistingOpeningRequest(db,proof);
      const requestId=Number(created?.id);
      if(!Number.isSafeInteger(requestId)||requestId<=0)throw Error("US_ODOO_CANONICAL_REQUEST_NOT_CREATED");
      const bound=await db.query(
        `UPDATE public.owner_opening_requests SET
         source_namespace=$2,source_company_id=$3,source_website_id=$4,
         source_request_id=$5,source_partner_id=$6,updated_at=NOW()
         WHERE id=$1 AND owner_type=$7 AND source_namespace IS NULL AND source_company_id IS NULL
           AND source_request_id IS NULL RETURNING id,status`,
        [requestId,...tuple,proof.source_partner_id,proof.owner_type]);
      if(bound.rows.length!==1)throw Error("US_ODOO_CANONICAL_REQUEST_SOURCE_BIND_FAILED");
      results.push(Object.freeze({request_id:requestId,status:bound.rows[0].status,duplicate:false,owner_type:proof.owner_type}));
    }
    await db.query("COMMIT");
    return Object.freeze(results);
  }catch(error){
    await db.query("ROLLBACK").catch(()=>{});throw error;
  }finally{db.release();}
}
export async function registerVerifiedUsOdooSource({pool,candidate,readVerifiedOdooSource,createExistingOpeningRequest,assertExisting=null}={}){
  if(typeof readVerifiedOdooSource!=="function")throw Error("US_ODOO_TRUSTED_CALLBACKS_REQUIRED");
  const [result]=await registerVerifiedUsOdooSources({pool,candidate,
    readVerifiedOdooSources:async c=>[await readVerifiedOdooSource(c)],
    createExistingOpeningRequest,assertExisting,exactRoles:false});
  return result;
}
