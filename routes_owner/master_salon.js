import db from "../db.js";

/**
 * OWNER → MASTER ↔ SALON
 * statuses: invited | active | fired
 * IMPORTANT:
 * - Postgres/SQLite compatible SQL
 * - No process crash (try/catch)
 * - Insert uses WHERE NOT EXISTS (no need unique index)
 */

function badReq(res) {
  return res.status(400).json({ ok: false, error: "missing_params" });
}

// INVITE
export async function inviteMaster(req, res) {
  try {
    const { salon_id, master_id } = req.body;
    if (!salon_id || !master_id) return badReq(res);

    if (db.mode === "POSTGRES") {
      await db.run(
        `
        INSERT INTO master_salon (salon_id, master_id, status, invited_at, created_at, updated_at)
        SELECT $1, $2, 'invited', NOW(), NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM master_salon WHERE salon_id = $1 AND master_id = $2
        )
        `,
        [salon_id, master_id]
      );
    } else {
      await db.run(
        `
        INSERT INTO master_salon (salon_id, master_id, status, invited_at, created_at, updated_at)
        SELECT ?, ?, 'invited', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE NOT EXISTS (
          SELECT 1 FROM master_salon WHERE salon_id = ? AND master_id = ?
        )
        `,
        [salon_id, master_id, salon_id, master_id]
      );
    }

    return res.json({ ok: true, status: "invited" });
  } catch (err) {
    console.error("[inviteMaster]", err);
    return res.status(500).json({ ok: false, error: "INVITE_FAILED" });
  }
}

// ACTIVATE
export async function activateMaster(req, res) {
  try {
    const { salon_id, master_id } = req.body;
    if (!salon_id || !master_id) return badReq(res);

    if (db.mode === "POSTGRES") {
      await db.run(
        `
        UPDATE master_salon
        SET status = 'active',
            activated_at = NOW(),
            updated_at = NOW()
        WHERE salon_id = $1 AND master_id = $2
        `,
        [salon_id, master_id]
      );
    } else {
      await db.run(
        `
        UPDATE master_salon
        SET status = 'active',
            activated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE salon_id = ? AND master_id = ?
        `,
        [salon_id, master_id]
      );
    }

    return res.json({ ok: true, status: "active" });
  } catch (err) {
    console.error("[activateMaster]", err);
    return res.status(500).json({ ok: false, error: "ACTIVATE_FAILED" });
  }
}

// FIRE
export async function fireMaster(req, res) {
  try {
    const { salon_id, master_id } = req.body;
    if (!salon_id || !master_id) return badReq(res);

    if (db.mode === "POSTGRES") {
      await db.run(
        `
        UPDATE master_salon
        SET status = 'fired',
            fired_at = NOW(),
            updated_at = NOW()
        WHERE salon_id = $1 AND master_id = $2
        `,
        [salon_id, master_id]
      );
    } else {
      await db.run(
        `
        UPDATE master_salon
        SET status = 'fired',
            fired_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE salon_id = ? AND master_id = ?
        `,
        [salon_id, master_id]
      );
    }

    return res.json({ ok: true, status: "fired" });
  } catch (err) {
    console.error("[fireMaster]", err);
    return res.status(500).json({ ok: false, error: "FIRE_FAILED" });
  }
}
