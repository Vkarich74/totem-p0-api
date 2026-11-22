import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";

// Financial contract create alias requires a direct, active salon owner grant.
function positiveContractId(value){
  const text=String(value ?? "").trim();
  if(!/^[1-9][0-9]*$/.test(text))return null;
  const id=Number(text);
  return Number.isSafeInteger(id)?id:null;
}

function canCreateSalonContract(req,salonId){
  const auth=req?.auth || null;
  const identity=req?.identity || null;
  if(!auth || auth.source!=="session" || !identity ||
     String(identity.user_id)!==String(auth.user_id) ||
     String(identity.role)!==String(auth.role) ||
     !["owner","salon_admin"].includes(String(auth.role)))return false;
  const grants=Array.isArray(identity.ownership)?identity.ownership:[];
  return grants.some(x=>x?.owner_type==="salon" &&
      positiveContractId(x?.owner_id)===salonId);
}

export default function buildContractAliasRouter(pool){

const r = express.Router();

/* CREATE CONTRACT ALIAS (UI COMPATIBILITY) */
r.post("/contracts/create", requireAuth, async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body || {};

const salonId=positiveContractId(salon_id);
const masterId=positiveContractId(master_id);
if(!salonId || !masterId){
return res.status(400).json({ok:false,error:"INVALID_CONTRACT_INPUT"});
}
if(!canCreateSalonContract(req,salonId)){
return res.status(403).json({ok:false,error:"FORBIDDEN"});
}

try{

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salonId,
masterId
]);

if(existing.rows.length){
return res.status(409).json({
ok:false,
error:"ACTIVE_CONTRACT_EXISTS",
contract_id:existing.rows[0].id
});
}

const contract = await pool.query(`
INSERT INTO contracts(
salon_id,
master_id,
status,
version,
terms_json,
effective_from,
created_at
)
VALUES(
$1,$2,'pending',1,$3,$4,NOW()
)
RETURNING *
`,[
salonId,
masterId,
terms_json || {},
effective_from || new Date()
]);

res.json({
ok:true,
contract:contract.rows[0]
});

}catch(err){

console.error("CONTRACT_CREATE_ALIAS_ERROR",err);

res.status(500).json({
ok:false,
error:"CONTRACT_CREATE_FAILED"
});

}

});

return r;

}
