// Read-only positive proof for a previously committed US welcome intent.
// No send, no negative-proof retry. All header matches must be unambiguous.
const ID=/^[a-zA-Z0-9_-]{1,200}$/;
const RFC=/^<totem-owner-opening-[1-9][0-9]*-welcome-v1@totemv\.com>$/;
const MAIL=/^[^<>\s,;@]+@[^<>\s,;@]+$/;
function mailbox(v){
 if(typeof v!=="string"||/[\r\n]/.test(v))return null;
 const s=v.trim(),m=s.match(/^[^<>,;]*<([^<>]+)>$/),address=(m?m[1]:s).trim().toLowerCase();
 return MAIL.test(address)?address:null;
}
export async function verifyUsWelcomeGmailSent(gmail,{providerId=null,rfcMessageId,recipient,sender}={}){
 const deny=()=>({verified:false});
 if(!RFC.test(String(rfcMessageId||""))||!mailbox(recipient)||!mailbox(sender)||(providerId!==null&&!ID.test(String(providerId))))return deny();
 try{
   // A supplied provider ID cannot hide another SENT message with the same
   // logical RFC ID. Always prove the unique positive match before readback.
   const listed=await gmail.users.messages.list({userId:"me",labelIds:["SENT"],q:"rfc822msgid:"+rfcMessageId,maxResults:2});
   const listing=listed?.data;
   if(!Array.isArray(listing?.messages)||listing.messages.length!==1||listing.nextPageToken||!ID.test(String(listing.messages[0]?.id||"")))return deny();
   const id=listing.messages[0].id;
   if(providerId!==null&&providerId!==id)return deny();
   const found=await gmail.users.messages.get({userId:"me",id,format:"metadata",metadataHeaders:["Message-ID","From","To","Cc","Bcc"]});
   const d=found?.data,headers=d?.payload?.headers;
   if(d?.id!==id||!Array.isArray(d.labelIds)||!d.labelIds.includes("SENT")||!Array.isArray(headers))return deny();
   if(headers.some(h=>["cc","bcc"].includes(String(h?.name||"").toLowerCase())))return deny();
   const unique=name=>{
     const h=headers.filter(x=>String(x?.name||"").toLowerCase()===name);
     return h.length===1?h[0].value:null;
   };
   if(unique("message-id")!==rfcMessageId||mailbox(unique("to"))!==mailbox(recipient)||mailbox(unique("from"))!==mailbox(sender))return deny();
   return {verified:true,providerId:id};
 }catch{return deny();}
}
