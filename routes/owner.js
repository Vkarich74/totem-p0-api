// routes/owner.js
import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ ok: true, scope: "owner" });
});

export default router;
