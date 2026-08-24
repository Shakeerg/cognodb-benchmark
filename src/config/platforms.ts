import type { PlatformSpec } from "../types/index.js";

/**
 * Declared specs for every platform under test, filled in with the ACTUAL
 * values observed at signup/provisioning time (see docs/BUILD_LOG.md for
 * where any platform deviated from the CognoDB baseline and why).
 *
 * These numbers are what get printed verbatim in the README results table —
 * this file is the single source of truth so the README can't drift from
 * what was actually provisioned.
 */
export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  cognodb: {
    id: "cognodb",
    displayName: "CognoDB Cloud (c0 free tier)",
    queryLanguage: "Cypher",
    tier: "c0 free",
    vcpu: 0.5,
    ramMb: 256,
    diskGb: 1,
    hostingNote: "managed free tier",
  },
  neo4j_aura: {
    id: "neo4j_aura",
    displayName: "Neo4j AuraDB Free",
    queryLanguage: "Cypher",
    tier: "AuraDB Free",
    vcpu: 0.5, // TODO: confirm exact figure from Aura console at provisioning time
    ramMb: 256, // capped to match CognoDB even if Aura's free tier nominally offers more
    diskGb: 1,
    hostingNote: "managed free tier",
  },
  memgraph: {
    id: "memgraph",
    displayName: "Memgraph (self-hosted, Docker-capped)",
    queryLanguage: "Cypher",
    tier: "self-hosted, capped",
    vcpu: 0.5,
    ramMb: 256,
    diskGb: 1,
    hostingNote: "self-hosted via Docker, --cpus=0.5 --memory=256m to match CognoDB tier",
  },
  arangodb: {
    id: "arangodb",
    displayName: "ArangoDB (self-hosted, Docker-capped)",
    queryLanguage: "AQL",
    tier: "self-hosted, capped",
    vcpu: 0.5,
    ramMb: 256,
    diskGb: 1,
    hostingNote: "self-hosted via Docker, --cpus=0.5 --memory=256m to match CognoDB tier",
  },
  janusgraph: {
    id: "janusgraph",
    displayName: "JanusGraph (self-hosted, Docker-capped)",
    queryLanguage: "Gremlin",
    tier: "self-hosted, capped",
    vcpu: 0.5,
    ramMb: 256,
    diskGb: 1,
    hostingNote: "self-hosted via Docker, --cpus=0.5 --memory=256m to match CognoDB tier; JVM overhead flagged as a caveat",
  },
};

export function getPlatformSpec(id: string): PlatformSpec {
  const spec = PLATFORM_SPECS[id];
  if (!spec) throw new Error(`Unknown platform id: ${id}`);
  return spec;
}