// middlewares/systemAuth.js

export function systemAuth(req, res, next) {
  const token = req.headers["x-system-token"];

  if (!token || token !== process.env.SYSTEM_TOKEN) {
    return res.status(403).json({
      ok: false,
      error: "FORBIDDEN",
    });
  }

  next();
}
