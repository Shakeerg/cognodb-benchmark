import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  cognodb: {
    uri: () => required("COGNODB_URI"),
    user: () => required("COGNODB_USER"),
    password: () => required("COGNODB_PASSWORD"),
  },
  neo4jAura: {
    uri: () => required("NEO4J_AURA_URI"),
    user: () => required("NEO4J_AURA_USER"),
    password: () => required("NEO4J_AURA_PASSWORD"),
  },
  memgraph: {
    uri: () => optional("MEMGRAPH_URI", "bolt://localhost:7688"),
    user: () => optional("MEMGRAPH_USER", ""),
    password: () => optional("MEMGRAPH_PASSWORD", ""),
  },
  arangodb: {
    url: () => optional("ARANGODB_URL", "http://localhost:8529"),
    db: () => optional("ARANGODB_DB", "benchmark"),
    user: () => optional("ARANGODB_USER", "root"),
    password: () => optional("ARANGODB_PASSWORD", ""),
  },
  janusgraph: {
    url: () => optional("JANUSGRAPH_URL", "ws://localhost:8182/gremlin"),
  },
  bench: {
    iterations: () => Number(optional("BENCH_ITERATIONS", "100")),
    warmupIterations: () => Number(optional("BENCH_WARMUP_ITERATIONS", "20")),
    concurrencyLevels: () =>
      optional("BENCH_CONCURRENCY_LEVELS", "1,10,40")
        .split(",")
        .map((s) => Number(s.trim())),
    mixedDurationSec: () => Number(optional("BENCH_MIXED_DURATION_SEC", "30")),
    readWriteMix: () => optional("BENCH_READ_WRITE_MIX", "80/20"),
  },
};