import express from 'express';
import requireActiveSalon from '../middleware/requireActiveSalon.js';
import { createBooking } from './booking.service.js';

const router = express.Router();

router.post('/create', requireActiveSalon, async (req, res) => {
  try {
    const { salon_id, master_id, start_at, end_at, request_id } = req.body;

    if (!salon_id || !master_id || !start_at || !end_at || !request_id) {
      return res.status(400).json({ error: 'INVALID_INPUT' });
    }

    const booking_id = await createBooking({
      salon_id,
      master_id,
      start_at,
      end_at,
      request_id
    });

    res.json({ ok: true, booking_id });
  } catch (e) {
    if (e.code === 409) {
      return res.status(409).json({ error: 'CALENDAR_CONFLICT' });
    }
    if (e.code === 400) {
      return res.status(400).json({ error: e.message });
    }
    console.error('[BOOKING_CREATE]', e);
    res.status(500).json({ error: 'BOOKING_CREATE_FAILED' });
  }
});

export default router;
