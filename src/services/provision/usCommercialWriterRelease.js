// G5 T3/T4/T5 deployment fence. No user input, credentials or env override.
// The commercial policy, fresh source attestation and projection migration
// require joint approval and end-to-end acceptance before this can change.
export function commercialWriterRelease(){
 return Object.freeze({contract:"us_g5_t3_t4_t5_v1",release:"HOLD",activation:false,
  welcome:false,projection_write:false,role_operations:false,
  policy:"UNAPPROVED",source_receipt:"ACTIVATION_WELCOME_CONTRACT_REQUIRED",
  migration:"NOT_AUTHORIZED"});
}
export function assertUsCommercialWriterReleased(operation){
 const codes={activation:"US_G3_COMMERCIAL_ACTIVATION_RELEASE_HOLD",
  welcome:"US_G3_WELCOME_RELEASE_HOLD",projection:"US_SAAS_PROJECTION_RELEASE_HOLD",
  role:"US_ROLE_CONTEXT_HOLD"};
 const code=codes[operation]||"US_COMMERCIAL_OPERATION_INVALID";
 throw Object.assign(Error(code),{code,status:409});
}
