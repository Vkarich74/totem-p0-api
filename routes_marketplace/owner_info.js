export function registerOwnerInfo(app, db) {
  app.get("/marketplace/owner/info", (req, res) => {
    res.json({
      ok: true,
      layer: "P3",
      entity: "owner",
      status: "stub",
      note: "P3 marketplace layer connected. Core P2.5 untouched."
    });
  });
}
