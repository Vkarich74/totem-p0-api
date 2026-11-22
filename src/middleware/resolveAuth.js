import jwt from 'jsonwebtoken';
import pkg from 'pg';

const { Pool } = pkg;

const ALLOWED_ROLES = new Set(['owner', 'salon_admin', 'master', 'system']);
const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const AUTH_RESOLVE_TIMEOUT_MS = 8000;

let _pool = null;
function getPool(){
  if(_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.G2_LOCAL_NO_SSL === '1' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: AUTH_RESOLVE_TIMEOUT_MS
  });
  return _pool;
}

function parseBearer(req){
  const h = req.headers?.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function safeInt(v){
  const n = Number(v);
  if(!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function uniqueNumberList(values){
  return [...new Set(
    values
      .map((v) => safeInt(v))
      .filter((v) => v !== null)
  )];
}

async function authUsersHasColumn(client, columnName){
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='auth_users'
       AND column_name=$1
     LIMIT 1`,
    [columnName]
  );

  return result.rows.length > 0;
}

function isAuthResolveTimeoutError(err){
  const code = String(err?.code || '').trim();
  const message = String(err?.message || '').toLowerCase();

  return (
    code === '57014' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection timeout')
  );
}

async function applyAuthQueryTimeout(client){
  await client.query(
    `SELECT set_config('statement_timeout', $1, false)`,
    [`${AUTH_RESOLVE_TIMEOUT_MS}ms`]
  );

  await client.query(
    `SELECT set_config('lock_timeout', $1, false)`,
    [`${AUTH_RESOLVE_TIMEOUT_MS}ms`]
  );
}

async function resetAuthQueryTimeout(client){
  await client.query(`RESET statement_timeout`);
  await client.query(`RESET lock_timeout`);
}

async function withAuthClient(work){
  const pool = getPool();
  const client = await pool.connect();
  let timeoutApplied = false;

  try{
    await applyAuthQueryTimeout(client);
    timeoutApplied = true;
    return await work(client);
  } finally {
    if(timeoutApplied){
      try{
        await resetAuthQueryTimeout(client);
      }catch(e){}
    }

    client.release();
  }
}

function emptyIdentity(userId, role){
  return {
    user_id: userId,
    role,
    salons: [],
    masters: [],
    ownership: []
  };
}

async function buildIdentityWithClient(client, userId, requestedMasterSlug = ''){
  // Identity discovery is intentionally NOT an authorization grant by itself.
  // Only a verified principal and direct, currently-active relationships are exposed.
  // requestedMasterSlug is untrusted request data; it must never grant another master.
  const principalId = safeInt(userId);
  if(!principalId){
    return { salons: [], masters: [], ownership: [] };
  }

  const principalResult = await client.query(
    `SELECT role, enabled FROM public.auth_users WHERE id = $1 LIMIT 1`,
    [principalId]
  );
  const principal = principalResult.rows[0] || null;
  if(!principal || principal.enabled !== true){
    return { salons: [], masters: [], ownership: [] };
  }

  const role = String(principal.role || '').trim();
  if(role === 'salon_admin' || role === 'owner'){
    // owner_salon.owner_id is TEXT in the actual Railway production schema.
    const ownerResult = await client.query(
      `SELECT DISTINCT s.id AS salon_id
         FROM public.owner_salon os
         JOIN public.salons s ON s.id = os.salon_id
        WHERE os.owner_id = $1
          AND os.status = 'active'
          AND s.status = 'active'
          AND s.enabled IS TRUE
        ORDER BY s.id`,
      [String(principalId)]
    );
    const salonIds = uniqueNumberList(ownerResult.rows.map(row => row.salon_id));
    return {
      salons: salonIds,
      masters: [],
      ownership: salonIds.map(id => ({
        owner_type: 'salon', owner_id: id,
        relation: 'active_owner_salon_direct'
      }))
    };
  }

  if(role === 'master'){
    // A salon owner never inherits another person's master cabinet or wallet.
    // Master identity is linked ONLY through masters.user_id (not slug or auth_users.master_id).
    const mastersResult = await client.query(
      `SELECT id AS master_id FROM public.masters
        WHERE user_id = $1 AND active IS TRUE
        ORDER BY id`,
      [principalId]
    );
    const masterIds = uniqueNumberList(mastersResult.rows.map(row => row.master_id));
    if(masterIds.length === 0){
      return { salons: [], masters: [], ownership: [] };
    }
    const membershipResult = await client.query(
      `SELECT DISTINCT s.id AS salon_id
         FROM public.master_salon ms
         JOIN public.salons s ON s.id = ms.salon_id
        WHERE ms.master_id = ANY($1::int[])
          AND ms.status = 'active'
          AND s.status = 'active'
          AND s.enabled IS TRUE
        ORDER BY s.id`,
      [masterIds]
    );
    const salonIds = uniqueNumberList(membershipResult.rows.map(row => row.salon_id));
    return {
      salons: salonIds,
      masters: masterIds,
      ownership: masterIds.map(id => ({
        owner_type: 'master', owner_id: id,
        relation: 'masters.user_id_direct'
      }))
    };
  }

  // system/service identities must use their own narrow service capability.
  // Never synthesize salon/master ownership for unrelated roles.
  return { salons: [], masters: [], ownership: [] };
}

async function buildIdentity(userId, requestedMasterSlug = '', client = null){
  if(client){
    return buildIdentityWithClient(client, userId, requestedMasterSlug);
  }

  return withAuthClient(async (reservedClient) => {
    return buildIdentityWithClient(reservedClient, userId, requestedMasterSlug);
  });
}

function isExpired(ts){
  if(!ts) return false;
  const t = new Date(ts).getTime();
  if(!Number.isFinite(t)) return false;
  return t < Date.now();
}

function computeIdleTimeoutAt(lastSeenAt){
  if(!lastSeenAt) return null;
  const ts = new Date(lastSeenAt).getTime();
  if(!Number.isFinite(ts)) return null;
  return new Date(ts + IDLE_TIMEOUT_MS).toISOString();
}

function extractRequestedMasterSlug(req){
  const path = String(req?.path || '').trim();
  const match = path.match(/^\/masters\/([^/]+)/i);
  if(!match) return '';

  try{
    return decodeURIComponent(match[1]).trim();
  }catch(e){
    return String(match[1] || '').trim();
  }
}

export async function resolveAuth(req,res,next){
  req.auth = null;
  req.identity = null;

  const token = parseBearer(req);

  if(!token || !process.env.JWT_SECRET){
    return next();
  }

  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user_id = safeInt(payload?.user_id ?? payload?.id ?? payload?.sub);
    const roleRaw = String(payload?.role ?? '').trim();
    const session_id = String(payload?.session_id || '').trim() || null;

    if(!user_id || !ALLOWED_ROLES.has(roleRaw)){
      return next();
    }

    // G2: no role, including 'system', is trusted without an active DB session.
    // Finance engine service calls use their independent INTERNAL_API_TOKEN guard.
    if(!session_id){
      return next();
    }

    try{
      await withAuthClient(async (client) => {
        const sRes = await client.query(
          `SELECT s.id,
                  s.user_id,
                  s.expires_at,
                  s.last_seen_at,
                  s.revoked_at,
                  u.enabled,
                  u.role
           FROM public.auth_sessions s
           JOIN public.auth_users u ON u.id = s.user_id
           WHERE s.id = $1
           LIMIT 1`,
          [session_id]
        );

        if(!sRes.rows.length){
          return;
        }

        const s = sRes.rows[0];

        if(Number(s.user_id) !== user_id){
          return;
        }

        if(!s.enabled || String(s.role) !== roleRaw){
          return;
        }

        const sessionExpired = isExpired(s.expires_at);
        const idleTimeoutAt = computeIdleTimeoutAt(s.last_seen_at);
        const idleExpired = isExpired(idleTimeoutAt);
        const revoked = Boolean(s.revoked_at);

        if(sessionExpired || idleExpired || revoked){
          return;
        }

        await client.query(
          `UPDATE public.auth_sessions
           SET last_seen_at = NOW()
           WHERE id = $1`,
          [session_id]
        );

        const nowIso = new Date().toISOString();
        const nextIdleTimeoutAt = computeIdleTimeoutAt(nowIso);

        req.auth = {
          user_id,
          role: roleRaw,
          source: 'session',
          session_id,
          session_source: 'auth_sessions',
          session_expires_at: s.expires_at,
          last_seen_at: nowIso,
          idle_timeout_at: nextIdleTimeoutAt
        };

        const requestedMasterSlug = extractRequestedMasterSlug(req);

        try{
          const identityData = await buildIdentity(user_id, requestedMasterSlug, client);
          req.identity = {
            user_id,
            role: roleRaw,
            salons: identityData.salons,
            masters: identityData.masters,
            ownership: identityData.ownership
          };
        }catch(e){
          if(isAuthResolveTimeoutError(e)){
            throw e;
          }

          req.identity = emptyIdentity(user_id, roleRaw);
        }
      });

      return next();
    } catch(err) {
      if(isAuthResolveTimeoutError(err)){
        return res.status(503).json({
          ok: false,
          error: 'AUTH_RESOLVE_TIMEOUT'
        });
      }

      return next();
    }
  }catch(err){
    return next();
  }
}

// Used by the local G2 DB-backed regression suite; not an HTTP endpoint.
export { buildIdentityWithClient };
