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
       WHERE owner_id = $1
       ORDER BY id ASC`,
      [userId]
    );

    const masterIds = uniqueNumberList(masterRes.rows.map((row) => row.id));

    const ownerSalonRes = await client.query(
      `SELECT salon_id
       FROM owner_salon
       WHERE owner_id = $1
       ORDER BY salon_id ASC`,
      [userId]
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

export async function resolveAuth(req,res,next){
  req.auth = null;
  req.identity = null;

  const token = parseBearer(req);

  console.log('=== AUTH DEBUG START ===');
  console.log('JWT_SECRET PRESENT:', !!process.env.JWT_SECRET);
  console.log('TOKEN PRESENT:', !!token);

  if(token && process.env.JWT_SECRET){
    try{
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      console.log('JWT PAYLOAD:', payload);

      const user_id = safeInt(payload?.user_id ?? payload?.id ?? payload?.sub);
      const roleRaw = String(payload?.role ?? '').trim();

      if(user_id && ALLOWED_ROLES.has(roleRaw)){
        req.auth = { user_id, role: roleRaw, source: 'jwt' };

        try{
          const identityData = await buildIdentity(user_id);

          req.identity = {
            user_id,
            role: roleRaw,
            salons: identityData.salons,
            masters: identityData.masters,
            ownership: identityData.ownership
          };

          console.log('AUTH SUCCESS');
          console.log('IDENTITY SUMMARY:', {
            user_id,
            role: roleRaw,
            salons: req.identity.salons.length,
            masters: req.identity.masters.length,
            ownership: req.identity.ownership.length
          });
        } catch(identityError){
          console.error('IDENTITY BUILD ERROR:', identityError?.message);
          req.identity = {
            user_id,
            role: roleRaw,
            salons: [],
            masters: [],
            ownership: []
          };
        }
      } else {
        console.log('AUTH PAYLOAD INVALID');
      }
    }catch(err){
      console.log('JWT VERIFY ERROR:', err?.message);
    }
  } else {
    if(!process.env.JWT_SECRET){
      console.log('JWT_SECRET NOT SET IN ENV');
    }
    if(!token){
      console.log('NO TOKEN PROVIDED');
    }
  }

  console.log('=== AUTH DEBUG END ===');

  return next();
}
