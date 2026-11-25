// Independent periodic read-only command. No provider, no scheduler, no API.
// Intentionally not registered in package scripts, cron, Railway or app.
if(process.env.TOTEM_US_ODOO_SAAS_WATCHDOG_ENABLED!=="true"){
 console.info("US_SAAS_WATCHDOG_HOLD");
}else{
 let pool;
 try{
   ({pool}=await import("../src/db/pool.js"));
   const {readUsSaasRuntimeWatchdog}=await import("../src/services/billing/usSaasRuntimeMonitoring.js");
   if(typeof process.env.DATABASE_URL!=="string"||!process.env.DATABASE_URL.trim())throw Error("DB_REQUIRED");
   const result=await readUsSaasRuntimeWatchdog(pool);
   console.info("US_SAAS_WATCHDOG",JSON.stringify(result));
   process.exitCode=result.severity==="CRITICAL"?2:result.severity==="WARN"?1:0;
 }catch{
   console.error("US_SAAS_WATCHDOG_UNAVAILABLE",JSON.stringify({severity:"CRITICAL"}));
   process.exitCode=2;
 }finally{if(pool)try{await pool.end();}catch{process.exitCode=2;}}
}
