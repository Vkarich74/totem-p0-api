export function requireAuth(req,res,next){
  if(!req.auth||!req.auth.user_id||!req.auth.role){
    return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
  }
  return next();
}
