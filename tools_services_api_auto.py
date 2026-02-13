import os

PROJECT_ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
INDEX_FILE = os.path.join(PROJECT_ROOT, "index.js")

ROUTES_CODE = """

/* ================= SERVICES V2 ================= */

app.post("/services", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const { salon_id, name, duration_min, price } = req.body;

  if (!salon_id || !name || !duration_min || price === undefined)
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salon_id);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `INSERT INTO public.services_v2 (salon_id, name, duration_min, price)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [salon_id, name, duration_min, price]
    );

    return res.json({ ok: true, service: r.rows[0] });

  } catch (err) {
    return res.status(400).json({ ok: false, error: "CREATE_SERVICE_FAILED" });
  } finally {
    client.release();
  }
});

app.get("/services/:salonId", requireAuth, async (req, res) => {
  const salonId = parseInt(req.params.salonId, 10);

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `SELECT * FROM public.services_v2
       WHERE salon_id=$1 AND is_active=true`,
      [salonId]
    );

    return res.json({ ok: true, services: r.rows });

  } finally {
    client.release();
  }
});

app.patch("/services/:id", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const serviceId = parseInt(req.params.id, 10);
  const { name, duration_min, price } = req.body;

  const pool = getPool();
  const client = await pool.connect();

  try {
    const s = await client.query(
      `SELECT salon_id FROM public.services_v2 WHERE id=$1`,
      [serviceId]
    );

    if (!s.rows.length)
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });

    const salonId = s.rows[0].salon_id;

    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    await client.query(
      `UPDATE public.services_v2
       SET name=$1, duration_min=$2, price=$3
       WHERE id=$4`,
      [name, duration_min, price, serviceId]
    );

    return res.json({ ok: true });

  } catch {
    return res.status(400).json({ ok: false, error: "UPDATE_FAILED" });
  } finally {
    client.release();
  }
});

app.post("/services/:id/deactivate", requireAuth, async (req, res) => {
  if (req.auth.role !== "salon_admin")
    return res.status(403).json({ ok: false, error: "ROLE_FORBIDDEN" });

  const serviceId = parseInt(req.params.id, 10);

  const pool = getPool();
  const client = await pool.connect();

  try {
    const s = await client.query(
      `SELECT salon_id FROM public.services_v2 WHERE id=$1`,
      [serviceId]
    );

    if (!s.rows.length)
      return res.status(404).json({ ok: false, error: "SERVICE_NOT_FOUND" });

    const salonId = s.rows[0].salon_id;

    const allowed = await canAccessSalon(client, req.auth.user_id, req.auth.role, salonId);
    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    await client.query(
      `UPDATE public.services_v2
       SET is_active=false
       WHERE id=$1`,
      [serviceId]
    );

    return res.json({ ok: true });

  } finally {
    client.release();
  }
});
"""

with open(INDEX_FILE, "a", encoding="utf-8") as f:
    f.write("\n")
    f.write(ROUTES_CODE)

print("SERVICES API ROUTES APPENDED TO index.js")
