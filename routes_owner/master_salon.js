import db from "../db.js";

/**
 * OWNER → MASTER ↔ SALON
 * statuses: invited | active | fired
 */

// INVITE
export async function inviteMaster(req, res) {
  const { salon_id, master_id } = req.body;
  if (!salon_id || !master_id) {
    return res.status(400).json({ ok: false, error: "missing_params" });
  }

  if (db.mode === "POSTGRES") {
    await db.run(
      `
      INSERT INTO master_salon (salon_id, master_id, status, invited_at, created_at, updated_at)
      VALUES ($1, $2, 'invited', NOW(), NOW(), NOW())
      ON CONFLICT (salon_id, master_id) DO NOTHING
      `,
      [salon_id, master_id]
    );
  } else {
    await db.run(
      `
      INSERT OR IGNORE INTO master_salon
      (salon_id, master_id, status, invited_at, created_at, updated_at)
      VALUES (?, ?, 'invited', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [salon_id, master_id]
    );
  }

  res.json({ ok: true, status: "invited" });
}

// ACTIVATE
export async function activateMaster(req, res) {
  const { salon_id, master_id } = req.body;
  if (!salon_id || !master_id) {
    return res.status(400).json({ ok: false, error: "missing_params" });
  }

  if (db.mode === "POSTGRES") {
    await db.run(
      `
      UPDATE master_salon
      SET status='active',
          activated_at=NOW(),
          updated_at=NOW()
      WHERE salon_id=$1 AND master_id=$2
      `,
      [salon_id, master_id]
    );
  } else {
    await db.run(
      `
      UPDATE master_salon
      SET status='active',
          activated_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP
      WHERE salon_id=? AND master_id=?
      `,
      [salon_id, master_id]
    );
  }

  res.json({ ok: true, status: "active" });
}

// FIRE
export async function fireMaster(req, res) {
  const { salon_id, master_id } = req.body;
  if (!salon_id || !master_id) {
    return res.status(400).json({ ok: false, error: "missing_params" });
  }

  if (db.mode === "POSTGRES") {
    await db.run(
      `
      UPDATE master_salon
      SET status='fired',
          fired_at=NOW(),
          updated_at=NOW()
      WHERE salon_id=$1 AND master_id=$2
      `,
      [salon_id, master_id]
    );
  } else {
    await db.run(
      `
      UPDATE master_salon
      SET status='fired',
          fired_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP
      WHERE salon_id=? AND master_id=?
      `,
      [salon_id, master_id]
    );
  }

  res.json({ ok: true, status: "fired" });
}
