import express from "express";

const router = express.Router();

/**
 * DIAG AUTH — NO DB, NO COOKIE
 */

router.get("/auth", (req, res) => {
  res.status(200).send("AUTH OK");
});

router.post("/auth/request", (req, res) => {
  res.status(200).send("AUTH REQUEST OK");
});

router.get("/auth/verify", (req, res) => {
  res.status(200).send("AUTH VERIFY OK");
});

export default router;
