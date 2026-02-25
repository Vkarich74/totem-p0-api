import jwt from 'jsonwebtoken';

const ALLOWED_ROLES = new Set(['owner','salon_admin','master','system']);

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

export function resolveAuth(req,res,next){
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