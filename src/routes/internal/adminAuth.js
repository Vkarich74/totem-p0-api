import express from "express";

export default function buildAdminAuthRouter() {
  const r = express.Router();

  r.post("/login", (req, res) => {
    return res.status(501).json({
      ok: false,
      error: "ADMIN_AUTH_NOT_IMPLEMENTED",
    });
  });

  r.get("/session", (req, res) => {
    return res.status(501).json({
      ok: false,
      error: "ADMIN_AUTH_NOT_IMPLEMENTED",
    });
  });

  r.post("/logout", (req, res) => {
    return res.status(501).json({
      ok: false,
      error: "ADMIN_AUTH_NOT_IMPLEMENTED",
    });
  });

  return r;
}
