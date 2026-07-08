import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/shared/data/db/schema";

export function buildTestDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
  return drizzle(pool, { schema });
}

export type TestDb = ReturnType<typeof buildTestDb>;
