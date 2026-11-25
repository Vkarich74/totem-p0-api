// Odoo SaaS is not a Core wallet subscription. This protects only
// typed Odoo authority; other legacy billing policy stays unchanged.
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
export async function assertLegacyWalletSubscriptionAuthority(db,ownerType,ownerId){
 if(!["salon","master"].includes(ownerType)||!id(ownerId))throw Object.assign(Error("BILLING_OWNER_INVALID"),{code:"BILLING_OWNER_INVALID",statusCode:409});
 const source=await db.query("SELECT id FROM public.owner_opening_requests WHERE owner_type=$1 AND created_owner_id=$2 AND source_namespace='odoo_online' AND (source_company_id=4 OR source_website_id=5) LIMIT 1 FOR SHARE",[ownerType,id(ownerId)]);
 const projection=await db.query("SELECT provider_namespace FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2 LIMIT 2 FOR UPDATE",[ownerType,id(ownerId)]);
 if(source.rows.length||projection.rows.length>1||projection.rows.some(r=>r.provider_namespace!=null))
   throw Object.assign(Error("US_SAAS_ODOO_BILLING_AUTHORITY_REQUIRED"),{code:"US_SAAS_ODOO_BILLING_AUTHORITY_REQUIRED",statusCode:409});
}
