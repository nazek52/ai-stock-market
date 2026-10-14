import "server-only";
import { MongoClient, type Db } from "mongodb";
import { getDatabaseConfig } from "@/server/config";
import { AppError } from "@/server/errors";

let connection: Promise<MongoClient> | undefined;

/** A client owns a connection pool. Reuse it across requests, never connect at import time. */
export function getMongoClient(): Promise<MongoClient> {
  if (!connection) {
    const { uri } = getDatabaseConfig();
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
      socketTimeoutMS: 15_000,
    });
    connection = client.connect().catch(async () => {
      connection = undefined;
      await client.close().catch(() => undefined);
      throw new AppError("SERVICE_UNAVAILABLE", "Database is temporarily unavailable", 503);
    });
  }
  return connection;
}

export async function getDatabase(): Promise<Db> {
  const { databaseName } = getDatabaseConfig();
  return (await getMongoClient()).db(databaseName);
}

/** Shutdown hook for scripts/tests. Do not close the shared pool after a request. */
export async function closeDatabase(): Promise<void> {
  const active = connection;
  connection = undefined;
  if (active) await (await active).close();
}
