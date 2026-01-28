// alerts/alert.js
import { sendWebhook } from '../webhooks/sender.js';

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const MIN_AFFECTED = Number(process.env.ALERT_MIN_AFFECTED || 0);
const MAX_DURATION_MS = Number(process.env.ALERT_MAX_DURATION_MS || 0);

export async function maybeAlert({ job, dry_run, metrics, note }) {
  if (!ALERT_WEBHOOK_URL) return { ok: true, skipped: 'no_alert_webhook' };
  if (dry_run) return { ok: true, skipped: 'dry_run' };

  const reasons = [];

  if (MIN_AFFECTED > 0 && metrics.affected < MIN_AFFECTED) {
    reasons.push(`affected_lt_${MIN_AFFECTED}`);
  }
  if (MAX_DURATION_MS > 0 && metrics.duration_ms > MAX_DURATION_MS) {
    reasons.push(`duration_gt_${MAX_DURATION_MS}`);
  }

  if (reasons.length === 0) return { ok: true, skipped: 'no_threshold_breach' };

  const payload = {
    type: 'ALERT',
    job,
    reasons,
    metrics,
    note,
    ts: new Date().toISOString()
  };

  const res = await sendWebhook(ALERT_WEBHOOK_URL, payload, { retries: 3, backoffMs: 500 });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
