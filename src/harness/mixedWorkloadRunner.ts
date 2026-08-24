import type { GraphClient, MixedWorkloadResult } from "../types/index.js";
import { nowMs } from "../utils/stats.js";

/**
 * Runs the mixed read/write workload at a given client concurrency for a
 * fixed duration, per assignment section 5.2 ("Sustained queries/second with
 * a stated client concurrency ... and read/write mix").
 */
export async function runMixedWorkload(
  client: GraphClient,
  concurrency: number,
  durationSec: number,
  readWriteMix: string // e.g. "80/20" -> 80% reads, 20% writes
): Promise<MixedWorkloadResult> {
  const [readPctStr] = readWriteMix.split("/");
  const readPct = Number(readPctStr) / 100;

  const endAt = nowMs() + durationSec * 1000;
  let totalOps = 0;
  let errorCount = 0;
  const lock = { totalOps: 0, errorCount: 0 };

  async function worker() {
    while (nowMs() < endAt) {
      const isWrite = Math.random() > readPct;
      try {
        await client.mixedOp(isWrite);
        lock.totalOps++;
      } catch {
        lock.errorCount++;
        lock.totalOps++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  const actualStart = nowMs();
  await Promise.all(workers);
  const actualDurationSec = (nowMs() - actualStart) / 1000;

  totalOps = lock.totalOps;
  errorCount = lock.errorCount;

  return {
    platform: client.platform,
    concurrency,
    readWriteMix,
    durationSec: Math.round(actualDurationSec * 100) / 100,
    totalOps,
    throughputQps: Math.round(totalOps / actualDurationSec),
    errorCount,
    errorRate: totalOps > 0 ? Math.round((errorCount / totalOps) * 10000) / 100 : 0,
  };
}