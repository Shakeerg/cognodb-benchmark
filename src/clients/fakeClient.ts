import type {
  GraphClient,
  GraphNode,
  GraphEdge,
  PlatformId,
  FootprintResult,
} from "../types/index.js";

/**
 * In-memory GraphClient implementation used ONLY for dry-run testing the
 * harness/orchestration pipeline (load runner, workload timing, percentile
 * math, mixed-workload concurrency, report generation) without a real
 * database connection.
 *
 * NOT one of the 5 benchmarked platforms — never referenced from
 * clients/factory.ts or config/platforms.ts, so it can't accidentally end up
 * in real results. Exists purely because this build environment cannot reach
 * any of the real platforms' networks (see docs/BUILD_LOG.md).
 */
export class FakeGraphClient implements GraphClient {
  readonly platform: PlatformId;
  private nodes = new Map<string, GraphNode>();
  private adjacency = new Map<string, Set<string>>();
  private artificialLatencyMs: number;

  constructor(platform: PlatformId, artificialLatencyMs = 2) {
    this.platform = platform;
    this.artificialLatencyMs = artificialLatencyMs;
  }

  private async delay() {
    // Small jittered delay so timing/percentile code has non-zero, non-uniform
    // samples to work with during dry-run testing.
    const jitter = Math.random() * this.artificialLatencyMs;
    await new Promise((r) => setTimeout(r, jitter));
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async clearAll(): Promise<void> {
    this.nodes.clear();
    this.adjacency.clear();
  }

  async loadNodes(nodes: GraphNode[]): Promise<{ count: number; errors: string[] }> {
    for (const n of nodes) {
      this.nodes.set(n.id, n);
      if (!this.adjacency.has(n.id)) this.adjacency.set(n.id, new Set());
    }
    return { count: nodes.length, errors: [] };
  }

  async loadEdges(edges: GraphEdge[]): Promise<{ count: number; errors: string[] }> {
    let count = 0;
    const errors: string[] = [];
    for (const e of edges) {
      if (!this.nodes.has(e.fromId) || !this.nodes.has(e.toId)) {
        errors.push(`edge references missing node: ${e.fromId}->${e.toId}`);
        continue;
      }
      this.adjacency.get(e.fromId)!.add(e.toId);
      count++;
    }
    return { count, errors };
  }

  async ensureIndexes(): Promise<{ indexedProperties: string[] }> {
    return { indexedProperties: ["extId (in-memory Map, always O(1))"] };
  }

  async traverse(startId: string, hops: 1 | 2 | 3): Promise<number> {
    await this.delay();
    let frontier = new Set<string>([startId]);
    const visited = new Set<string>();
    for (let h = 0; h < hops; h++) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const neighbor of this.adjacency.get(id) ?? []) {
          if (!visited.has(neighbor)) {
            next.add(neighbor);
            visited.add(neighbor);
          }
        }
      }
      frontier = next;
    }
    return visited.size;
  }

  async pointLookup(id: string): Promise<boolean> {
    await this.delay();
    return this.nodes.has(id);
  }

  async filteredLookup(propertyValue: string | number): Promise<number> {
    await this.delay();
    let count = 0;
    for (const n of this.nodes.values()) {
      if (n.properties.category === propertyValue) count++;
    }
    return count;
  }

  async aggregate(): Promise<Record<string, number>> {
    await this.delay();
    const out: Record<string, number> = {};
    for (const n of this.nodes.values()) {
      const cat = String(n.properties.category ?? "unknown");
      out[cat] = (out[cat] ?? 0) + 1;
    }
    return out;
  }

  async mixedOp(_isWrite: boolean): Promise<void> {
    await this.delay();
  }

  async getFootprint(): Promise<FootprintResult> {
    return {
      platform: this.platform,
      observable: true,
      storedDataSizeMb: Math.round((this.nodes.size * 0.001 + this.adjacency.size * 0.0005) * 100) / 100,
      note: "estimated from in-memory Map size — dry-run only, not a real footprint metric",
    };
  }
}
