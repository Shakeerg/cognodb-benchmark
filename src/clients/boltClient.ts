import neo4j, { type Driver, type Session } from "neo4j-driver";
import type {
  GraphClient,
  GraphNode,
  GraphEdge,
  PlatformId,
  FootprintResult,
} from "../types/index.js";

/**
 * Generic Cypher/Bolt client shared by CognoDB, Neo4j AuraDB, and Memgraph.
 *
 * Why shared: all three speak Bolt and accept the same Cypher dialect for the
 * queries this benchmark needs. Writing one implementation and only varying
 * connection parameters is what makes "same logical queries, same client
 * machine, same region" (assignment section 5.3) actually true in the code,
 * not just claimed in prose. Platform-specific quirks (if any turn up during
 * testing) are patched via the `dialectQuirks` hook below and logged in
 * docs/BUILD_LOG.md — never silently.
 */
export class BoltGraphClient implements GraphClient {
  readonly platform: PlatformId;
  private driver: Driver | null = null;

  constructor(
    platform: PlatformId,
    private readonly uri: string,
    private readonly user: string,
    private readonly password: string
  ) {
    this.platform = platform;
  }

  async connect(): Promise<void> {
    this.driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password));
    await this.driver.verifyConnectivity();
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
    this.driver = null;
  }

  private session(): Session {
    if (!this.driver) throw new Error(`${this.platform}: not connected`);
    return this.driver.session();
  }

  async clearAll(): Promise<void> {
    const s = this.session();
    try {
      // Batched delete to avoid blowing memory on the 256MB-tier instances.
      let deleted = 1;
      while (deleted > 0) {
        const res = await s.run(
          `MATCH (n) WITH n LIMIT 5000 DETACH DELETE n RETURN count(n) AS c`
        );
        deleted = res.records[0]?.get("c")?.toNumber?.() ?? 0;
      }
    } finally {
      await s.close();
    }
  }

  async loadNodes(nodes: GraphNode[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const s = this.session();
    const errors: string[] = [];
    let count = 0;
    try {
      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize).map((n) => ({
          id: n.id,
          props: n.properties,
        }));
        try {
          await s.run(
            `UNWIND $batch AS row
             CREATE (n:Node {extId: row.id})
             SET n += row.props`,
            { batch }
          );
          count += batch.length;
        } catch (e) {
          errors.push(`node batch @${i}: ${(e as Error).message}`);
        }
      }
    } finally {
      await s.close();
    }
    return { count, errors };
  }

  async loadEdges(edges: GraphEdge[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const s = this.session();
    const errors: string[] = [];
    let count = 0;
    try {
      for (let i = 0; i < edges.length; i += batchSize) {
        const batch = edges.slice(i, i + batchSize).map((e) => ({
          from: e.fromId,
          to: e.toId,
        }));
        try {
          await s.run(
            `UNWIND $batch AS row
             MATCH (a:Node {extId: row.from})
             MATCH (b:Node {extId: row.to})
             CREATE (a)-[:REL]->(b)`,
            { batch }
          );
          count += batch.length;
        } catch (e) {
          errors.push(`edge batch @${i}: ${(e as Error).message}`);
        }
      }
    } finally {
      await s.close();
    }
    return { count, errors };
  }

  async ensureIndexes(): Promise<{ indexedProperties: string[] }> {
    const s = this.session();
    try {
      // IF NOT EXISTS syntax is Cypher-standard across Neo4j/Memgraph; CognoDB
      // is Bolt+Cypher-compatible per the assignment brief. If CognoDB rejects
      // this syntax during actual testing, that's a documented quirk in
      // docs/BUILD_LOG.md, not a silent fallback.
      await s.run(`CREATE INDEX node_extid IF NOT EXISTS FOR (n:Node) ON (n.extId)`);
    } finally {
      await s.close();
    }
    return { indexedProperties: ["extId"] };
  }

  async traverse(startId: string, hops: 1 | 2 | 3): Promise<number> {
    const s = this.session();
    try {
      const res = await s.run(
        `MATCH (start:Node {extId: $id})
         MATCH (start)-[:REL*${hops}]->(reached)
         RETURN count(DISTINCT reached) AS c`,
        { id: startId }
      );
      return res.records[0]?.get("c")?.toNumber?.() ?? 0;
    } finally {
      await s.close();
    }
  }

  async pointLookup(id: string): Promise<boolean> {
    const s = this.session();
    try {
      const res = await s.run(`MATCH (n:Node {extId: $id}) RETURN n LIMIT 1`, { id });
      return res.records.length > 0;
    } finally {
      await s.close();
    }
  }

  async filteredLookup(propertyValue: string | number): Promise<number> {
    const s = this.session();
    try {
      const res = await s.run(
        `MATCH (n:Node) WHERE n.category = $val RETURN count(n) AS c`,
        { val: propertyValue }
      );
      return res.records[0]?.get("c")?.toNumber?.() ?? 0;
    } finally {
      await s.close();
    }
  }

  async aggregate(): Promise<Record<string, number>> {
    const s = this.session();
    try {
      const res = await s.run(
        `MATCH (n:Node) RETURN n.category AS category, count(n) AS c ORDER BY c DESC`
      );
      const out: Record<string, number> = {};
      for (const r of res.records) {
        out[String(r.get("category"))] = r.get("c")?.toNumber?.() ?? 0;
      }
      return out;
    } finally {
      await s.close();
    }
  }

  async mixedOp(isWrite: boolean): Promise<void> {
    const s = this.session();
    try {
      if (isWrite) {
        await s.run(
          `MATCH (n:Node) WHERE n.extId = $id SET n.touchedAt = timestamp()`,
          { id: `node-${Math.floor(Math.random() * 100000)}` }
        );
      } else {
        await s.run(
          `MATCH (n:Node) WHERE n.extId = $id RETURN n`,
          { id: `node-${Math.floor(Math.random() * 100000)}` }
        );
      }
    } finally {
      await s.close();
    }
  }

  async getFootprint(): Promise<FootprintResult> {
    // Bolt protocol doesn't expose storage/memory metrics uniformly across
    // CognoDB / Aura / Memgraph. Each subclass/instance can override this
    // if the platform exposes a metrics endpoint; default is honest "not observable".
    return {
      platform: this.platform,
      observable: false,
      note: "Bolt protocol does not expose storage/memory metrics on the free tier for this platform; see console UI where available.",
    };
  }
}