export function requireRole(roles){
  const allowed = Array.isArray(roles)
    ? new Set(roles.map((role) => String(role)))
    : new Set([String(roles)]);

  function isExpired(value){
    if(!value){
      return false;
    }

    const ts = new Date(value).getTime();
    if(!Number.isFinite(ts)){
      return false;
    }

    return ts < Date.now();
  }

  return (req,res,next)=>{
    if(!req.auth || !req.auth.user_id || !req.auth.role){
      return res.status(401).json({ ok:false, error:'UNAUTHORIZED' });
    }

    if(isExpired(req.auth.session_expires_at)){
      return res.status(401).json({ ok:false, error:'SESSION_EXPIRED' });
    }

    if(isExpired(req.auth.idle_timeout_at)){
      return res.status(401).json({ ok:false, error:'IDLE_TIMEOUT' });
    }

    if(!allowed.has(String(req.auth.role))){
      return res.status(403).json({ ok:false, error:'FORBIDDEN' });
    }

    return next();
  };
}
