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

export async function resolveAuth(req,res,next){
  req.auth = null;

  const token = parseBearer(req);

  console.log("=== AUTH DEBUG START ===");
  console.log("JWT_SECRET PRESENT:", !!process.env.JWT_SECRET);
  console.log("TOKEN PRESENT:", !!token);

  if(token && process.env.JWT_SECRET){
    try{
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      console.log("JWT PAYLOAD:", payload);

      const user_id = safeInt(payload?.user_id ?? payload?.id ?? payload?.sub);
      const roleRaw = String(payload?.role ?? '').trim();

      if(user_id && ALLOWED_ROLES.has(roleRaw)){
        req.auth = { user_id, role: roleRaw, source: 'jwt' };
        console.log("AUTH SUCCESS");

        // 🔥 AUTO ENSURE PERSONAL SALON FOR MASTER
        if(roleRaw === 'master'){
          try{
            const pool = getPool();
            const client = await pool.connect();

            try{
              await client.query("BEGIN");

              const masterRes = await client.query(
                "SELECT id, slug FROM masters WHERE user_id = $1 LIMIT 1",
                [user_id]
              );

              if(masterRes.rowCount > 0){
                const master = masterRes.rows[0];

                const existing = await client.query(
                  `
                  SELECT s.id
                  FROM salons s
                  JOIN master_salon ms ON ms.salon_id = s.id
                  WHERE ms.master_id = $1
                  AND s.slug = $2
                  LIMIT 1
                  `,
                  [master.id, master.slug]
                );

                if(existing.rowCount === 0){

                  const salonInsert = await client.query(
                    `
                    INSERT INTO salons (slug, name)
                    VALUES ($1,$2)
                    ON CONFLICT (slug) DO NOTHING
                    RETURNING id
                    `,
                    [master.slug, master.slug]
                  );

                  let salonId;

                  if(salonInsert.rowCount > 0){
                    salonId = salonInsert.rows[0].id;
                  } else {
                    const s = await client.query(
                      "SELECT id FROM salons WHERE slug = $1 LIMIT 1",
                      [master.slug]
                    );
                    salonId = s.rows[0].id;
                  }

                  await client.query(
                    `
                    INSERT INTO master_salon (master_id, salon_id, status)
                    VALUES ($1,$2,'active')
                    ON CONFLICT DO NOTHING
                    `,
                    [master.id, salonId]
                  );

                  await client.query(
                    `
                    INSERT INTO owner_salon (owner_id, salon_id, status)
                    VALUES ($1,$2,'active')
                    ON CONFLICT DO NOTHING
                    `,
                    [String(user_id), salonId]
                  );
                }
              }

              await client.query("COMMIT");

            } catch(e){
              await client.query("ROLLBACK");
              console.error("AUTO ENSURE ROLLBACK:", e.message);
            } finally {
              client.release();
            }

          } catch(e){
            console.error("AUTO ENSURE ERROR:", e.message);
          }
        }

      } else {
        console.log("AUTH PAYLOAD INVALID");
      }

    }catch(err){
      console.log("JWT VERIFY ERROR:", err?.message);
    }
  } else {
    if(!process.env.JWT_SECRET){
      console.log("JWT_SECRET NOT SET IN ENV");
    }
    if(!token){
      console.log("NO TOKEN PROVIDED");
    }
  }

  console.log("=== AUTH DEBUG END ===");

  return next();
}