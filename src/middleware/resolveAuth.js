import jwt from 'jsonwebtoken';
import pkg from 'pg';

const { Pool } = pkg;

const ALLOWED_ROLES = new Set(['owner', 'salon_admin', 'master', 'system']);
const LEGACY_TOKEN_ROLES = new Set(['system', 'owner']);
const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

let _pool = null;
function getPool(){
  if(_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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

function emptyIdentity(userId, role){
  return {
    user_id: userId,
    role,
    salons: [],
    masters: [],
    ownership: []
  };
}

async function buildIdentity(userId, requestedMasterSlug = ''){
  const pool = getPool();
  const client = await pool.connect();
  try{
    const hasMasterId = await authUsersHasColumn(client, 'master_id');

    const authUserFields = ['role', 'master_slug'];
    if(hasMasterId){
      authUserFields.push('master_id');
    }

    const authUserRes = await client.query(
      `SELECT ${authUserFields.join(', ')}
       FROM public.auth_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const authUser = authUserRes.rows[0] || null;
    const authUserRole = String(authUser?.role || '').trim();
    const authUserMasterSlug = String(authUser?.master_slug || '').trim();
    const authUserMasterId = safeInt(authUser?.master_id);

    const masterRes = await client.query(
      `SELECT id
       FROM masters
       WHERE user_id = $1
       ORDER BY id ASC`,
      [userId]
    );

    const masterIdsFromUserId = uniqueNumberList(masterRes.rows.map((row) => row.id));
    let masterIdsFromAuthUserMasterId = [];
    let masterIdsFromSlug = [];

    if(authUserRole === 'master' && authUserMasterId){
      const masterByIdRes = await client.query(
        `SELECT id
         FROM masters
         WHERE id = $1
         ORDER BY id ASC`,
        [authUserMasterId]
      );

      masterIdsFromAuthUserMasterId = uniqueNumberList(
        masterByIdRes.rows.map((row) => row.id)
      );
    }

    if(authUserRole === 'master' && authUserMasterSlug){
      const masterBySlugRes = await client.query(
        `SELECT id
         FROM masters
         WHERE slug = $1
         ORDER BY id ASC`,
        [authUserMasterSlug]
      );

      masterIdsFromSlug = uniqueNumberList(
        masterBySlugRes.rows.map((row) => row.id)
      );
    }

    const masterIds = uniqueNumberList([
      ...masterIdsFromUserId,
      ...masterIdsFromAuthUserMasterId,
      ...masterIdsFromSlug
    ]);

    const safeRequestedMasterSlug = String(requestedMasterSlug || '').trim();
    let requestedMasterId = null;
    let requestedMasterRelation = '';

    if(safeRequestedMasterSlug){
      const requestedMasterRes = await client.query(
        `SELECT id, slug, user_id
         FROM masters
         WHERE slug = $1
         LIMIT 1`,
        [safeRequestedMasterSlug]
      );

      const requestedMaster = requestedMasterRes.rows[0] || null;
      const requestedMasterUserId = safeInt(requestedMaster?.user_id);
      const requestedMasterIdRaw = safeInt(requestedMaster?.id);

      if(requestedMasterIdRaw){
        if(requestedMasterUserId === safeInt(userId)){
          requestedMasterId = requestedMasterIdRaw;
          requestedMasterRelation = 'requested_slug -> masters.user_id';
        }else if(authUserMasterId && authUserMasterId === requestedMasterIdRaw){
          requestedMasterId = requestedMasterIdRaw;
          requestedMasterRelation = 'requested_slug -> auth_users.master_id';
        }else if(
          authUserRole === 'master' &&
          authUserMasterSlug &&
          authUserMasterSlug === safeRequestedMasterSlug
        ){
          requestedMasterId = requestedMasterIdRaw;
          requestedMasterRelation = 'requested_slug -> auth_users.master_slug';
        }
      }
    }

    const mergedMasterIds = uniqueNumberList([
      ...masterIds,
      requestedMasterId
    ]);

    const ownerSalonRes = await client.query(
      `SELECT salon_id
       FROM owner_salon
       WHERE owner_id = $1
       ORDER BY salon_id ASC`,
      [String(userId)]
    );

    const salonIdsFromOwner = uniqueNumberList(
      ownerSalonRes.rows.map((row) => row.salon_id)
    );

    let salonIdsFromMaster = [];

    if(mergedMasterIds.length > 0){
      const masterSalonRes = await client.query(
        `SELECT DISTINCT ms.salon_id
         FROM master_salon ms
         WHERE ms.master_id = ANY($1::int[])
         ORDER BY ms.salon_id ASC`,
        [mergedMasterIds]
      );

      salonIdsFromMaster = uniqueNumberList(
        masterSalonRes.rows.map((row) => row.salon_id)
      );
    }

    const salonIds = uniqueNumberList([
      ...salonIdsFromOwner,
      ...salonIdsFromMaster
    ]);

    const ownership = [];

    for(const salonId of salonIdsFromOwner){
      ownership.push({
        owner_type: 'salon',
        owner_id: salonId,
        relation: 'owner_salon.owner_id'
      });
    }

    for(const salonId of salonIdsFromMaster){
      ownership.push({
        owner_type: 'salon',
        owner_id: salonId,
        relation: 'master_salon'
      });
    }

    for(const masterId of mergedMasterIds){
      let relation = 'auth_users.master_slug -> masters.slug';

      if(masterIdsFromUserId.includes(masterId)){
        relation = 'masters.user_id';
      }else if(masterIdsFromAuthUserMasterId.includes(masterId)){
        relation = 'auth_users.master_id -> masters.id';
      }else if(requestedMasterId && masterId === requestedMasterId && requestedMasterRelation){
        relation = requestedMasterRelation;
      }

      ownership.push({
        owner_type: 'master',
        owner_id: masterId,
        relation
      });
    }

    return {
      salons: salonIds,
      masters: mergedMasterIds,
      ownership
    };
  } finally {
    client.release();
  }
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

    // Legacy tokens are allowed only for internal roles.
    // Cabinet-facing roles must resolve through auth_sessions.
    if(!session_id){
      if(!LEGACY_TOKEN_ROLES.has(roleRaw)){
        return next();
      }

      req.auth = { user_id, role: roleRaw, source: 'jwt_legacy' };

      const requestedMasterSlug = extractRequestedMasterSlug(req);

      try{
        const identityData = await buildIdentity(user_id, requestedMasterSlug);
        req.identity = {
          user_id,
          role: roleRaw,
          salons: identityData.salons,
          masters: identityData.masters,
          ownership: identityData.ownership
        };
      }catch(e){
        req.identity = emptyIdentity(user_id, roleRaw);
      }

      return next();
    }

    const pool = getPool();
    const client = await pool.connect();

    try{
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
        return next();
      }

      const s = sRes.rows[0];

      if(Number(s.user_id) !== user_id){
        return next();
      }

      if(!s.enabled || String(s.role) !== roleRaw){
        return next();
      }

      const sessionExpired = isExpired(s.expires_at);
      const idleTimeoutAt = computeIdleTimeoutAt(s.last_seen_at);
      const idleExpired = isExpired(idleTimeoutAt);
      const revoked = Boolean(s.revoked_at);

      if(sessionExpired || idleExpired || revoked){
        return next();
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
        const identityData = await buildIdentity(user_id, requestedMasterSlug);
        req.identity = {
          user_id,
          role: roleRaw,
          salons: identityData.salons,
          masters: identityData.masters,
          ownership: identityData.ownership
        };
      }catch(e){
        req.identity = emptyIdentity(user_id, roleRaw);
      }

      return next();
    } finally {
      client.release();
    }
  }catch(err){
    return next();
  }
}
