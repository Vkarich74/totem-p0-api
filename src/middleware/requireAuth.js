function isPast(value){
  if(!value){
    return false;
  }

  const time = new Date(value).getTime();
  if(Number.isNaN(time)){
    return false;
  }

  return time < Date.now();
}

export function requireAuth(req,res,next){
  const auth = req?.auth || null;

  if(!auth || !auth.user_id || !auth.role){
    return res.status(401).json({
      ok:false,
      error:'UNAUTHORIZED',
      code:'NO_AUTH'
    });
  }

  if(isPast(auth.session_expires_at)){
    return res.status(401).json({
      ok:false,
      error:'UNAUTHORIZED',
      code:'SESSION_EXPIRED'
    });
  }

  if(isPast(auth.idle_timeout_at)){
    return res.status(401).json({
      ok:false,
      error:'UNAUTHORIZED',
      code:'IDLE_TIMEOUT'
    });
  }

  return next();
}
