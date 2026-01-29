import express from 'express';
import cors from 'cors';

import payoutExecutionRoutes from './routes/payout_execution.js';
import settlementBatchRoutes from './routes/settlement_batches.js';

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// 🔴 INLINE HEALTH — БЕЗ IMPORT
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// routes
app.use(payoutExecutionRoutes);
app.use(settlementBatchRoutes);

// fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
