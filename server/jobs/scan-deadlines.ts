import { emitDeadlinesIfNeeded, findDueSoonTasks, findOverdueTasks } from "../features/notifications/deadline-helpers";

interface DeadlineScannerOptions {
  intervalMs?: number;
  batchSize?: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runScan(batchSize: number) {
  if (running) return;
  running = true;
  try {
    const overdue = await findOverdueTasks(batchSize);
    for (const row of overdue) {
      await emitDeadlinesIfNeeded(row.id);
    }
  } catch (error) {
    console.warn('[deadline-scanner] failed to process overdue tasks', error);
  }

  try {
    const dueSoon = await findDueSoonTasks(batchSize);
    for (const row of dueSoon) {
      await emitDeadlinesIfNeeded(row.id);
    }
  } catch (error) {
    console.warn('[deadline-scanner] failed to process due-soon tasks', error);
  }

  running = false;
}

export function startDeadlineScanner(options: DeadlineScannerOptions = {}) {
  if (timer) return () => { /* already running */ };
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000; // 5 minutes
  const batchSize = options.batchSize ?? 100;

  const execute = () => {
    runScan(batchSize).catch((error) => {
      running = false;
      console.warn('[deadline-scanner] unexpected error', error);
    });
  };

  execute();
  timer = setInterval(execute, intervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
