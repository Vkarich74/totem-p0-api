// routes_public/paymentsIntent.js
import express from "express";
import { openDb } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { request_id, provider, amount } = req.body || {};

    if (!request_id || !provider || !amount) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR"
      });
    }

    // FREEZE-SAFE IMPLEMENTATION
    // Здесь намеренно нет реального списания.
    // Мы фиксируем публичный контракт и идемпотентность.

    return res.json({
      ok: true,
      intent: {
        intent_id: 1,
        request_id: Number(request_id),
        provider,
        amount: Number(amount),
        currency: "KGS"
      },
      idempotent: true
    });
  } catch (err) {
    console.error("paymentsIntent error", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR"
    });
  }
});

export default router;
