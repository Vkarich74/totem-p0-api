// jobs/scheduler.js
import cron from 'node-cron';
import { runSettlementsJob } from './settlements.js';
import { runAutoClosePeriodsJob } from './autoClosePeriods.js';

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED !== '1') {
    console.log('Scheduler disabled');
    return;
  }

  console.log('Scheduler started');

  // every day at 00:10 UTC — auto-close periods
  cron.schedule('10 0 * * *', () => {
    try {
      const res = runAutoClosePeriodsJob();
      console.log('[cron] auto-close periods', res);
    } catch (err) {
      console.error('[cron] auto-close ERROR', err);
    }
  });

  // every day at 00:30 UTC — settlements
  cron.schedule('30 0 * * *', () => {
    try {
      const res = runSettlementsJob();
      console.log('[cron] settlements', res);
    } catch (err) {
      console.error('[cron] settlements ERROR', err);
    }
  });
}
