/**
 * Runs traversal, lookup, aggregation, mixed-workload, and footprint checks
 * against one or more already-loaded platforms. Requires run-load.ts to have
 * been run first (data must already exist on each platform).
 *
 * Usage:
 *   npx tsx scripts/run-benchmark.ts
 *   npx tsx scripts/run-benchmark.ts --platform=cognodb
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type {
  GraphNode,
  WorkloadResult,
  MixedWorkloadResult,
  FootprintResult,
  PlatformId,
} from "../src/types/index.js";
import { ALL_PLATFORMS, createClient } from "../src/clients/factory.js";
import { runTraversalWorkloads, runLookupWorkloads, runAggregationWorkload } from "../src/harness/workloadRunner.js";
import { runMixedWorkload } from "../src/harness/mixedWorkloadRunner.js";
import { env } from "../src/config/env.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const platformArg = args.find((a) => a.startsWith("--platform="));
  const platform = platformArg ? (platformArg.split("=")[1] as PlatformId) : undefined;
  return { platform };
}

async function main() {
  if (!existsSync("data/nodes.json")) {
    throw new Error("Run `npm run prepare:dataset` and `npm run load` first.");
  }
  const nodes: GraphNode[] = JSON.parse(readFileSync("data/nodes.json", "utf-8"));

  const { platform } = parseArgs();
  const platforms = platform ? [platform] : ALL_PLATFORMS;

  const iterations = env.bench.iterations();
  const warmup = env.bench.warmupIterations();
  const concurrencyLevels = env.bench.concurrencyLevels();
  const mixedDurationSec = env.bench.mixedDurationSec();
  const readWriteMix = env.bench.readWriteMix();

  console.log(
    `Config: ${iterations} iterations (${warmup} warm-up), concurrency levels [${concurrencyLevels.join(
      ", "
    )}], ${mixedDurationSec}s mixed runs, ${readWriteMix} read/write mix`
  );

  const workloadResults: WorkloadResult[] = [];
  const mixedResults: MixedWorkloadResult[] = [];
  const footprintResults: FootprintResult[] = [];

  for (const p of platforms) {
    console.log(`\n=== Benchmarking ${p} ===`);
    const client = createClient(p);
    try {
      await client.connect();

      const traversal = await runTraversalWorkloads(client, nodes, iterations, warmup);
      workloadResults.push(...traversal);
      for (const r of traversal) {
        console.log(`  ${r.workload}: p50=${r.stats.p50Ms}ms p95=${r.stats.p95Ms}ms errors=${r.stats.errorCount}`);
      }

      const lookups = await runLookupWorkloads(client, nodes, iterations, warmup);
      workloadResults.push(...lookups);
      for (const r of lookups) {
        console.log(`  ${r.workload}: p50=${r.stats.p50Ms}ms p95=${r.stats.p95Ms}ms errors=${r.stats.errorCount}`);
      }

      const agg = await runAggregationWorkload(client, iterations, warmup);
      workloadResults.push(agg);
      console.log(`  ${agg.workload}: p50=${agg.stats.p50Ms}ms p95=${agg.stats.p95Ms}ms errors=${agg.stats.errorCount}`);

      for (const c of concurrencyLevels) {
        const mixed = await runMixedWorkload(client, c, mixedDurationSec, readWriteMix);
        mixedResults.push(mixed);
        console.log(
          `  mixed@concurrency=${c}: ${mixed.throughputQps} qps, ${mixed.errorRate}% errors over ${mixed.durationSec}s`
        );
      }

      const footprint = await client.getFootprint();
      footprintResults.push(footprint);
      console.log(`  footprint: ${footprint.observable ? JSON.stringify(footprint) : "not observable"}`);
    } catch (err) {
      console.error(`${p}: FAILED — ${(err as Error).message}`);
    } finally {
      await client.disconnect().catch(() => {});
    }
  }

  mkdirSync("results", { recursive: true });
  writeFileSync("results/workload-results.json", JSON.stringify(workloadResults, null, 2));
  writeFileSync("results/mixed-workload-results.json", JSON.stringify(mixedResults, null, 2));
  writeFileSync("results/footprint-results.json", JSON.stringify(footprintResults, null, 2));
  console.log("\nWrote results/workload-results.json, mixed-workload-results.json, footprint-results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});