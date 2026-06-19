import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let db: Database | undefined;

export function getDb(): Database {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    const client = postgres(connectionString, { max: 10 });
    db = drizzle(client, { schema });
  }

  return db;
}
