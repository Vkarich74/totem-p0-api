import jwt from 'jsonwebtoken';
import pkg from 'pg';

const { Pool } = pkg;

const ALLOWED_ROLES = new Set(['owner','salon_admin','master','system']);

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

async function buildIdentity(userId){
  const pool = getPool();
  const client = await pool.connect();
  try{
    const masterRes = await client.query(
      `SELECT id
       FROM masters
       WHERE user_id = $1
       ORDER BY id ASC`,
      [userId]
    );

    const masterIds = uniqueNumberList(masterRes.rows.map((row) => row.id));

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

    if(masterIds.length > 0){
      const masterSalonRes = await client.query(
        `SELECT DISTINCT ms.salon_id
         FROM master_salon ms
         JOIN masters m ON m.id = ms.master_id
         WHERE m.user_id = $1
         ORDER BY ms.salon_id ASC`,
        [userId]
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

    for(const masterId of masterIds){
      ownership.push({
        owner_type: 'master',
        owner_id: masterId,
        relation: 'masters.user_id'
      });
    }

    return {
      salons: salonIds,
      masters: masterIds,
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
    const session_id = payload?.session_id || null;

    if(!user_id || !ALLOWED_ROLES.has(roleRaw)){
      return next();
    }

    // Legacy/system tokens without session_id are allowed for internal roles
    if(!session_id){
      req.auth = { user_id, role: roleRaw, source: 'jwt_legacy' };
      try{
        const identityData = await buildIdentity(user_id);
        req.identity = {
          user_id,
          role: roleRaw,
          salons: identityData.salons,
          masters: identityData.masters,
          ownership: identityData.ownership
        };
      }catch(e){
        req.identity = { user_id, role: roleRaw, salons: [], masters: [], ownership: [] };
      }
      return next();
    }

    // Session-aware path
    const pool = getPool();
    const client = await pool.connect();
    try{
      const sRes = await client.query(
        `SELECT s.id, s.user_id, s.expires_at, s.last_seen_at, s.revoked_at,
                u.enabled, u.role
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

      // Validate user and role
      if(!s.enabled || String(s.role) !== roleRaw){
        return next();
      }

      const sessionExpired = isExpired(s.expires_at);
      const idleExpired = isExpired(payload?.idle_timeout_at || null);
      const revoked = !!s.revoked_at;

      if(sessionExpired || idleExpired || revoked){
        // do not attach auth
        return next();
      }

      // update last_seen_at (non-blocking)
      client.query(
        `UPDATE public.auth_sessions SET last_seen_at = NOW() WHERE id = $1`,
        [session_id]
      ).catch(()=>{});

      req.auth = {
        user_id,
        role: roleRaw,
        source: 'session',
        session_id,
        session_expires_at: s.expires_at,
        last_seen_at: s.last_seen_at,
        idle_timeout_at: payload?.idle_timeout_at || null
      };

      try{
        const identityData = await buildIdentity(user_id);
        req.identity = {
          user_id,
          role: roleRaw,
          salons: identityData.salons,
          masters: identityData.masters,
          ownership: identityData.ownership
        };
      }catch(e){
        req.identity = { user_id, role: roleRaw, salons: [], masters: [], ownership: [] };
      }

      return next();
    } finally {
      client.release();
    }
  }catch(err){
    return next();
  }
}
