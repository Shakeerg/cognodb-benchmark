import type { GraphClient, GraphNode, WorkloadResult } from "../types/index.js";
import { computeLatencyStats, nowMs } from "../utils/stats.js";

/**
 * Runs a single timed workload: warm-up iterations (untimed) followed by
 * `iterations` measured iterations, sampling start nodes randomly per the
 * assignment's "randomly chosen set of start nodes" requirement (section 5.2).
 */
async function timeWorkload(
  fn: (startId: string) => Promise<unknown>,
  sampleIds: string[],
  iterations: number,
  warmupIterations: number
): Promise<{ samplesMs: number[]; errorCount: number }> {
  const pickId = () => sampleIds[Math.floor(Math.random() * sampleIds.length)];

  for (let i = 0; i < warmupIterations; i++) {
    try {
      await fn(pickId());
    } catch {
      // warm-up errors are not counted — the point is just to warm caches/connections
    }
  }

  const samplesMs: number[] = [];
  let errorCount = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = nowMs();
    try {
      await fn(pickId());
      samplesMs.push(nowMs() - t0);
    } catch {
      errorCount++;
    }
  }
  return { samplesMs, errorCount };
}

export async function runTraversalWorkloads(
  client: GraphClient,
  nodes: GraphNode[],
  iterations: number,
  warmupIterations: number,
  sampleSize = 200
): Promise<WorkloadResult[]> {
  const sampleIds = sampleRandomIds(nodes, sampleSize);
  const results: WorkloadResult[] = [];

  for (const hops of [1, 2, 3] as const) {
    const { samplesMs, errorCount } = await timeWorkload(
      (id) => client.traverse(id, hops),
      sampleIds,
      iterations,
      warmupIterations
    );
    results.push({
      platform: client.platform,
      workload: `traversal_${hops}hop`,
      stats: computeLatencyStats(samplesMs, errorCount),
    });
  }
  return results;
}

export async function runLookupWorkloads(
  client: GraphClient,
  nodes: GraphNode[],
  iterations: number,
  warmupIterations: number,
  sampleSize = 200
): Promise<WorkloadResult[]> {
  const sampleIds = sampleRandomIds(nodes, sampleSize);
  const results: WorkloadResult[] = [];

  const point = await timeWorkload(
    (id) => client.pointLookup(id),
    sampleIds,
    iterations,
    warmupIterations
  );
  results.push({
    platform: client.platform,
    workload: "point_lookup",
    stats: computeLatencyStats(point.samplesMs, point.errorCount),
  });

  const categories = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const filtered = await timeWorkload(
    () => client.filteredLookup(categories[Math.floor(Math.random() * categories.length)]),
    ["_unused_"], // filteredLookup doesn't use the start id; kept for a uniform timeWorkload signature
    iterations,
    warmupIterations
  );
  results.push({
    platform: client.platform,
    workload: "filtered_lookup_indexed",
    stats: computeLatencyStats(filtered.samplesMs, filtered.errorCount),
  });

  return results;
}

export async function runAggregationWorkload(
  client: GraphClient,
  iterations: number,
  warmupIterations: number
): Promise<WorkloadResult> {
  const { samplesMs, errorCount } = await timeWorkload(
    () => client.aggregate(),
    ["_unused_"],
    iterations,
    warmupIterations
  );
  return {
    platform: client.platform,
    workload: "aggregation_groupby",
    stats: computeLatencyStats(samplesMs, errorCount),
  };
}

function sampleRandomIds(nodes: GraphNode[], sampleSize: number): string[] {
  const shuffled = [...nodes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(sampleSize, nodes.length)).map((n) => n.id);
}