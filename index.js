// index.js
import express from 'express';
import bodyParser from 'body-parser';

import { requestContext } from './middleware/request_context.js';
import { metrics, metricsSnapshot } from './middleware/metrics.js';
import { alerts } from './middleware/alerts.js';
import publicRoutes from './routes_public/index.js';

const app = express();

app.use(bodyParser.json());
app.use(requestContext);
app.use(metrics);
app.use(alerts);

// PUBLIC API
app.use('/public', publicRoutes);

// METRICS
app.get('/metrics', (_req, res) => {
  res.json(metricsSnapshot());
});

// ROOT HEALTH
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ERROR HANDLER (5xx)
app.use((err, _req, res, _next) => {
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
