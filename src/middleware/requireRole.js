export function requireRole(roles){
  const allowed=Array.isArray(roles)?new Set(roles):new Set([String(roles)]);
  return (req,res,next)=>{
    if(!req.auth||!req.auth.role){
      return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
    }
    if(!allowed.has(req.auth.role)){
      return res.status(403).json({ok:false,error:'FORBIDDEN'});
    }
    return next();
  };
}
