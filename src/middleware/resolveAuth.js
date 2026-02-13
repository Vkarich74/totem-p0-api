import jwt from 'jsonwebtoken';

const ALLOWED_ROLES = new Set(['owner','salon_admin','master','system']);

function parseBearer(req){
  const h=req.headers?.authorization||'';
  const m=h.match(/^Bearer\s+(.+)$/i);
  return m?m[1].trim():null;
}

function safeInt(v){
  const n=Number(v);
  if(!Number.isInteger(n)||n<=0)return null;
  return n;
}

export function resolveAuth(req,res,next){
  req.auth=null;

  const token=parseBearer(req);
  if(token&&process.env.JWT_SECRET){
    try{
      const payload=jwt.verify(token,process.env.JWT_SECRET);
      const user_id=safeInt(payload?.user_id??payload?.id??payload?.sub);
      const roleRaw=String(payload?.role??'').trim();
      if(user_id&&ALLOWED_ROLES.has(roleRaw)){
        req.auth={user_id,role:roleRaw,source:'jwt'};
      }
    }catch{}
  }

  if(!req.auth&&String(process.env.ALLOW_HEADER_AUTH||'').toLowerCase()==='true'){
    const user_id=safeInt(req.headers['x-user-id']);
    const roleRaw=String(req.headers['x-role']||'').trim();
    if(user_id&&ALLOWED_ROLES.has(roleRaw)){
      req.auth={user_id,role:roleRaw,source:'headers'};
    }
  }

  return next();
}
