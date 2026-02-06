// routes_system/jobs.js
import express from 'express';
import { runSettlementsJob } from '../jobs/settlements.js';
import { runAutoClosePeriodsJob } from '../jobs/autoClosePeriods.js';
import { exportPayoutsCsv } from '../exports/payoutsCsv.js';
import { runBackfillMarkPaid } from '../jobs/backfillPayouts.js';

const router = express.Router();

function requireSystem(req, res) {
  const actor = req.headers['x-actor-type'];
  if (actor !== 'system') {
    res.status(403).json({ error: 'FORBIDDEN' });
    return false;
  }

  const required = process.env.SYSTEM_TOKEN;
  if (required) {
    const token = req.headers['x-system-token'];
    if (!token || token !== required) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return false;
    }
  }

  return true;
}

const isDryRun = (req) => req.query.dry_run === '1';
const isConfirm = (req) => req.query.confirm === '1';

// settlements
router.post('/jobs/settlements/run', (req, res) => {
  try {
    if (!requireSystem(req, res)) return;
    res.json(runSettlementsJob({
      dryRun: isDryRun(req),
      request_id: req.request_id
    }));
  } catch (err) {
    res.status(500).json({ error: 'SETTLEMENTS_JOB_FAILED', message: err.message });
  }
});

// auto-close
router.post('/jobs/periods/auto-close', (req, res) => {
  try {
    if (!requireSystem(req, res)) return;
    res.json(runAutoClosePeriodsJob({
      dryRun: isDryRun(req),
      request_id: req.request_id
    }));
  } catch (err) {
    res.status(500).json({ error: 'AUTO_CLOSE_PERIODS_FAILED', message: err.message });
  }
});

// CSV export
router.get('/exports/payouts.csv', (req, res) => {
  try {
    if (!requireSystem(req, res)) return;
    const out = exportPayoutsCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payouts.csv"');
    res.send(out.csv);
  } catch (err) {
    res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
  }
});

// BACKFILL / REPLAY: mark payouts paid by filters (safe)
// Write requires confirm=1. Dry-run supports same filters.
router.post('/jobs/payouts/backfill/mark-paid', (req, res) => {
  try {
    if (!requireSystem(req, res)) return;

    const dryRun = isDryRun(req);
    const confirm = isConfirm(req);

    // filters from query
    const filters = {
      ids: req.query.ids,                 // "1,2,3"
      id_min: req.query.id_min,           // "10"
      id_max: req.query.id_max,           // "200"
      entity_type: req.query.entity_type, // "salon"
      entity_id: req.query.entity_id,     // "1"
      period_from: req.query.period_from, // "2025-12-01"
      period_to: req.query.period_to,     // "2025-12-31"
      period_to_lt: req.query.period_to_lt // "2026-01-01"
    };

    const out = runBackfillMarkPaid({
      dryRun,
      confirm,
      request_id: req.request_id,
      filters
    });

    // If confirm required, return 400 (hard stop)
    if (out && out.ok === false && out.error === 'CONFIRM_REQUIRED') {
      return res.status(400).json(out);
    }

    return res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'BACKFILL_FAILED', message: err.message });
  }
});

export default router;
