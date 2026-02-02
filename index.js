// index.js
import express from 'express';
import bodyParser from 'body-parser';
import path from "path";
import { fileURLToPath } from "url";

import { requestContext } from './middleware/request_context.js';
import { metrics, metricsSnapshot } from './middleware/metrics.js';
import { alerts } from './middleware/alerts.js';

import publicRoutes from './routes_public/index.js';
import ownerRoutes from './routes_owner/index.js';
import systemRoutes from './routes_system/index.js';

// 🔹 EMBED SCHEDULER (SAFE)
if (process.env.SCHEDULER_ENABLED === '1') {
  console.log('[BOOT] scheduler enabled → embedding');
  import('./scheduler.js')
    .then(() => {
      console.log('[BOOT] scheduler loaded');
    })
    .catch(err => {
      console.error('[BOOT] scheduler failed to load', err);
    });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(bodyParser.json());
app.use(requestContext);
app.use(metrics);
app.use(alerts);

// ✅ STATIC PUBLIC ASSETS (WIDGET)
app.use(
  '/public',
  express.static(path.join(__dirname, 'public_static'), {
    immutable: true,
    maxAge: '1y',
  })
);

// SYSTEM API (INTERNAL JOBS)
app.use('/system', systemRoutes);

// PUBLIC API
app.use('/public', publicRoutes);

// OWNER API
app.use('/owner', ownerRoutes);

// METRICS
app.get('/metrics', (_req, res) => {
  res.json(metricsSnapshot());
});

// HEALTH
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ERROR HANDLER
app.use((err, _req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
