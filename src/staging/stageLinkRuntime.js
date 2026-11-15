import { createStageLinkPolicy } from "./stageLinkPolicy.js";
import { isStagingRuntime } from "./stagingSafety.js";
import {
  resolveCanonicalPublicBaseUrl, resolveCanonicalBookingAppBaseUrl
} from "../services/entry/entryContract.js";

// Stage only: use approved CORS origins; never infer from API Host.
export function getStageLinkPolicy() {
  if (!isStagingRuntime(process.env)) return createStageLinkPolicy();
  return createStageLinkPolicy({
    strict: true,
    appOrigin: resolveCanonicalBookingAppBaseUrl(),
    publicOrigin: resolveCanonicalPublicBaseUrl()
  });
}
