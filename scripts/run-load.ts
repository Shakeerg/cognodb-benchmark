/**
 * Loads the prepared dataset (data/nodes.json, data/edges.json) into one or
 * more platforms and writes load results to results/load-results.json.
 *
 * Usage:
 *   npx tsx scripts/run-load.ts                 # all platforms
 *   npx tsx scripts/run-load.ts --platform=cognodb
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { GraphNode, GraphEdge, LoadResult, PlatformId } from "../src/types/index.js";
import { ALL_PLATFORMS, createClient } from "../src/clients/factory.js";
import { runLoad } from "../src/harness/loadRunner.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const platformArg = args.find((a) => a.startsWith("--platform="));
  const platform = platformArg ? (platformArg.split("=")[1] as PlatformId) : undefined;
  return { platform };
}

async function main() {
  if (!existsSync("data/nodes.json") || !existsSync("data/edges.json")) {
    throw new Error("Run `npm run prepare:dataset` first — data/nodes.json or data/edges.json missing.");
  }
  const nodes: GraphNode[] = JSON.parse(readFileSync("data/nodes.json", "utf-8"));
  const edges: GraphEdge[] = JSON.parse(readFileSync("data/edges.json", "utf-8"));
  console.log(`Loaded dataset from disk: ${nodes.length} nodes, ${edges.length} edges.`);

  const { platform } = parseArgs();
  const platforms = platform ? [platform] : ALL_PLATFORMS;

  const results: LoadResult[] = [];
  for (const p of platforms) {
    console.log(`\n=== Loading into ${p} ===`);
    const client = createClient(p);
    try {
      await client.connect();
      const result = await runLoad(client, nodes, edges);
      results.push(result);
      console.log(
        `${p}: ${result.nodesLoaded} nodes (${result.nodesPerSec}/s), ` +
          `${result.edgesLoaded} edges (${result.edgesPerSec}/s), ` +
          `${result.wallClockMs}ms wall-clock, ${result.errors.length} errors`
      );
      if (result.errors.length > 0) {
        console.warn(`  First error: ${result.errors[0]}`);
      }
    } catch (err) {
      console.error(`${p}: FAILED — ${(err as Error).message}`);
      results.push({
        platform: p,
        nodesLoaded: 0,
        edgesLoaded: 0,
        wallClockMs: 0,
        nodesPerSec: 0,
        edgesPerSec: 0,
        errors: [`connection/load failure: ${(err as Error).message}`],
      });
    } finally {
      await client.disconnect().catch(() => {});
    }
  }

  mkdirSync("results", { recursive: true });

  // Merge with any existing results rather than overwriting, so running
  // --platform=X for each platform in turn doesn't wipe out prior runs.
  // Keyed by platform id: a re-run of the same platform replaces just its
  // own entry, everything else is preserved.
  let existing: LoadResult[] = [];
  if (existsSync("results/load-results.json")) {
    try {
      existing = JSON.parse(readFileSync("results/load-results.json", "utf-8"));
    } catch {
      existing = [];
    }
  }
  const merged = new Map<PlatformId, LoadResult>();
  for (const r of existing) merged.set(r.platform, r);
  for (const r of results) merged.set(r.platform, r);

  writeFileSync("results/load-results.json", JSON.stringify(Array.from(merged.values()), null, 2));
  console.log("\nWrote results/load-results.json (merged with prior results)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
