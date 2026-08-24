import type { GraphClient, GraphNode, GraphEdge, LoadResult } from "../types/index.js";
import { nowMs } from "../utils/stats.js";

export async function runLoad(
  client: GraphClient,
  nodes: GraphNode[],
  edges: GraphEdge[],
  batchSize = 500
): Promise<LoadResult> {
  const errors: string[] = [];

  await client.clearAll();

  const start = nowMs();
  const nodeResult = await client.loadNodes(nodes, batchSize);
  errors.push(...nodeResult.errors);

  await client.ensureIndexes();

  const edgeResult = await client.loadEdges(edges, batchSize);
  errors.push(...edgeResult.errors);
  const wallClockMs = nowMs() - start;

  const wallClockSec = wallClockMs / 1000;
  return {
    platform: client.platform,
    nodesLoaded: nodeResult.count,
    edgesLoaded: edgeResult.count,
    wallClockMs: Math.round(wallClockMs),
    nodesPerSec: wallClockSec > 0 ? Math.round(nodeResult.count / wallClockSec) : 0,
    edgesPerSec: wallClockSec > 0 ? Math.round(edgeResult.count / wallClockSec) : 0,
    errors,
  };
}