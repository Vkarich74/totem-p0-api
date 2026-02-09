
import express from "express";
import db from "../db.js";

const router = express.Router();

// POST /system/onboarding/identity
router.post("/identity", async (req, res) => {
  const { lead_id, odoo_user_id, email, requested_role } = req.body || {};
  if (!lead_id || !odoo_user_id || !email || !requested_role)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const sel = db.mode === "POSTGRES"
    ? "SELECT id core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id=$1"
    : "SELECT id core_user_id, granted_role, state FROM onboarding_identities WHERE lead_id=?";

  const ex = await db.get(sel, [lead_id]);
  if (ex) return res.json(ex);

  await db.run(
    db.mode === "POSTGRES"
      ? "INSERT INTO onboarding_identities (lead_id,odoo_user_id,email,requested_role,granted_role) VALUES ($1,$2,$3,$4,$5)"
      : "INSERT INTO onboarding_identities VALUES (?,?,?,?,?)",
    [lead_id, String(odoo_user_id), email, requested_role, requested_role]
  );

  const r = await db.get(sel, [lead_id]);
  res.json(r);
});

export default router;
