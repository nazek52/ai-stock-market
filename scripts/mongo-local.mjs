import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// This launcher deliberately never loads .env.local or accepts an external URI.
const host = "127.0.0.1";
const port = 27017;
const dbPath = fileURLToPath(new URL("../.local/mongodb/", import.meta.url));
const downloadDir = fileURLToPath(new URL("../.local/mongodb-binaries/", import.meta.url));

async function assertPortAvailable() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen({ host, port, exclusive: true }, () => probe.close(resolve));
  });
}

const replicaSet = new MongoMemoryReplSet({
  binary: { version: "8.0.16", downloadDir },
  instanceOpts: [{ port, dbPath, storageEngine: "wiredTiger" }],
  replSet: {
    count: 1,
    name: "rs0",
    ip: host,
    storageEngine: "wiredTiger",
    // Give the child its own process group so terminal Ctrl+C reaches this
    // handler first. The library can then issue MongoDB's shutdown command.
    spawn: { detached: true, windowsHide: true },
  },
});

let shutdownRequested = false;
let startup;
let shutdown;

function requestShutdown(signal) {
  shutdownRequested = true;
  shutdown ??= (async () => {
    console.log(`\n${signal}: stopping local MongoDB; persistent data will be kept.`);
    // Startup can include a download. Wait for it to settle before stopping children.
    await startup?.catch(() => {});
    if (!(await replicaSet.stop({ doCleanup: false, force: false }))) {
      process.exitCode = 1;
      console.error("MongoDB did not confirm a clean shutdown. Data files were not removed.");
      return;
    }
    console.log("Local MongoDB stopped. Data remains in .local/mongodb.");
  })().catch((error) => {
    process.exitCode = 1;
    console.error(`Local MongoDB shutdown failed: ${error.message}`);
  });
  return shutdown;
}

process.on("SIGINT", () => { void requestShutdown("SIGINT"); });
process.on("SIGTERM", () => { void requestShutdown("SIGTERM"); });

try {
  await assertPortAvailable();
  await mkdir(dbPath, { recursive: true });
  await mkdir(downloadDir, { recursive: true });
  if (!shutdownRequested) {
    console.log("Starting local MongoDB 8.0.16 (rs0). First launch may download the MongoDB binary.");
    startup = replicaSet.start();
    await startup;
    // The package may select a free port if another process races our initial probe.
    // Fail rather than silently changing the application's configured endpoint.
    if (replicaSet.servers.length !== 1 || replicaSet.servers[0].instanceInfo?.port !== port) {
      throw new Error("Port 27017 became unavailable; refusing to start on a different port.");
    }
    if (!shutdownRequested) {
      console.log(`Local MongoDB ready: mongodb://${host}:${port}/ai_stock_market?replicaSet=rs0&directConnection=true`);
      console.log("Bound to loopback only. Press Ctrl+C to stop; data persists in .local/mongodb.");
    }
  }
} catch (error) {
  process.exitCode = 1;
  console.error(`Cannot start local MongoDB: ${error.message}`);
  await requestShutdown("startup error");
}

