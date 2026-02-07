import db from "../db.js";

/**
 * authOwner
 *
 * Требования:
 * 1) Authorization: Bearer <OWNER_API_TOKEN>
 * 2) X-Salon-Id (явно)
 * 3) owner_id (из токена) должен быть привязан к salon_id
 *
 * Ошибки:
 * 401 OWNER_TOKEN_REQUIRED
 * 403 OWNER_NOT_ALLOWED_FOR_SALON
 */
export async function authOwner(req, res, next) {
  try {
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "OWNER_TOKEN_REQUIRED" });
    }

    const token = auth.replace("Bearer ", "").trim();

    // Канон: owner_id = token (token-only owner)
    const owner_id = token;

    const salon_id =
      req.headers["x-salon-id"] ||
      req.body?.salon_id ||
      req.params?.salon_id;

    if (!salon_id) {
      return res.status(400).json({ error: "SALON_ID_REQUIRED" });
    }

    const sql =
      db.mode === "POSTGRES"
        ? `
          SELECT 1
          FROM owner_salon
          WHERE owner_id = $1
            AND salon_id = $2
            AND status = 'active'
          LIMIT 1
        `
        : `
          SELECT 1
          FROM owner_salon
          WHERE owner_id = ?
            AND salon_id = ?
            AND status = 'active'
          LIMIT 1
        `;

    const row = await db.get(sql, [owner_id, salon_id]);

    if (!row) {
      return res
        .status(403)
        .json({ error: "OWNER_NOT_ALLOWED_FOR_SALON" });
    }

    // прокидываем контекст
    req.owner_id = owner_id;
    req.salon_id = salon_id;

    next();
  } catch (e) {
    console.error("[AUTH_OWNER]", e);
    res.status(500).json({ error: "OWNER_AUTH_FAILED" });
  }
}
