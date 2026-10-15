import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function demoEnvironment(secret, port = 3000, inherited = process.env) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Run npm run setup:local to create an authentication secret.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [1025, 8025, 8288, 27017].includes(port)) throw new Error("Use an application port between 1024 and 65535, outside service ports.");
  return {
    ...inherited, NODE_ENV: "development", LOCAL_DEMO: "true", COMPOSE_PROGRESS: "plain",
    BETTER_AUTH_URL: `http://localhost:${port}`, BETTER_AUTH_SECRET: secret,
    MONGODB_URI: "mongodb://127.0.0.1:27017/ai_stock_market_demo?replicaSet=rs0&directConnection=true",
    MONGODB_DATABASE: "ai_stock_market_demo",
    MARKET_DATA_MODE: "fixture", AI_MODE: "fixture", FINNHUB_API_KEY: "", GEMINI_API_KEY: "", GEMINI_MODEL: "",
    FINNHUB_REQUESTS_PER_MINUTE: "30", MARKET_CACHE_SECONDS: "60", MARKET_STALE_SECONDS: "900",
    INNGEST_DEV: "1", INNGEST_EVENT_KEY: "", INNGEST_SIGNING_KEY: "", INNGEST_BASE_URL: "http://127.0.0.1:8288",
    INNGEST_APP_PORT: String(port), EMAIL_ENABLED: "true", EMAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASSWORD: "",
    EMAIL_FROM: "Stock Market Demo <no-reply@localhost.test>",
    DIGEST_SCHEDULE_ENABLED: "false", ALERT_SCHEDULE_ENABLED: "false", ALERT_POLL_SECONDS: "300",
  };
}

async function available(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Port ${port} is occupied. Use npm run demo -- --port 3100; existing processes were preserved.`)));
    server.listen({ port, host: "0.0.0.0" }, () => server.close(resolve));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) throw new Error("Usage: npm run demo [-- --port 3100]");
  const port = args.length ? Number(args[1]) : 3000;
  await import("./setup-local.mjs");
  const local = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
  const env = demoEnvironment(local.BETTER_AUTH_SECRET, port);
  await available(port);
  let active;
  let stopping = false;
  const run = (command, commandArgs) => new Promise((resolve, reject) => {
    active = spawn(command, commandArgs, { cwd: root, env, stdio: "inherit", windowsHide: true });
    active.once("error", () => reject(new Error(`Could not start ${command}. Docker Desktop must be installed and running.`)));
    active.once("exit", (code) => {
      active = undefined;
      if (stopping || code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}. Start Docker Desktop and rerun npm run demo.`));
    });
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const child = active;
    if (child && child.exitCode === null && child.pid) {
      // Stop only this launcher's own child tree; infrastructure data remains intact.
      if (process.platform === "win32") spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else child.kill("SIGTERM");
    }
    console.log("\nDemo stopped. Local service containers are kept; npm run services:down stops them without deleting database volumes.");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await run("docker", ["compose", "up", "-d", "--wait", "mongo", "mailpit"]);
    if (stopping) return;
    await run("docker", ["compose", "--profile", "jobs", "up", "-d", "inngest"]);
    if (stopping) return;
    console.log(`\nLocal demo: http://localhost:${port}\nMailpit: http://127.0.0.1:8025\nInngest: http://127.0.0.1:8288\nSynthetic market/AI; isolated ai_stock_market_demo database. No cloud accounts required.\n`);
    // The host binding lets the isolated Docker jobs service call this development server.
    await run(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "dev", "--hostname", "0.0.0.0", "--port", String(port)]);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
