import express from 'express';
import requireActiveSalon from '../middleware/requireActiveSalon.js';
import { reserveSlot, getMasterCalendar } from './calendar.service.js';

const router = express.Router();

router.post('/reserve', requireActiveSalon, async (req, res) => {
  try {
    const { master_id, salon_id, start_at, end_at } = req.body;

    if (!master_id || !salon_id || !start_at || !end_at) {
      return res.status(400).json({ error: 'INVALID_INPUT' });
    }

    await reserveSlot({ master_id, salon_id, start_at, end_at });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 409) {
      return res.status(409).json({ error: 'CALENDAR_CONFLICT' });
    }
    console.error('[CALENDAR_RESERVE]', e);
    res.status(500).json({ error: 'CALENDAR_RESERVE_FAILED' });
  }
});

router.get('/master/:master_id', requireActiveSalon, async (req, res) => {
  const items = await getMasterCalendar(req.params.master_id);
  res.json({ ok: true, items });
});

export default router;
