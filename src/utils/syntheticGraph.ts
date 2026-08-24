
import type { GraphNode, GraphEdge } from "../types/index.js";

/**
 * Deterministic (seeded) synthetic graph generator.
 *
 * Why this exists: the real dataset (SNAP soc-Pokec sample) needs to be
 * downloaded from an external host that isn't reachable from every dev
 * environment (see docs/BUILD_LOG.md — sandboxed build environment here has
 * restricted network egress). This generator lets the *entire* harness —
 * loaders, workloads, percentile math, report generation — be built and
 * smoke-tested end-to-end without waiting on real cloud accounts or a real
 * download. It is NOT a substitute for the real benchmark: the README will
 * state clearly that final published numbers come from the real SNAP sample,
 * not this generator.
 *
 * Graph model: simple preferential-attachment (Barabási–Albert-style) growth,
 * which gives a scale-free degree distribution similar in shape to real
 * social-network samples like soc-Pokec — good enough to exercise multi-hop
 * traversal, indexed lookup, and aggregation code paths realistically.
 */

// Minimal seeded PRNG (mulberry32) — deterministic across runs for reproducibility.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = ["alpha", "beta", "gamma", "delta", "epsilon"];

export function generateSyntheticGraph(
  targetNodeCount: number,
  avgDegree: number,
  seed = 42
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rand = mulberry32(seed);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const degree: number[] = [];

  const m = Math.max(1, Math.round(avgDegree / 2)); // edges added per new node (BA model)

  for (let i = 0; i < targetNodeCount; i++) {
    const id = `node-${i}`;
    nodes.push({
      id,
      label: "Node",
      properties: {
        category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
        score: Math.round(rand() * 1000),
      },
    });
    degree.push(0);

    if (i === 0) continue;

    // Preferential attachment: pick `m` distinct earlier nodes, weighted by degree+1.
    const targets = new Set<number>();
    const totalWeight = degree.slice(0, i).reduce((a, b) => a + b + 1, 0);
    let attempts = 0;
    while (targets.size < Math.min(m, i) && attempts < m * 20) {
      attempts++;
      let r = rand() * totalWeight;
      let chosen = 0;
      for (let j = 0; j < i; j++) {
        r -= degree[j] + 1;
        if (r <= 0) {
          chosen = j;
          break;
        }
      }
      if (chosen !== i) targets.add(chosen);
    }

    for (const t of targets) {
      edges.push({ fromId: id, toId: `node-${t}`, type: "REL" });
      degree[i]++;
      degree[t]++;
    }
  }

  return { nodes, edges };
}