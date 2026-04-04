import express from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { createSalonCanonical } from "../../services/provision/createSalonCanonical.js";
import { createMasterCanonical } from "../../services/provision/createMasterCanonical.js";
import { bindMasterToSalonCanonical } from "../../services/provision/bindMasterToSalonCanonical.js";
import { activateMasterSalonCanonical } from "../../services/provision/activateMasterSalonCanonical.js";
import { terminateMasterSalonCanonical } from "../../services/provision/terminateMasterSalonCanonical.js";

function sendProvisionError(res, err, flow){
  const status = Number(err?.status) || 500;
  const error = String(err?.code || err?.message || "PROVISION_FAILED");

  return res.status(status).json({
    ok: false,
    flow,
    error,
    details: err?.details || null,
    meta: {
      idempotent: false
    }
  });
}

export default function buildProvisionRouter(pool){
  const r = express.Router();

  r.use(requireRole(["system", "owner", "salon_admin"]));

  r.post("/provision/salons", async (req, res) => {
    try{
      const result = await createSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(result);
    }catch(err){
      console.error("PROVISION_CREATE_SALON_ERROR", err);
      return sendProvisionError(res, err, "create_salon");
    }
  });

  r.post("/provision/masters", async (req, res) => {
    try{
      const result = await createMasterCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(result);
    }catch(err){
      console.error("PROVISION_CREATE_MASTER_ERROR", err);
      return sendProvisionError(res, err, "create_master");
    }
  });

  r.post("/provision/bind", async (req, res) => {
    try{
      const result = await bindMasterToSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(result);
    }catch(err){
      console.error("PROVISION_BIND_ERROR", err);
      return sendProvisionError(res, err, "bind_master_to_salon");
    }
  });

  r.post("/provision/bind/activate", async (req, res) => {
    try{
      const result = await activateMasterSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(result);
    }catch(err){
      console.error("PROVISION_ACTIVATE_BIND_ERROR", err);
      return sendProvisionError(res, err, "activate_master_salon");
    }
  });

  r.post("/provision/bind/terminate", async (req, res) => {
    try{
      const result = await terminateMasterSalonCanonical({
        pool,
        payload: req.body || {}
      });

      return res.json(result);
    }catch(err){
      console.error("PROVISION_TERMINATE_BIND_ERROR", err);
      return sendProvisionError(res, err, "terminate_master_salon");
    }
  });

  return r;
}
