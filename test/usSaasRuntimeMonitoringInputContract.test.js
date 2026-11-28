import test from "node:test";
import assert from "node:assert/strict";
import { readUsSaasRuntimeHealth, readUsSaasRuntimeWatchdog } from "../src/services/billing/usSaasRuntimeMonitoring.js";

const counters = ["total","orphaned","due","at_risk","stale","expired_active","active",
  "blocked","pending","runnable","processing","lease_expired","recent_failed","recent_done"];
const baseline = () => ({
  sampled_at: new Date("2026-11-28T03:00:00Z"),
  ...Object.fromEntries(counters.map(k => [k,"0"])),
  max_active_age_s: null,
  oldest_runnable_s: null
});
const control = () => ({
  last_outcome: "NEVER", consecutive_failures: "0", heartbeat_age_s: null, cooling: false
});
const health = (patch) => readUsSaasRuntimeHealth({
  query: async () => ({ rows: [{ ...baseline(), ...patch }] })
});
const watchdog = (patch) => {
  let call = 0;
  return readUsSaasRuntimeWatchdog({
    query: async () => ({ rows: [call++ === 0 ? { ...control(), ...patch } : baseline()] })
  }, { expectedMode: "HOLD" });
};

test("PostgreSQL decimal text and native numbers retain exact valid health semantics", async () => {
  const h = await health({total: "2", active: 2, max_active_age_s: "-0.1255", pending: "1", runnable: "1", oldest_runnable_s: "60.250"});
  assert.equal(h.total,2);
  assert.equal(h.active,2);
  assert.equal(h.max_active_age_s,-0.125);
  assert.equal(h.oldest_runnable_s,60.25);
  assert.equal(h.severity,"WARN");
  const pristine = await watchdog({});
  assert.equal(pristine.reason,"EXPECTED_INITIAL_HOLD");
  assert.equal(pristine.runtime_health_ok,false);
});

for (const [label,value] of [
  ["boolean false",false],["boolean true",true],["blank whitespace"," "],
  ["empty array",[]],["numeric array",[0]],["hexadecimal","0x0"],["exponent","0e0"],
  ["trailing newline","0\n"],["fraction",0.1],["unsafe integer","9007199254740992"]
]) {
  test("reject malformed count: "+label, async () => {
    await assert.rejects(health({total:value}), /US_SAAS_MONITOR_INVALID/);
  });
}
for (const [label,value] of [
  ["boolean",false],["empty string",""],["blank whitespace"," "],["array",[]],
  ["hexadecimal","0x0"],["exponent","0e0"],["overflow after rounding",1e308],
  ["undefined",undefined]
]) {
  test("reject malformed age: "+label, async () => {
    await assert.rejects(health({max_active_age_s:value}), /US_SAAS_MONITOR_INVALID/);
  });
}
test("malformed failure count cannot become pristine HOLD", async () => {
  await assert.rejects(watchdog({consecutive_failures:false}), /US_SAAS_MONITOR_INVALID/);
});
test("malformed heartbeat cannot become a valid numeric age", async () => {
  await assert.rejects(watchdog({heartbeat_age_s:" "}), /US_SAAS_MONITOR_INVALID/);
});
