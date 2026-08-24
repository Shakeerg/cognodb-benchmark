import "dotenv/config";
import gremlin from "gremlin";

const { DriverRemoteConnection } = gremlin.driver;
const { traversal } = gremlin.process.AnonymousTraversalSource;

async function main() {
  const url = process.env.JANUSGRAPH_URL ?? "ws://localhost:8182/gremlin";
  console.log("Testing JanusGraph connection with URL:", url);

  const connection = new DriverRemoteConnection(url, {});


  try {
    const g = traversal().withRemote(connection);
    console.log("Traversal source created, attempting a simple query...");
    const result = await g.V().limit(1).count().next();
    console.log("SUCCESS: query returned", result);
  } catch (e) {
    console.error("FAILED. Error type:", typeof e);
    console.error("FAILED. Error object:", e);
    console.error("FAILED. Error stringified:", String(e));
    if (e instanceof Error) {
      console.error("FAILED. .message:", e.message);
      console.error("FAILED. .stack:", e.stack);
    }
  } finally {
    await connection.close();
  }
}

main();
