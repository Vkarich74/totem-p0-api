function isPast(value){
  if(!value){
    return true;
  }

  const time = new Date(value).getTime();
  if(!Number.isFinite(time)){
    return true;
  }

  return time <= Date.now();
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

  if(auth.source !== 'session' || !auth.session_id){
    return res.status(401).json({
      ok:false,
      error:'UNAUTHORIZED',
      code:'NO_SESSION'
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
