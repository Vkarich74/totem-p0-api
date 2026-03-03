// ===============================
// OWNER CREATE MASTER
// ===============================

r.post("/masters/create", rlInternal, async (req, res) => {

  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "NAME_REQUIRED" });
  }

  try {

    const result = await pool.query(
      `
      INSERT INTO masters (
        name,
        active,
        created_at,
        updated_at
      )
      VALUES ($1, true, NOW(), NOW())
      RETURNING id, name
      `,
      [name]
    );

    return res.json({
      ok: true,
      master: result.rows[0]
    });

  } catch (err) {

    console.error("CREATE_MASTER_ERROR", err);

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR"
    });

  }

});