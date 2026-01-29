import express from 'express';
import cors from 'cors';
import { db } from './db/index.js';

import payoutExecutionRoutes from './routes/payout_execution.js';

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// HEALTH (inline, prod-safe)
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// PAYOUT EXECUTION
app.use(payoutExecutionRoutes);

// 🔥 SETTLEMENT BATCH PAY (INLINE)
app.post('/settlements/batch/:id/pay', async (req, res) => {
  const batchId = Number(req.params.id);

  if (!Number.isInteger(batchId)) {
    return res.status(400).json({ error: 'invalid_batch_id' });
  }

  try {
    const batch = await db.query(
      `SELECT id, status FROM settlement_payout_batches WHERE id = $1`,
      [batchId]
    );

    if (batch.rows.length === 0) {
      return res.status(404).json({ error: 'batch_not_found' });
    }

    if (batch.rows[0].status === 'paid') {
      return res.json({ ok: true, idempotent: true });
    }

    await db.query(
      `UPDATE settlement_payout_batches
       SET status = 'paid', paid_at = now()
       WHERE id = $1`,
      [batchId]
    );

    await db.query(
      `UPDATE payouts
       SET status = 'paid'
       WHERE payout_batch_id = $1`,
      [batchId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('SETTLEMENT_BATCH_PAY_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// fallback
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
