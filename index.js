// index.js
import express from 'express';
import bodyParser from 'body-parser';

import { requestContext } from './middleware/request_context.js';
import publicRoutes from './routes_public/index.js';

const app = express();

app.use(bodyParser.json());
app.use(requestContext);

// PUBLIC API
app.use('/public', publicRoutes);

// ROOT HEALTH
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
