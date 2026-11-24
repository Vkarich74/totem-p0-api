import bcrypt from "bcrypt";
const fail=(code,status=403)=>Object.assign(Error(code),{code,status});
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
export async function assertSensitiveOwnerPassword(db,userId,password){
 if(typeof password!=="string"||!password||Buffer.byteLength(password,"utf8")>72)throw fail("US_OWNER_REAUTH_REQUIRED");
 const rows=await db.query("SELECT password_hash FROM public.auth_users WHERE id=$1 AND role='salon_admin' AND enabled=true AND email_verified_at IS NOT NULL FOR UPDATE",[id(userId)]);
 const hash=rows.rows[0]?.password_hash;
 if(rows.rows.length!==1||typeof hash!=="string"||!/^\$2[aby]\$\d\d\$/.test(hash)||!await bcrypt.compare(password,hash))
   throw fail("US_OWNER_REAUTH_REQUIRED");
}
