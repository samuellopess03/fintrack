import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index'

const { Pool } = pg

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (!client) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    client = drizzle(pool, { schema })
  }
  return client
}

export type Db = ReturnType<typeof getDb>
