// webhooks/sender.js
import https from 'https';
import http from 'http';
import { URL } from 'url';

function postOnce(url, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: timeoutMs
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

export async function sendWebhook(url, data, { retries = 3, backoffMs = 500 } = {}) {
  const payload = JSON.stringify(data);
  let lastErr;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await postOnce(url, payload);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, status: res.status };
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
  }

  return { ok: false, error: lastErr?.message || 'webhook_failed' };
}
