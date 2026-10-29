import { Queue, Worker } from 'bullmq';
import { redis } from './cache.js';
import { logger } from './logger.js';
import { runSearch } from './pipeline/runSearch.js';
import { repo } from './db.js';
import { emit } from './events.js';

const QUEUE = 'searches';
export const searchQueue = new Queue(QUEUE, { connection: redis, defaultJobOptions: { removeOnComplete: 200, removeOnFail: 200 } });

/** Worker runs in-process (events use an in-memory bus); concurrency caps parallel searches. */
export function startWorker() {
  const worker = new Worker(QUEUE, async (job) => runSearch(job.data.searchId as string), { connection: redis, concurrency: 2 });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'job failed');
    if (job) {
      repo.setStatus(job.data.searchId, 'failed', err.message);
      emit(job.data.searchId, { type: 'error', message: err.message });
    }
  });
  return worker;
}

export const enqueueSearch = (searchId: string) => searchQueue.add('search', { searchId }, { jobId: searchId, attempts: 1 });
