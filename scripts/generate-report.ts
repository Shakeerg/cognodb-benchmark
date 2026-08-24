/**
 * Reads results/*.json and emits results/REPORT.md — markdown tables ready
 * to paste into the README's results section. Kept as a separate generated
 * file (not hand-edited) so results can never silently drift from what the
 * benchmark runs actually produced.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type {
  LoadResult,
  WorkloadResult,
  MixedWorkloadResult,
  FootprintResult,
  PlatformId,
} from "../src/types/index.js";
import { PLATFORM_SPECS } from "../src/config/platforms.js";

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function platformName(id: PlatformId): string {
  return PLATFORM_SPECS[id]?.displayName ?? id;
}

function specsTable(): string {
  const rows = Object.values(PLATFORM_SPECS)
    .map(
      (s) =>
        `| ${s.displayName} | ${s.queryLanguage} | ${s.tier} | ${s.vcpu} | ${s.ramMb} | ${s.diskGb} | ${s.hostingNote} |`
    )
    .join("\n");
  return (
    `| Platform | Query Language | Tier | vCPU | RAM (MB) | Disk (GB) | Hosting |\n` +
    `|---|---|---|---|---|---|---|\n${rows}`
  );
}

function loadTable(results: LoadResult[]): string {
  const rows = results
    .map(
      (r) =>
        `| ${platformName(r.platform)} | ${r.nodesLoaded} | ${r.nodesPerSec}/s | ${r.edgesLoaded} | ${r.edgesPerSec}/s | ${r.wallClockMs}ms | ${r.errors.length} |`
    )
    .join("\n");
  return (
    `| Platform | Nodes Loaded | Nodes/sec | Edges Loaded | Edges/sec | Wall-clock | Errors |\n` +
    `|---|---|---|---|---|---|---|\n${rows}`
  );
}

function workloadTable(results: WorkloadResult[], workloadName: string): string {
  const filtered = results.filter((r) => r.workload === workloadName);
  const rows = filtered
    .map(
      (r) =>
        `| ${platformName(r.platform)} | ${r.stats.n} | ${r.stats.p50Ms} | ${r.stats.p95Ms} | ${r.stats.p99Ms} | ${r.stats.meanMs} | ${r.stats.errorCount} |`
    )
    .join("\n");
  return (
    `| Platform | N | p50 (ms) | p95 (ms) | p99 (ms) | mean (ms) | Errors |\n` +
    `|---|---|---|---|---|---|---|\n${rows}`
  );
}

function mixedTable(results: MixedWorkloadResult[]): string {
  const rows = results
    .map(
      (r) =>
        `| ${platformName(r.platform)} | ${r.concurrency} | ${r.readWriteMix} | ${r.throughputQps} | ${r.totalOps} | ${r.errorRate}% |`
    )
    .join("\n");
  return (
    `| Platform | Concurrency | Read/Write Mix | Throughput (qps) | Total Ops | Error Rate |\n` +
    `|---|---|---|---|---|---|\n${rows}`
  );
}

function footprintTable(results: FootprintResult[]): string {
  const rows = results
    .map(
      (r) =>
        `| ${platformName(r.platform)} | ${r.observable ? "yes" : "no"} | ${r.storedDataSizeMb ?? "—"} | ${r.memoryUsageMb ?? "—"} | ${r.note} |`
    )
    .join("\n");
  return (
    `| Platform | Observable | Data Size (MB) | Memory (MB) | Note |\n` +
    `|---|---|---|---|---|\n${rows}`
  );
}

function main() {
  const loadResults = readJson<LoadResult[]>("results/load-results.json") ?? [];
  const workloadResults = readJson<WorkloadResult[]>("results/workload-results.json") ?? [];
  const mixedResults = readJson<MixedWorkloadResult[]>("results/mixed-workload-results.json") ?? [];
  const footprintResults = readJson<FootprintResult[]>("results/footprint-results.json") ?? [];
  const manifest = readJson<Record<string, unknown>>("data/dataset-manifest.json");

  let out = `# Benchmark Results\n\n`;
  out += `_Generated ${new Date().toISOString()} by scripts/generate-report.ts — do not hand-edit, re-run the pipeline instead._\n\n`;

  if (manifest) {
    out += `## Dataset\n\n`;
    out += "```json\n" + JSON.stringify(manifest, null, 2) + "\n```\n\n";
    if ((manifest as any).warning) {
      out += `> ⚠️ **${(manifest as any).warning}**\n\n`;
    }
  }

  out += `## Platform Specs\n\n${specsTable()}\n\n`;

  if (loadResults.length) {
    out += `## Data Loading\n\n${loadTable(loadResults)}\n\n`;
  }

  const traversalWorkloads = ["traversal_1hop", "traversal_2hop", "traversal_3hop"];
  if (workloadResults.some((r) => traversalWorkloads.includes(r.workload))) {
    out += `## Traversals\n\n`;
    for (const w of traversalWorkloads) {
      out += `### ${w}\n\n${workloadTable(workloadResults, w)}\n\n`;
    }
  }

  if (workloadResults.some((r) => r.workload === "point_lookup" || r.workload === "filtered_lookup_indexed")) {
    out += `## Lookups\n\n`;
    out += `### Point lookup\n\n${workloadTable(workloadResults, "point_lookup")}\n\n`;
    out += `### Filtered/indexed lookup\n\n${workloadTable(workloadResults, "filtered_lookup_indexed")}\n\n`;
  }

  if (workloadResults.some((r) => r.workload === "aggregation_groupby")) {
    out += `## Aggregations\n\n${workloadTable(workloadResults, "aggregation_groupby")}\n\n`;
  }

  if (mixedResults.length) {
    out += `## Mixed Read/Write Workload\n\n${mixedTable(mixedResults)}\n\n`;
  }

  if (footprintResults.length) {
    out += `## Footprint\n\n${footprintTable(footprintResults)}\n\n`;
  }

  mkdirSync("results", { recursive: true });
  writeFileSync("results/REPORT.md", out);
  console.log("Wrote results/REPORT.md");
}

main();