// Cooperative transaction fence for Money Core ledger/balance writers.
// Existing READ COMMITTED transaction client only. Lock before ledger writes
// or aggregation. The advisory key also covers an absent balance row.
// This helper does not grant commercial or financial authority.
const TYPES=new Set(['salon','master','platform','system']);
export async function lockMoneyOwnerBalances(client, owners){
  const fail=code=>Object.assign(new Error(code),{code,statusCode:409});
  if(!client||typeof client.query!=='function'||!Array.isArray(owners)||!owners.length)
    throw fail('MONEY_BALANCE_LOCK_CONTRACT_INVALID');
  const unique=new Map();
  for(const o of owners){
    const type=o?.owner_type, id=Number(o?.owner_id), currency=o?.currency;
    if(o?.owner_id==null||o.owner_id===''||!TYPES.has(type)||!Number.isSafeInteger(id)||id<0||(id===0&&type!=='platform')||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))
      throw fail('MONEY_BALANCE_LOCK_SCOPE_INVALID');
    const key=JSON.stringify([type,String(id),currency]);
    unique.set(key,[type,String(id),currency]);
  }
  const keys=[...unique.keys()].sort();
  for(const key of keys)
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('money-core:balance:' || $1::text, 0))",[key]);
  for(const key of keys)
    await client.query("SELECT id FROM public.money_owner_balances WHERE owner_type=$1 AND owner_id=$2 AND currency=$3 FOR UPDATE",unique.get(key));
}
