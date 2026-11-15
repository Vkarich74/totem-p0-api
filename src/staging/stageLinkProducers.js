// Shared Stage URL generators: no I/O, DB or email side effects.
import { getStageLinkPolicy } from "./stageLinkRuntime.js";

export function buildRuntimePasswordResetUrl({role,slug,login}) {
  const route = `#/auth/reset?role=${encodeURIComponent(role)}&slug=${encodeURIComponent(slug)}&login=${encodeURIComponent(login)}`;
  const policy = getStageLinkPolicy();
  return policy.strict ? policy.appLink(route,"reset") : "https://app.totemv.com/" + route;
}
export function buildRuntimeReferralUrl(code) {
  const route = `#/mobile?ref=${encodeURIComponent(code)}`;
  const policy = getStageLinkPolicy();
  return policy.strict ? policy.appLink(route,"referral") : "https://app.totemv.com/" + route;
}
export function buildRuntimeOwnerOpeningLinks(publicUrl,cabinetUrl) {
  const policy = getStageLinkPolicy();
  const app = policy.strict ? policy.appOrigin : "https://app.totemv.com";
  const site = policy.strict ? policy.publicOrigin : "https://totemv.com";
  const publicLink = publicUrl && publicUrl.startsWith("http") ? publicUrl :
    publicUrl ? site + (publicUrl.startsWith("/") ? "" : "/") + publicUrl : null;
  const cabinetLink = cabinetUrl && cabinetUrl.startsWith("http") ? cabinetUrl :
    cabinetUrl ? app + "/" + cabinetUrl : null;
  if(policy.strict){
    if(publicLink)policy.assert(publicLink,"public");
    if(cabinetLink)policy.assert(cabinetLink,"cabinet");
  }
  return {publicLink,cabinetLink};
}
export function assertRuntimeNotificationAction(actionUrl) {
  if(actionUrl)getStageLinkPolicy().assert(actionUrl,"action");
}
export function assertRuntimeTemplateBookingUrl(bookingUrl) {
  if(bookingUrl)getStageLinkPolicy().assert(bookingUrl,"booking");
}
