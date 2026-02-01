// middleware/metrics.js
// In-memory metrics: request count, error count, latency buckets

const buckets = {
  total: 0,
  errors: 0,
  latency_ms: {
    lt100: 0,
    lt300: 0,
    lt1000: 0,
    gte1000: 0,
  },
};

export function metrics(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    buckets.total += 1;
    if (res.statusCode >= 400) buckets.errors += 1;

    if (ms < 100) buckets.latency_ms.lt100 += 1;
    else if (ms < 300) buckets.latency_ms.lt300 += 1;
    else if (ms < 1000) buckets.latency_ms.lt1000 += 1;
    else buckets.latency_ms.gte1000 += 1;
  });
  next();
}

export function metricsSnapshot() {
  return {
    ok: true,
    ...buckets,
  };
}
