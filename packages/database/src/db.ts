import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { getDatabaseUrl } from "./config.js";
import * as schema from "./schema.js";

export type DatabaseSchema = typeof schema;
export type Database = NodePgDatabase<DatabaseSchema>;
export type DatabasePool = Pool;

export interface DatabaseConnection {
  db: Database;
  pool: Pool;
}

export function createPool(
  config: string | PoolConfig = getDatabaseUrl(),
): Pool {
  if (typeof config === "string") {
    return new Pool({ connectionString: config });
  }
  return new Pool(config);
}

export function createDatabase(
  poolOrConfig: Pool | string | PoolConfig = getDatabaseUrl(),
): DatabaseConnection {
  const pool =
    poolOrConfig instanceof Pool ? poolOrConfig : createPool(poolOrConfig);
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function closeDatabase(connection: Pick<DatabaseConnection, "pool">): Promise<void> {
  await connection.pool.end();
}
