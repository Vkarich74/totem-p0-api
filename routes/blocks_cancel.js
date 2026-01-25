// routes/blocks_cancel.js
export function registerBlocksCancel(app, db) {

  app.post("/blocks/cancel", (req, res) => {
    const { block_id } = req.body || {};

    if (!block_id) {
      return res.status(400).json({ error: "missing_block_id" });
    }

    const info = db
      .prepare(`
        UPDATE blocks
        SET active = 0
        WHERE id = ? AND active = 1
      `)
      .run(block_id);

    if (info.changes === 0) {
      return res.status(404).json({ error: "block_not_found" });
    }

    res.json({ ok: true, block_id });
  });
}
