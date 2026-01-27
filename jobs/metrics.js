// jobs/metrics.js
export function withMetrics(fn) {
  const started = Date.now();
  const metrics = {
    scanned: 0,
    affected: 0,
    duration_ms: 0
  };

  const result = fn(metrics);

  metrics.duration_ms = Date.now() - started;

  return {
    ...result,
    metrics
  };
}
