// index.js
import express from 'express';
import bodyParser from 'body-parser';

import publicRoutes from './routes_public/index.js';

const app = express();

app.use(bodyParser.json());

// PUBLIC API
app.use('/public', publicRoutes);

// ROOT HEALTH (для Railway / smoke)
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
