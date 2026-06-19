import "dotenv/config"
import pg from "pg"

const { Pool } = pg

async function reset() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    const { rows: before } = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
    )
    console.log(`Found ${before[0].count} table(s) in public schema.`)

    if (before[0].count > 0) {
      console.log("Dropping public schema...")
      await client.query("DROP SCHEMA public CASCADE")
      console.log("Creating public schema...")
      await client.query("CREATE SCHEMA public")
    }

    await client.query("DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE")

    const { rows: after } = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
    )
    console.log(`Reset completed. (${after[0].count} table(s) remaining)`)
  } finally {
    client.release()
    await pool.end()
  }
}

reset().catch((err) => {
  console.error("Reset failed:", err)
  process.exit(1)
})
