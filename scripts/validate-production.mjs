import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateProductionEnvironment } from "../src/server/production.ts";

export { validateProductionEnvironment };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = validateProductionEnvironment(process.env);
  if (result.ok) {
    console.log("Production configuration preflight passed. Connectivity, permissions and source approval require separate verification.");
  } else {
    console.error("Production configuration preflight failed:");
    for (const issue of result.issues) console.error(`- ${issue.field}: ${issue.message}`);
    process.exitCode = 1;
  }
}
