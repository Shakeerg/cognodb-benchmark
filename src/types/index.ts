/**
 * Shared types used across all platform clients, workloads, and the harness.
 * Keeping these in one place is what lets the same workload code run against
 * five structurally different databases (Bolt / AQL / Gremlin).
 */

export type PlatformId = "cognodb" | "neo4j_aura" | "memgraph" | "arangodb" | "janusgraph";

export interface PlatformSpec {
  id: PlatformId;
  displayName: string;
  queryLanguage: "Cypher" | "AQL" | "Gremlin";
  tier: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  hostingNote: string; // e.g. "managed free tier" or "self-hosted, Docker-capped to match CognoDB free tier"
  region?: string;
}

/** A single node to be loaded, in a platform-neutral shape. */
export interface GraphNode {
  id: string; // stable external id from the source dataset
  label: string; // e.g. "Person"
  properties: Record<string, string | number | boolean>;
}

/** A single relationship to be loaded, in a platform-neutral shape. */
export interface GraphEdge {
  fromId: string;
  toId: string;
  type: string; // e.g. "FRIEND"
  properties?: Record<string, string | number | boolean>;
}

export interface LoadResult {
  platform: PlatformId;
  nodesLoaded: number;
  edgesLoaded: number;
  wallClockMs: number;
  nodesPerSec: number;
  edgesPerSec: number;
  errors: string[];
}

export interface LatencyStats {
  n: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  errorCount: number;
}

export interface WorkloadResult {
  platform: PlatformId;
  workload: string; // e.g. "traversal_1hop", "point_lookup", "aggregation_count"
  stats: LatencyStats;
  notes?: string;
}

export interface MixedWorkloadResult {
  platform: PlatformId;
  concurrency: number;
  readWriteMix: string; // e.g. "80/20"
  durationSec: number;
  totalOps: number;
  throughputQps: number;
  errorCount: number;
  errorRate: number;
}

export interface FootprintResult {
  platform: PlatformId;
  storedDataSizeMb?: number;
  memoryUsageMb?: number;
  observable: boolean;
  note: string;
}

/**
 * Uniform interface every platform client must implement.
 * Workload code is written once against this interface — never against a
 * platform-specific driver directly — so "same logical queries everywhere"
 * is enforced by the type system, not just documented in prose.
 */
export interface GraphClient {
  readonly platform: PlatformId;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Wipe the working dataset (used before a clean load). */
  clearAll(): Promise<void>;

  /** Bulk-load nodes. Implementation decides best batching strategy per platform. */
  loadNodes(nodes: GraphNode[], batchSize?: number): Promise<{ count: number; errors: string[] }>;

  /** Bulk-load edges. */
  loadEdges(edges: GraphEdge[], batchSize?: number): Promise<{ count: number; errors: string[] }>;

  /** Ensure indexes exist on the id property used for lookups/traversals. */
  ensureIndexes(): Promise<{ indexedProperties: string[] }>;

  /** N-hop traversal from a start node id. Returns count of nodes reached (for correctness parity, not just timing). */
  traverse(startId: string, hops: 1 | 2 | 3): Promise<number>;

  /** Point lookup by external id (uses index). */
  pointLookup(id: string): Promise<boolean>;

  /** Filtered/indexed lookup by a property predicate. */
  filteredLookup(propertyValue: string | number): Promise<number>;

  /** Aggregation: count grouped by label/relationship type. */
  aggregate(): Promise<Record<string, number>>;

  /** Single mixed-workload operation: randomly a read or a write, used under concurrency. */
  mixedOp(isWrite: boolean): Promise<void>;

  /** Best-effort footprint reporting; return observable:false if the platform doesn't expose it. */
  getFootprint(): Promise<FootprintResult>;
}