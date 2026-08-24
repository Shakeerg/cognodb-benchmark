import gremlin from "gremlin";
import type {
  GraphClient,
  GraphNode,
  GraphEdge,
  PlatformId,
  FootprintResult,
} from "../types/index.js";

const { DriverRemoteConnection } = gremlin.driver;
const { statics: __ } = gremlin.process;
const P = gremlin.process.P;
const { traversal } = gremlin.process.AnonymousTraversalSource;

/**
 * JanusGraph client implementing the shared GraphClient interface via Gremlin.
 * Third distinct query paradigm in this benchmark (Cypher, AQL, Gremlin) —
 * deliberately chosen so the comparison isn't just "four Cypher databases
 * with different marketing pages."
 *
 * NOTE: the gremlin npm package's connection API changed between v3.4.x and
 * v3.5+ — older docs/examples show `new Graph().traversal().withRemote(conn)`,
 * but that pattern was removed. The current (v3.7.x, what this project pins)
 * API goes through `AnonymousTraversalSource.traversal().withRemote(conn)`
 * instead. Documented here because this exact mismatch caused a real runtime
 * failure ("withRemote is not a function") during testing — see docs/BUILD_LOG.md.
 */
export class JanusGraphClient implements GraphClient {
  readonly platform: PlatformId = "janusgraph";
  private connection: InstanceType<typeof DriverRemoteConnection> | null = null;
  private g: ReturnType<ReturnType<typeof traversal>["withRemote"]> | null = null;

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    this.connection = new DriverRemoteConnection(this.wsUrl, {});
    this.g = traversal().withRemote(this.connection);
  }

  async disconnect(): Promise<void> {
    await this.connection?.close();
    this.connection = null;
    this.g = null;
  }

  private traversal() {
    if (!this.g) throw new Error("janusgraph: not connected");
    return this.g;
  }

  async clearAll(): Promise<void> {
    await this.traversal().V().drop().iterate();
  }

  async loadNodes(nodes: GraphNode[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const g = this.traversal();
    const errors: string[] = [];
    let count = 0;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      for (const n of batch) {
        try {
          let t = g.addV("Node").property("extId", n.id);
          for (const [k, v] of Object.entries(n.properties)) {
            t = t.property(k, v as string | number | boolean);
          }
          await t.next();
          count++;
        } catch (e) {
          errors.push(`node ${n.id}: ${(e as Error).message}`);
        }
      }
    }
    return { count, errors };
  }

  async loadEdges(edges: GraphEdge[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const g = this.traversal();
    const errors: string[] = [];
    let count = 0;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);
      for (const e of batch) {
        try {
          await g
            .V()
            .has("extId", e.fromId)
            .as("a")
            .V()
            .has("extId", e.toId)
            .addE("REL")
            .from_("a")
            .next();
          count++;
        } catch (err) {
          errors.push(`edge ${e.fromId}->${e.toId}: ${(err as Error).message}`);
        }
      }
    }
    return { count, errors };
  }

  async ensureIndexes(): Promise<{ indexedProperties: string[] }> {
    // JanusGraph index creation is a schema/management-API operation
    // (JanusGraphManagement), not a Gremlin traversal — it must be run once
    // via the server's Groovy console or management API before load, not
    // through the driver at query time. Documented as a manual pre-step in
    // the README rather than faked here, since claiming it's Gremlin-driver-
    // automatable would be inaccurate.
    return { indexedProperties: ["extId (see README: manual JanusGraphManagement step required pre-load)"] };
  }

  async traverse(startId: string, hops: 1 | 2 | 3): Promise<number> {
    const g = this.traversal();
    let t = g.V().has("extId", startId);
    for (let i = 0; i < hops; i++) {
      t = t.out("REL");
    }
    const result = await t.dedup().count().next();
    return Number(result.value ?? 0);
  }

  async pointLookup(id: string): Promise<boolean> {
    const g = this.traversal();
    const result = await g.V().has("extId", id).hasNext();
    return Boolean(result);
  }

  async filteredLookup(propertyValue: string | number): Promise<number> {
    const g = this.traversal();
    const result = await g.V().has("category", P.eq(propertyValue)).count().next();
    return Number(result.value ?? 0);
  }

  async aggregate(): Promise<Record<string, number>> {
    const g = this.traversal();
    const result = await g.V().group().by("category").by(__.count()).next();
    const out: Record<string, number> = {};
    const map = result.value as Map<string, number> | undefined;
    if (map) for (const [k, v] of map.entries()) out[String(k)] = Number(v);
    return out;
  }

  async mixedOp(isWrite: boolean): Promise<void> {
    const g = this.traversal();
    const id = `node-${Math.floor(Math.random() * 100000)}`;
    // next() rejects/returns done:true when no match rather than throwing for
    // a genuine query error, but wrap defensively since a sampled id may not
    // exist in this run's id-space (counted as a read-miss, not a hard error).
    try {
      if (isWrite) {
        await g.V().has("extId", id).property("touchedAt", Date.now()).next();
      } else {
        await g.V().has("extId", id).next();
      }
    } catch {
      // no-op: treated as a miss, consistent with ArangoDB client's graceful lookup
    }
  }

  async getFootprint(): Promise<FootprintResult> {
    return {
      platform: this.platform,
      observable: false,
      note: "JanusGraph storage size depends on the pluggable storage backend (e.g. BerkeleyDB/Cassandra) — report the backend's own disk usage manually in README rather than inferring it via Gremlin.",
    };
  }
}
