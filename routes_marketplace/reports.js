// routes_marketplace/reports.js (ESM)
// STEP 26 — tenant isolation for salon reports

import { getSalonReport, getMasterReport } from "../core/reports.js";
import { assertTenantInPath } from "../middleware/tenant.js";

export function registerReportRoutes(app, db) {

  /**
   * GET /marketplace/reports/salon/:salonId
   * Headers:
   *   x-tenant-id: <salonId> (required)
   * Query:
   *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
   */
  app.get("/marketplace/reports/salon/:salonId", (req, res) => {
    try {
      // 🔒 tenant enforcement
      const check = assertTenantInPath(req, res, "salonId");
      if (!check.ok) {
        return res.status(check.status).json({ error: check.error });
      }

      const salonId = Number(req.params.salonId);
      const { from, to } = req.query;

      const report = getSalonReport(db, salonId, { from, to });
      res.json(report);

    } catch (err) {
      handleReportError(err, res);
    }
  });

  /**
   * GET /marketplace/reports/master/:masterId
   * Query:
   *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * NOTE:
   * master reports are NOT tenant-scoped at P1 level
   */
  app.get("/marketplace/reports/master/:masterId", (req, res) => {
    try {
      const masterId = Number(req.params.masterId);
      const { from, to } = req.query;

      const report = getMasterReport(db, masterId, { from, to });
      res.json(report);

    } catch (err) {
      handleReportError(err, res);
    }
  });
}

function handleReportError(err, res) {
  const code = err.code || "REPORT_ERROR";

  switch (code) {
    case "SALON_ID_REQUIRED":
    case "MASTER_ID_REQUIRED":
    case "INVALID_DATE_RANGE":
      return res.status(400).json({ error: code });

    case "MULTI_CURRENCY":
      return res.status(400).json({ error: code });

    default:
      console.error("[REPORT_ERROR]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
