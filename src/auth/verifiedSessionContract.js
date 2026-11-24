// Session provenance cutover. No schema or secret rotation. Only a canonical
// authenticated issuer may attach this signed claim. Pre-cutover sessions
// cannot be distinguished from weak legacy sessions and must sign in again.
export const VERIFIED_SESSION_VERSION=2;
export function isVerifiedSessionClaim(payload){
 return payload?.auth_session_version===VERIFIED_SESSION_VERSION &&
   Number.isSafeInteger(Number(payload.user_id))&&Number(payload.user_id)>0 &&
   typeof payload.session_id==="string"&&payload.session_id.length>0 &&
   ["salon_admin","master","admin"].includes(payload.role);
}
const REAUTH=new Set(["/auth/login","/auth/start","/auth/verify","/auth/password/reset/start","/auth/password/reset/finish","/admin/auth/login"]);
export function isReauthenticationRoute(req){
 return req.method==="POST"&&REAUTH.has(req.path);
}
export function rejectUnprovenSession(req,res,next,payload){
 if(!payload?.session_id||isVerifiedSessionClaim(payload))return false;
 if(isReauthenticationRoute(req)){
   // A stale credential may accompany a legitimate sign-in attempt, but
   // cannot authenticate it or be passed to a downstream validator.
   delete req.headers.authorization;delete req.headers.Authorization;
   next();return true;
 }
 res.status(401).json({ok:false,error:"SESSION_REAUTH_REQUIRED"});
 return true;
}
