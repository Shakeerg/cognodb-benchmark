import type { GraphClient, PlatformId } from "../types/index.js";
import { BoltGraphClient } from "./boltClient.js";
import { ArangoGraphClient } from "./arangoClient.js";
import { JanusGraphClient } from "./janusgraphClient.js";
import { env } from "../config/env.js";

// JanusGraph is intentionally excluded from ALL_PLATFORMS (the default set
// run when no --platform flag is given). It is NOT broken code — the client
// is fully implemented and DID successfully connect and query — but it
// could not complete a full data load within CognoDB's 0.5 vCPU / 256MB
// free-tier envelope: it required a WSL2 memory ceiling fix just to boot,
// then needed several GB of RAM (OOM-killed repeatedly below that), and even
// after that, query evaluation timed out under the 0.5 vCPU constraint on an
// operation as trivial as clearing an empty graph. This is a genuine,
// evidenced fairness/methodology finding — see docs/BUILD_LOG.md and the
// README caveats section — not a bug being hidden. Run it explicitly with
// `--platform=janusgraph` if you want to reproduce the attempt.
export const ALL_PLATFORMS: PlatformId[] = [
  "cognodb",
  "neo4j_aura",
  "memgraph",
  "arangodb",
];

export const ATTEMPTED_BUT_EXCLUDED_PLATFORMS: PlatformId[] = ["janusgraph"];

export function createClient(platform: PlatformId): GraphClient {
  switch (platform) {
    case "cognodb":
      return new BoltGraphClient(
        "cognodb",
        env.cognodb.uri(),
        env.cognodb.user(),
        env.cognodb.password()
      );
    case "neo4j_aura":
      return new BoltGraphClient(
        "neo4j_aura",
        env.neo4jAura.uri(),
        env.neo4jAura.user(),
        env.neo4jAura.password()
      );
    case "memgraph":
      return new BoltGraphClient(
        "memgraph",
        env.memgraph.uri(),
        env.memgraph.user(),
        env.memgraph.password()
      );
    case "arangodb":
      return new ArangoGraphClient(
        env.arangodb.url(),
        env.arangodb.db(),
        env.arangodb.user(),
        env.arangodb.password()
      );
    case "janusgraph":
      return new JanusGraphClient(env.janusgraph.url());
    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unhandled platform: ${_exhaustive}`);
    }
  }
}
