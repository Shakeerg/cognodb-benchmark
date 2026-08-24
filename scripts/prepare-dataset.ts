/**
 * Dataset preparation.
 *
 * Two modes:
 *   --source=synthetic   deterministic generated graph (default; works offline, for
 *                         pipeline dev/testing — see docs/BUILD_LOG.md for why this exists)
 *   --source=snap-pokec   downloads the real SNAP soc-Pokec relationships file, extracts
 *                         a connected subgraph sized to targetRelationships via BFS from
 *                         a random seed node (so multi-hop traversal queries have real
 *                         structure to walk, not a disconnected sample), and writes
 *                         platform-neutral GraphNode/GraphEdge JSON.
 *
 * Output: data/nodes.json, data/edges.json, data/dataset-manifest.json
 * (manifest records exact source, counts, and generation params for the README).
 */
import { writeFileSync, mkdirSync, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type { GraphNode, GraphEdge } from "../src/types/index.js";
import { generateSyntheticGraph } from "../src/utils/syntheticGraph.js";

const SNAP_URL = "https://snap.stanford.edu/data/soc-pokec-relationships.txt.gz";
const TARGET_RELATIONSHIPS = 200_000; // mid-point of the assignment's 100k-500k guidance
const RAW_GZ_PATH = "data/raw/soc-pokec-relationships.txt.gz";

function parseArgs() {
  const args = process.argv.slice(2);
  const sourceArg = args.find((a) => a.startsWith("--source="));
  const source = sourceArg ? sourceArg.split("=")[1] : "synthetic";
  return { source };
}

async function downloadSnapPokec(): Promise<void> {
  mkdirSync("data/raw", { recursive: true });
  if (existsSync(RAW_GZ_PATH)) {
    console.log(`Already downloaded: ${RAW_GZ_PATH}`);
    return;
  }
  console.log(`Downloading ${SNAP_URL} ...`);
  const res = await fetch(SNAP_URL);
  if (!res.ok || !res.body) {
    throw new Error(
      `Download failed (${res.status}). If this environment can't reach snap.stanford.edu, ` +
        `run this script from an unrestricted network, or use --source=synthetic for pipeline testing.`
    );
  }
  await pipeline(res.body as any, createWriteStream(RAW_GZ_PATH));
  console.log("Download complete.");
}

/**
 * Streams the (large, multi-GB uncompressed) edge list, does a BFS from a
 * random start node up to TARGET_RELATIONSHIPS edges, and returns the
 * induced subgraph. Streaming + BFS-bounded means we never load the full
 * 30M-edge file into memory at once.
 */
async function sampleConnectedSubgraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  // Pass 1: build adjacency lazily is not memory-safe for 30M edges either,
  // so instead: stream once, and for every line, keep the edge only if
  // at least one endpoint is already in our growing "frontier" set,
  // starting from a fixed seed node. This approximates BFS without an
  // upfront full adjacency index — documented tradeoff, see BUILD_LOG.
  const frontier = new Set<string>(["1"]); // soc-Pokec node ids are 1-indexed integers as strings
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>(frontier);

  const stream = createInterface({
    input: (await import("node:fs")).createReadStream(RAW_GZ_PATH).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    if (edges.length >= TARGET_RELATIONSHIPS) break;
    if (!line || line.startsWith("#")) continue;
    const [from, to] = line.split("\t");
    if (!from || !to) continue;

    if (frontier.has(from) || frontier.has(to)) {
      edges.push({ fromId: from, toId: to, type: "REL" });
      nodeIds.add(from);
      nodeIds.add(to);
      // Expand frontier modestly to keep the subgraph connected and walkable
      // at 3 hops, without letting it explode to the full graph's fan-out.
      if (frontier.size < 5000) {
        frontier.add(from);
        frontier.add(to);
      }
    }
  }

  const nodes: GraphNode[] = Array.from(nodeIds).map((id) => ({
    id,
    label: "Node",
    properties: {
      category: ["alpha", "beta", "gamma", "delta", "epsilon"][Number(id) % 5],
      score: Number(id) % 1000,
    },
  }));

  return { nodes, edges };
}

async function main() {
  const { source } = parseArgs();
  mkdirSync("data", { recursive: true });

  let nodes: GraphNode[];
  let edges: GraphEdge[];
  let manifest: Record<string, unknown>;

  if (source === "snap-pokec") {
    await downloadSnapPokec();
    const result = await sampleConnectedSubgraph();
    nodes = result.nodes;
    edges = result.edges;
    manifest = {
      source: "SNAP soc-Pokec (https://snap.stanford.edu/data/soc-Pokec.html)",
      sampleMethod:
        "Frontier-expansion connected sample from a fixed seed node, capped at " +
        `${TARGET_RELATIONSHIPS} relationships, streamed from the gzip without full in-memory adjacency`,
      nodeCount: nodes.length,
      relationshipCount: edges.length,
      generatedAt: new Date().toISOString(),
    };
  } else {
    console.log(
      "Using synthetic dataset (default). For the real benchmark, run with --source=snap-pokec " +
        "from a network-unrestricted environment. See docs/BUILD_LOG.md for why this default exists."
    );
    const targetNodes = 40_000; // tuned so avgDegree≈5 yields ~200k edges
    const result = generateSyntheticGraph(targetNodes, 5, 42);
    nodes = result.nodes;
    edges = result.edges;
    manifest = {
      source: "Synthetic (seeded Barabási–Albert-style generator, src/utils/syntheticGraph.ts)",
      sampleMethod: "N/A — generated, not sampled",
      seed: 42,
      nodeCount: nodes.length,
      relationshipCount: edges.length,
      generatedAt: new Date().toISOString(),
      warning:
        "NOT the real benchmark dataset. For submission, regenerate with --source=snap-pokec " +
        "and re-run the full pipeline before publishing results.",
    };
  }

  writeFileSync("data/nodes.json", JSON.stringify(nodes));
  writeFileSync("data/edges.json", JSON.stringify(edges));
  writeFileSync("data/dataset-manifest.json", JSON.stringify(manifest, null, 2));

  console.log(`Wrote ${nodes.length} nodes, ${edges.length} edges.`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});