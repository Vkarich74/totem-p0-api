import os

PROJECT_ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
INDEX_FILE = os.path.join(PROJECT_ROOT, "index.js")

ROUTE_CODE = """

/* ================= CREATE BOOKING ================= */

app.post("/bookings", requireAuth, async (req, res) => {

  const { salon_id, service_id } = req.body;

  if (!salon_id || !service_id)
    return res.status(400).json({ ok: false, error: "SERVICE_REQUIRED" });

  const pool = getPool();
  const client = await pool.connect();

  try {
    const allowed = await canAccessSalon(
      client,
      req.auth.user_id,
      req.auth.role,
      salon_id
    );

    if (!allowed)
      return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });

    const r = await client.query(
      `INSERT INTO public.bookings (salon_id, service_id, status)
       VALUES ($1,$2,'reserved')
       RETURNING *`,
      [salon_id, service_id]
    );

    return res.json({ ok: true, booking: r.rows[0] });

  } catch (err) {
    return res.status(400).json({ ok: false, error: "CREATE_BOOKING_FAILED" });
  } finally {
    client.release();
  }
});
"""

with open(INDEX_FILE, "a", encoding="utf-8") as f:
    f.write("\n")
    f.write(ROUTE_CODE)

print("BOOKING CREATE API APPENDED TO index.js")
