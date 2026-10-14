import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
try {
  await writeFile(new URL("../.env.local", import.meta.url), template.replace(
    "BETTER_AUTH_SECRET=", `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
  ), { flag: "wx", mode: 0o600 });
  console.log("Created .env.local with a random authentication secret. External delivery stays disabled.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env.local already exists; no settings were overwritten.");
}
