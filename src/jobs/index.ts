import { config, isTest } from '../config.js';
import { logger } from '../lib/logger.js';
import { reconcileRatings } from './reconcile-ratings.js';

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const jobs: Job[] = [{ name: 'reconcile-ratings', everyMs: 10 * 60 * 1000, run: reconcileRatings }];

const timers: NodeJS.Timeout[] = [];

export function startJobs() {
  const enabled = config.JOBS_ENABLED ? config.JOBS_ENABLED === 'true' : !isTest;
  if (!enabled) return;

  for (const job of jobs) {
    const tick = async () => {
      const started = Date.now();
      try {
        const result = await job.run();
        logger.info({ job: job.name, ms: Date.now() - started, result }, 'job finished');
      } catch (err) {
        logger.error({ err, job: job.name }, 'job failed');
      }
    };
    timers.push(setInterval(tick, job.everyMs));
  }
  logger.info({ jobs: jobs.map((j) => j.name) }, 'background jobs scheduled');
}

export function stopJobs() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
