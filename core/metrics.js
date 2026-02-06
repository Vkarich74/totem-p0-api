// core/metrics.js (ESM)
// STEP 24.2 — minimal in-memory metrics (Prometheus-like text)

const state = {
  started_at_ms: Date.now(),
  requests_total: 0,
  requests_inflight: 0,
  responses_total: 0,
  errors_total: 0,
  status_2xx: 0,
  status_4xx: 0,
  status_5xx: 0,
  latency_ms_sum: 0,
  latency_ms_count: 0
};

export function metricsOnRequestStart() {
  state.requests_total += 1;
  state.requests_inflight += 1;
}

export function metricsOnResponse(statusCode, durationMs) {
  state.requests_inflight = Math.max(0, state.requests_inflight - 1);
  state.responses_total += 1;

  const sc = Number(statusCode) || 0;
  if (sc >= 200 && sc < 300) state.status_2xx += 1;
  else if (sc >= 400 && sc < 500) state.status_4xx += 1;
  else if (sc >= 500) state.status_5xx += 1;

  const d = Number(durationMs);
  if (Number.isFinite(d) && d >= 0) {
    state.latency_ms_sum += d;
    state.latency_ms_count += 1;
  }
}

export function metricsOnError() {
  state.errors_total += 1;
}

export function getMetricsText() {
  const upSeconds = Math.floor((Date.now() - state.started_at_ms) / 1000);

  // Prometheus text exposition format-ish (no labels)
  const lines = [];
  lines.push(`# HELP totem_uptime_seconds Uptime in seconds`);
  lines.push(`# TYPE totem_uptime_seconds gauge`);
  lines.push(`totem_uptime_seconds ${upSeconds}`);

  lines.push(`# HELP totem_requests_total Total HTTP requests received`);
  lines.push(`# TYPE totem_requests_total counter`);
  lines.push(`totem_requests_total ${state.requests_total}`);

  lines.push(`# HELP totem_requests_inflight In-flight HTTP requests`);
  lines.push(`# TYPE totem_requests_inflight gauge`);
  lines.push(`totem_requests_inflight ${state.requests_inflight}`);

  lines.push(`# HELP totem_responses_total Total HTTP responses sent`);
  lines.push(`# TYPE totem_responses_total counter`);
  lines.push(`totem_responses_total ${state.responses_total}`);

  lines.push(`# HELP totem_errors_total Total internal errors observed (app-level)`);
  lines.push(`# TYPE totem_errors_total counter`);
  lines.push(`totem_errors_total ${state.errors_total}`);

  lines.push(`# HELP totem_http_status_2xx_total Count of 2xx responses`);
  lines.push(`# TYPE totem_http_status_2xx_total counter`);
  lines.push(`totem_http_status_2xx_total ${state.status_2xx}`);

  lines.push(`# HELP totem_http_status_4xx_total Count of 4xx responses`);
  lines.push(`# TYPE totem_http_status_4xx_total counter`);
  lines.push(`totem_http_status_4xx_total ${state.status_4xx}`);

  lines.push(`# HELP totem_http_status_5xx_total Count of 5xx responses`);
  lines.push(`# TYPE totem_http_status_5xx_total counter`);
  lines.push(`totem_http_status_5xx_total ${state.status_5xx}`);

  lines.push(`# HELP totem_http_latency_ms_sum Sum of response latencies in ms`);
  lines.push(`# TYPE totem_http_latency_ms_sum counter`);
  lines.push(`totem_http_latency_ms_sum ${state.latency_ms_sum}`);

  lines.push(`# HELP totem_http_latency_ms_count Count of latency samples`);
  lines.push(`# TYPE totem_http_latency_ms_count counter`);
  lines.push(`totem_http_latency_ms_count ${state.latency_ms_count}`);

  return lines.join("\n") + "\n";
}
