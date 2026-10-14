/** Pure validation shared with Node 24 preflight. It reads no environment at import time. */
export interface ProductionIssue { field: string; message: string }
export interface ProductionValidation { ok: boolean; issues: ProductionIssue[] }
export type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

function localHost(host: string) {
  let value = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  try { value = new URL(`http://${value.includes(":") ? `[${value}]` : value}`).hostname.replace(/^\[|\]$/g, ""); }
  catch { return true; }
  return value === "localhost" || value.endsWith(".localhost") || value === "::1"
    || value === "::" || /^::ffff:7f[\da-f]{2}:/i.test(value)
    || value === "0.0.0.0" || /^127\./.test(value) || value === "mailpit"
    || value.endsWith(".test") || value.endsWith(".invalid");
}

export function validateProductionEnvironment(env: ProductionEnvironment): ProductionValidation {
  const issues: ProductionIssue[] = [];
  const issue = (field: string, message: string) => { issues.push({ field, message }); };
  const value = (field: string) => env[field]?.trim() ?? "";
  const required = (field: string) => { if (!value(field)) issue(field, "Required for this production feature"); };
  const flag = (field: string) => {
    const input = value(field);
    if (input && input !== "true" && input !== "false") issue(field, "Use true or false");
    return input === "true";
  };
  if (value("NODE_ENV") !== "production") issue("NODE_ENV", "Production preflight requires production mode");
  try {
    const origin = new URL(value("BETTER_AUTH_URL"));
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || localHost(origin.hostname)) {
      issue("BETTER_AUTH_URL", "Use a public HTTPS origin without credentials, path, query or fragment");
    }
  } catch { issue("BETTER_AUTH_URL", "Use a public HTTPS origin"); }
  if (value("BETTER_AUTH_SECRET").length < 32) issue("BETTER_AUTH_SECRET", "A random secret of at least 32 characters is required");
  const databaseUri = value("MONGODB_URI");
  if (!/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(databaseUri)) issue("MONGODB_URI", "A valid MongoDB connection URI is required");
  else {
    const authority = databaseUri.replace(/^mongodb(?:\+srv)?:\/\//, "").split(/[/?#]/)[0]?.split("@").at(-1) ?? "";
    if (!authority || !authority.split(",").every((host) => /^(?:\[[\da-f:]+\]|[a-z\d.-]+)(?::\d+)?$/i.test(host))) {
      issue("MONGODB_URI", "Configure valid MongoDB hosts");
    }
    const queryIndex = databaseUri.indexOf("?");
    const query = new URLSearchParams(queryIndex < 0 ? "" : databaseUri.slice(queryIndex + 1));
    if (!databaseUri.startsWith("mongodb+srv://") && !query.get("replicaSet")) issue("MONGODB_URI", "Configure a replica set for transactions, or use an SRV replica-set URI");
  }
  if (value("MONGODB_DATABASE") && !/^[a-zA-Z0-9_-]{1,63}$/.test(value("MONGODB_DATABASE"))) issue("MONGODB_DATABASE", "Use a supported database name");
  if (value("INNGEST_DEV") && value("INNGEST_DEV") !== "0") issue("INNGEST_DEV", "Development signature bypass must be disabled");
  const email = flag("EMAIL_ENABLED");
  if (!email) issue("EMAIL_ENABLED", "Production registration requires email verification through enabled delivery");
  const digest = flag("DIGEST_SCHEDULE_ENABLED");
  const alerts = flag("ALERT_SCHEDULE_ENABLED");
  const market = value("MARKET_DATA_MODE") || "fixture";
  const ai = value("AI_MODE") || "fixture";
  if (!["fixture", "finnhub"].includes(market)) issue("MARKET_DATA_MODE", "Use fixture or finnhub");
  if (!["fixture", "gemini"].includes(ai)) issue("AI_MODE", "Use fixture or gemini");
  if (market === "finnhub") required("FINNHUB_API_KEY");
  if (digest || alerts) {
    if (!email) issue("EMAIL_ENABLED", "Scheduled delivery requires enabled email");
    if (market !== "finnhub") issue("MARKET_DATA_MODE", "Enabled production jobs require live market data");
  }
  if (digest) {
    if (ai !== "gemini") issue("AI_MODE", "Enabled production digests require live summaries");
    required("GEMINI_API_KEY"); required("GEMINI_MODEL");
  }
  if (email || digest || alerts) {
    required("INNGEST_EVENT_KEY"); required("INNGEST_SIGNING_KEY");
  }
  if (email) {
    if (value("EMAIL_TRANSPORT") !== "smtp") issue("EMAIL_TRANSPORT", "Enabled production delivery requires SMTP");
    if (!value("SMTP_HOST") || localHost(value("SMTP_HOST"))) issue("SMTP_HOST", "Configure an external SMTP provider");
    const port = value("SMTP_PORT") || "1025";
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) issue("SMTP_PORT", "Use a valid SMTP port");
    const secure = value("SMTP_SECURE");
    if (secure && !["true", "false"].includes(secure)) issue("SMTP_SECURE", "Use true or false; STARTTLS is enforced for external insecure sockets");
    if (!!value("SMTP_USER") !== !!value("SMTP_PASSWORD")) issue("SMTP_USER/SMTP_PASSWORD", "Configure both SMTP credentials or neither for an authenticated relay policy");
    const sender = value("EMAIL_FROM");
    const address = sender.match(/<([^<>]+)>$/)?.[1] ?? sender;
    if (/[\r\n]/.test(sender) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) || localHost(address.split("@")[1] ?? "")) {
      issue("EMAIL_FROM", "Use a verified sender address on an external domain");
    }
  }
  for (const [field, min, max] of [
    ["FINNHUB_REQUESTS_PER_MINUTE", 1, 30], ["MARKET_CACHE_SECONDS", 1, 3600],
    ["MARKET_STALE_SECONDS", 60, 86400], ["ALERT_POLL_SECONDS", 300, 3600], ["SMTP_PORT", 1, 65_535],
  ] as const) {
    const input = value(field);
    if (input && (!/^\d+$/.test(input) || Number(input) < min || Number(input) > max)) issue(field, "Use a supported integer configuration value");
  }
  return { ok: issues.length === 0, issues };
}
