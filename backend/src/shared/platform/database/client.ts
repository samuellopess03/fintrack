import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/shared/platform/database/schema";
import { wrapClientQuery } from "@/shared/platform/database/error";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("connect", wrapClientQuery);

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type DbClient = Pick<
  Db,
  "select" | "insert" | "update" | "delete" | "transaction"
>;
