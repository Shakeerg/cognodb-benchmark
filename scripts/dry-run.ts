/**
 * Dry-run: exercises load -> traversal/lookup/aggregation -> mixed workload
 * -> report generation end-to-end using FakeGraphClient, entirely in-memory.
 *
 * This is a development/CI smoke test, NOT a benchmark run. It exists to
 * prove the harness code itself is correct (timing, percentile math,
 * concurrency, report formatting) independent of any real database's
 * availability or network access. See docs/BUILD_LOG.md.
 *
 * Usage: npx tsx scripts/dry-run.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { GraphNode, GraphEdge } from "../src/types/index.js";
import { FakeGraphClient } from "../src/clients/fakeClient.js";
import { runLoad } from "../src/harness/loadRunner.js";
import { runTraversalWorkloads, runLookupWorkloads, runAggregationWorkload } from "../src/harness/workloadRunner.js";
import { runMixedWorkload } from "../src/harness/mixedWorkloadRunner.js";

async function main() {
  if (!existsSync("data/nodes.json")) {
    throw new Error("Run `npm run prepare:dataset` first.");
  }
  const nodes: GraphNode[] = JSON.parse(readFileSync("data/nodes.json", "utf-8"));
  const edges: GraphEdge[] = JSON.parse(readFileSync("data/edges.json", "utf-8"));

  console.log(`Dry-run against FakeGraphClient with ${nodes.length} nodes, ${edges.length} edges.\n`);

  const client = new FakeGraphClient("cognodb"); // platform id reused just to exercise report formatting; NOT a real CognoDB result
  await client.connect();

  console.log("--- Load ---");
  const loadResult = await runLoad(client, nodes, edges);
  console.log(loadResult);

  console.log("\n--- Traversal workloads (10 iterations, 2 warm-up, for speed) ---");
  const traversal = await runTraversalWorkloads(client, nodes, 10, 2, 50);
  console.log(traversal);

  console.log("\n--- Lookup workloads ---");
  const lookups = await runLookupWorkloads(client, nodes, 10, 2, 50);
  console.log(lookups);

  console.log("\n--- Aggregation ---");
  const agg = await runAggregationWorkload(client, 10, 2);
  console.log(agg);

  console.log("\n--- Mixed workload (concurrency=5, 2s) ---");
  const mixed = await runMixedWorkload(client, 5, 2, "80/20");
  console.log(mixed);

  console.log("\n--- Footprint ---");
  const footprint = await client.getFootprint();
  console.log(footprint);

  await client.disconnect();

  mkdirSync("results/dry-run", { recursive: true });
  writeFileSync("results/dry-run/load.json", JSON.stringify([loadResult], null, 2));
  writeFileSync("results/dry-run/workloads.json", JSON.stringify([...traversal, ...lookups, agg], null, 2));
  writeFileSync("results/dry-run/mixed.json", JSON.stringify([mixed], null, 2));
  writeFileSync("results/dry-run/footprint.json", JSON.stringify([footprint], null, 2));

  console.log("\nDry-run complete. Results written to results/dry-run/ (excluded from real report — smoke test only).");
}

main().catch((err) => {
  console.error("DRY RUN FAILED:", err);
  process.exit(1);
});