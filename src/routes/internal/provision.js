import express from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { createSalonCanonical } from "../../services/provision/createSalonCanonical.js";
import { createMasterCanonical } from "../../services/provision/createMasterCanonical.js";
import { bindMasterToSalonCanonical } from "../../services/provision/bindMasterToSalonCanonical.js";
import { activateMasterSalonCanonical } from "../../services/provision/activateMasterSalonCanonical.js";
import { terminateMasterSalonCanonical } from "../../services/provision/terminateMasterSalonCanonical.js";
import { buildCanonicalProvisionResponse } from "../../services/provision/provisionShared.js";

function normalizeText(value){
  return String(value || "").trim();
}

function inferProvisionEnvelope(payload = {}){
  const flow = normalizeText(payload.flow) || null;
  const result = payload?.result || null;
  const salon = result?.salon || null;
  const master = result?.master || null;
  const relation = result?.relation || null;

  const inferredOwnerType =
    payload?.owner_type ||
    (salon ? "salon" : (master && !salon ? "master" : null));

  const inferredOwnerId =
    payload?.owner_id ??
    (inferredOwnerType === "salon" ? salon?.id ?? null : master?.id ?? null);

  const inferredCanonicalSlug =
    payload?.canonical_slug ||
    (inferredOwnerType === "salon" ? salon?.slug || null : master?.slug || null);

  const inferredPublicUrl =
    payload?.public_url ||
    result?.urls?.public ||
    (inferredOwnerType && inferredCanonicalSlug ? `/${inferredOwnerType}/${inferredCanonicalSlug}` : null);

  const inferredCabinetUrl =
    payload?.cabinet_url ||
    (inferredOwnerType && inferredCanonicalSlug ? `#/${inferredOwnerType}/${inferredCanonicalSlug}` : null);

  let inferredLifecycleState = payload?.lifecycle_state || null;
  if(!inferredLifecycleState){
    if(relation?.status === "active") inferredLifecycleState = "active";
    else if(relation?.status === "pending") inferredLifecycleState = "onboarding";
    else if(result?.onboarding?.identity?.state) inferredLifecycleState = result.onboarding.identity.state;
    else if(result?.onboarding?.transition?.to_state) inferredLifecycleState = result.onboarding.transition.to_state;
    else inferredLifecycleState = "onboarding";
  }

  let inferredAccessState = payload?.access_state || null;
  if(!inferredAccessState){
    inferredAccessState = relation?.status === "active" ? "active" : "none";
  }

  const inferredRelationStatus = payload?.relation_status || relation?.status || null;

  let inferredReadinessFlag = payload?.readiness_flag || null;
  if(!inferredReadinessFlag){
    if(relation?.status === "active") inferredReadinessFlag = "ready";
    else if(flow === "bind_master_to_salon") inferredReadinessFlag = "pending_bind";
    else if(flow === "activate_master_salon") inferredReadinessFlag = "ready";
    else inferredReadinessFlag = "awaiting_activation";
  }

  return buildCanonicalProvisionResponse({
    ...payload,
    flow,
    owner_type: inferredOwnerType,
    owner_id: inferredOwnerId,
    canonical_slug: inferredCanonicalSlug,
    public_url: inferredPublicUrl,
    cabinet_url: inferredCabinetUrl,
    lifecycle_state: inferredLifecycleState,
    access_state: inferredAccessState,
    relation_status: inferredRelationStatus,
    readiness_flag: inferredReadinessFlag
  });
}

function sendProvisionError(res, err, flow){
  const status = Number(err?.status) || 500;
  const error = String(err?.code || err?.message || "PROVISION_FAILED");

  return res.status(status).json(
    buildCanonicalProvisionResponse({
      ok: false,
      flow,
      owner_type: null,
      owner_id: null,
      canonical_slug: null,
      lifecycle_state: "draft",
      access_state: "none",
      relation_status: null,
      readiness_flag: "draft",
      result: null,
      errors: {
        code: error,
        details: err?.details || null
      },
      meta: {
        idempotent: false
      }
    })
  );
}

export default function buildProvisionRouter(pool){
  const r = express.Router();

  r.post("/provision/salons", requireRole(["system", "owner", "salon_admin"]), async (req, res) => {
    try{
      const result = await createSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(inferProvisionEnvelope(result));
    }catch(err){
      console.error("PROVISION_CREATE_SALON_ERROR", err);
      return sendProvisionError(res, err, "create_salon");
    }
  });

  r.post("/provision/masters", requireRole(["system", "owner", "salon_admin"]), async (req, res) => {
    try{
      const result = await createMasterCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(inferProvisionEnvelope(result));
    }catch(err){
      console.error("PROVISION_CREATE_MASTER_ERROR", err);
      return sendProvisionError(res, err, "create_master");
    }
  });

  r.post("/provision/bind", requireRole(["system", "owner", "salon_admin"]), async (req, res) => {
    try{
      const result = await bindMasterToSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(inferProvisionEnvelope(result));
    }catch(err){
      console.error("PROVISION_BIND_ERROR", err);
      return sendProvisionError(res, err, "bind_master_to_salon");
    }
  });

  r.post("/provision/bind/activate", requireRole(["system", "owner", "salon_admin"]), async (req, res) => {
    try{
      const result = await activateMasterSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(inferProvisionEnvelope(result));
    }catch(err){
      console.error("PROVISION_ACTIVATE_BIND_ERROR", err);
      return sendProvisionError(res, err, "activate_master_salon");
    }
  });

  r.post("/provision/bind/terminate", requireRole(["system", "owner", "salon_admin"]), async (req, res) => {
    try{
      const result = await terminateMasterSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(inferProvisionEnvelope(result));
    }catch(err){
      console.error("PROVISION_TERMINATE_BIND_ERROR", err);
      return sendProvisionError(res, err, "terminate_master_salon");
    }
  });

  return r;
}