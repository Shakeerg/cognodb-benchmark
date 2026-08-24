import "dotenv/config";
import neo4j from "neo4j-driver";

async function main() {
  const uri = process.env.COGNODB_URI;
  const user = process.env.COGNODB_USER;
  const password = process.env.COGNODB_PASSWORD;

  console.log("Testing CognoDB connection with:");
  console.log("  URI:", uri);
  console.log("  User:", user);
  console.log("  Password set:", password ? "yes (hidden)" : "NO — missing!");

  console.log("MISSING CHECK:", !uri || !user || !password);
  if (!uri || !user || !password) {
    console.error("Missing one or more required env vars. Check your .env file.");
    process.exit(1);
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    await driver.verifyConnectivity();
    console.log("SUCCESS: Connected to CognoDB");
  } catch (e) {
    console.error("FAILED:", (e as Error).message);
  } finally {
    await driver.close();
  }
}

main();
