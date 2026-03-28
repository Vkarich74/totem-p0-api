import express from "express";

export default function buildContractAliasRouter(pool){

const r = express.Router();

/* CREATE CONTRACT ALIAS (UI COMPATIBILITY) */
r.post("/contracts/create", async (req,res)=>{

const {
salon_id,
master_id,
terms_json,
effective_from
} = req.body;

try{

if(!salon_id || !master_id){
return res.status(400).json({ok:false,error:"INVALID_CONTRACT_INPUT"});
}

const existing = await pool.query(`
SELECT id
FROM contracts
WHERE salon_id=$1
AND master_id=$2
AND status='active'
LIMIT 1
`,[
salon_id,
master_id
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
salon_id,
master_id,
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
