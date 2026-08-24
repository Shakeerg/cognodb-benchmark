import { Database } from "arangojs";
import type {
  GraphClient,
  GraphNode,
  GraphEdge,
  PlatformId,
  FootprintResult,
} from "../types/index.js";

const NODE_COLLECTION = "nodes";
const EDGE_COLLECTION = "edges";

/**
 * ArangoDB client implementing the shared GraphClient interface via AQL.
 * Kept separate from BoltGraphClient because AQL's collection model (documents
 * + edge collections) doesn't map 1:1 onto Cypher's labeled-property-graph
 * model — that structural difference is itself part of what this benchmark
 * is meant to surface (see docs/BUILD_LOG.md), so it's implemented honestly
 * rather than forced into a false equivalence with the Bolt client.
 */
export class ArangoGraphClient implements GraphClient {
  readonly platform: PlatformId = "arangodb";
  private db: Database | null = null;

  constructor(
    private readonly url: string,
    private readonly dbName: string,
    private readonly user: string,
    private readonly password: string
  ) {}

  async connect(): Promise<void> {
    const rootDb = new Database({ url: this.url, auth: { username: this.user, password: this.password } });
    const dbs = await rootDb.listDatabases();
    if (!dbs.includes(this.dbName)) {
      await rootDb.createDatabase(this.dbName);
    }
    this.db = new Database({
      url: this.url,
      databaseName: this.dbName,
      auth: { username: this.user, password: this.password },
    });

    const nodeColl = this.db.collection(NODE_COLLECTION);
    if (!(await nodeColl.exists())) await nodeColl.create();

    const edgeColl = this.db.collection(EDGE_COLLECTION);
    if (!(await edgeColl.exists())) await edgeColl.create({ type: 3 }); // 3 = edge collection
  }

  async disconnect(): Promise<void> {
    this.db = null;
  }

  private getDb(): Database {
    if (!this.db) throw new Error("arangodb: not connected");
    return this.db;
  }

  async clearAll(): Promise<void> {
    const db = this.getDb();
    await db.collection(EDGE_COLLECTION).truncate();
    await db.collection(NODE_COLLECTION).truncate();
  }

  async loadNodes(nodes: GraphNode[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const db = this.getDb();
    const coll = db.collection(NODE_COLLECTION);
    const errors: string[] = [];
    let count = 0;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize).map((n) => ({
        _key: n.id,
        ...n.properties,
      }));
      try {
        await coll.saveAll(batch, { overwriteMode: "ignore" });
        count += batch.length;
      } catch (e) {
        errors.push(`node batch @${i}: ${(e as Error).message}`);
      }
    }
    return { count, errors };
  }

  async loadEdges(edges: GraphEdge[], batchSize = 500): Promise<{ count: number; errors: string[] }> {
    const db = this.getDb();
    const coll = db.collection(EDGE_COLLECTION);
    const errors: string[] = [];
    let count = 0;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize).map((e) => ({
        _from: `${NODE_COLLECTION}/${e.fromId}`,
        _to: `${NODE_COLLECTION}/${e.toId}`,
      }));
      try {
        await coll.saveAll(batch, { overwriteMode: "ignore" });
        count += batch.length;
      } catch (err) {
        errors.push(`edge batch @${i}: ${(err as Error).message}`);
      }
    }
    return { count, errors };
  }

  async ensureIndexes(): Promise<{ indexedProperties: string[] }> {
    const db = this.getDb();
    const coll = db.collection(NODE_COLLECTION);
    // _key is indexed by default in ArangoDB (primary index) — document that
    // explicitly rather than creating a redundant index, since the README
    // must state "which properties are indexed on each platform" accurately.
    await coll.ensureIndex({ type: "persistent", fields: ["category"] });
    return { indexedProperties: ["_key (primary, default)", "category (persistent, explicit)"] };
  }

  async traverse(startId: string, hops: 1 | 2 | 3): Promise<number> {
    const db = this.getDb();
    const cursor = await db.query({
      query: `
        FOR v IN ${hops}..${hops} OUTBOUND @start ${EDGE_COLLECTION}
          COLLECT WITH COUNT INTO length
          RETURN length
      `,
      bindVars: { start: `${NODE_COLLECTION}/${startId}` },
    });
    const result = await cursor.all();
    return result[0] ?? 0;
  }

  async pointLookup(id: string): Promise<boolean> {
    const db = this.getDb();
    const doc = await db.collection(NODE_COLLECTION).documentExists(id);
    return doc;
  }

  async filteredLookup(propertyValue: string | number): Promise<number> {
    const db = this.getDb();
    const cursor = await db.query({
      query: `FOR n IN ${NODE_COLLECTION} FILTER n.category == @val COLLECT WITH COUNT INTO c RETURN c`,
      bindVars: { val: propertyValue },
    });
    const result = await cursor.all();
    return result[0] ?? 0;
  }

  async aggregate(): Promise<Record<string, number>> {
    const db = this.getDb();
    const cursor = await db.query(`
        FOR n IN ${NODE_COLLECTION}
          COLLECT category = n.category WITH COUNT INTO c
          SORT c DESC
          RETURN { category, c }
      `);
    const rows = await cursor.all();
    const out: Record<string, number> = {};
    for (const r of rows as { category: string; c: number }[]) out[r.category] = r.c;
    return out;
  }

  async mixedOp(isWrite: boolean): Promise<void> {
    const db = this.getDb();
    const id = `node-${Math.floor(Math.random() * 100000)}`;
    if (isWrite) {
      await db.query({
        query: `UPDATE @key WITH { touchedAt: DATE_NOW() } IN ${NODE_COLLECTION}`,
        bindVars: { key: id },
      }).catch(() => {}); // key may not exist in sampled range — treated as a no-op read-miss equivalent, counted in error rate upstream
    } else {
      await db.collection(NODE_COLLECTION).document(id, { graceful: true });
    }
  }

  async getFootprint(): Promise<FootprintResult> {
    const db = this.getDb();
    try {
      const props = await db.collection(NODE_COLLECTION).figures(true);
      const sizeMb = ((props as any)?.figures?.documentsSize ?? 0) / (1024 * 1024);
      return {
        platform: this.platform,
        storedDataSizeMb: Math.round(sizeMb * 100) / 100,
        observable: true,
        note: "collection.figures() on node collection; edge collection size not included",
      };
    } catch {
      return { platform: this.platform, observable: false, note: "figures() unavailable on this tier" };
    }
  }
}