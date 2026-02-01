// middleware/alerts.js
// Log-based alerts (stdout)
// Triggers:
// - error rate spike
// - repeated 5xx within window

const WINDOW_MS = 60 * 1000; // 1 minute
const ERROR_THRESHOLD = 5;

let windowStart = Date.now();
let errorCount = 0;

function resetIfNeeded() {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    errorCount = 0;
  }
}

export function alerts(req, res, next) {
  res.on('finish', () => {
    resetIfNeeded();
    if (res.statusCode >= 500) {
      errorCount += 1;
      if (errorCount >= ERROR_THRESHOLD) {
        console.error(JSON.stringify({
          level: 'alert',
          type: 'error_rate',
          window_ms: WINDOW_MS,
          error_count: errorCount,
          msg: '5xx error rate threshold exceeded',
        }));
      }
    }
  });
  next();
}
