import type { LatencyStats } from "../types/index.js";

/**
 * Nearest-rank percentile. Simple and defensible for benchmark reporting —
 * documented here rather than pulling in a stats library, since the method
 * itself is a methodology detail worth being explicit about in the README.
 */
function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return NaN;
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.min(Math.max(idx, 0), sortedMs.length - 1)];
}

export function computeLatencyStats(samplesMs: number[], errorCount = 0): LatencyStats {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : NaN;
  return {
    n,
    p50Ms: round2(percentile(sorted, 50)),
    p95Ms: round2(percentile(sorted, 95)),
    p99Ms: round2(percentile(sorted, 99)),
    minMs: round2(sorted[0] ?? NaN),
    maxMs: round2(sorted[n - 1] ?? NaN),
    meanMs: round2(mean),
    errorCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** High-resolution timer helper. Returns elapsed ms. */
export function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}
