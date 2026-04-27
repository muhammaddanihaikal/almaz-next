import { Client } from "pg"

export async function generateSQLBackup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    await client.connect()

    // Get all table names
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      ORDER BY tablename
    `)
    const tables = tablesResult.rows.map((r) => r.tablename)

    let sql = `-- ALMAZ Database Backup\n`
    sql += `-- Generated: ${new Date().toISOString()}\n\n`

    // Untuk setiap table, export schema + data
    for (const table of tables) {
      // Get CREATE TABLE statement
      const schemaResult = await client.query(`
        SELECT pg_get_ddl('pg_class'::regclass, '${table}'::regclass)
      `)

      // Alternative: query table structure directly
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table])

      // Build CREATE TABLE
      sql += `-- Table: ${table}\n`
      sql += `DROP TABLE IF EXISTS "${table}" CASCADE;\n`
      sql += `CREATE TABLE "${table}" (\n`

      const cols = columnsResult.rows
      cols.forEach((col, idx) => {
        sql += `  "${col.column_name}" ${col.data_type}`
        if (col.column_default) sql += ` DEFAULT ${col.column_default}`
        if (col.is_nullable === "NO") sql += ` NOT NULL`
        if (idx < cols.length - 1) sql += `,\n`
        else sql += `\n`
      })
      sql += `);\n\n`

      // Get table data
      const dataResult = await client.query(`SELECT * FROM "${table}"`)

      // Insert data
      if (dataResult.rows.length > 0) {
        dataResult.rows.forEach((row) => {
          const cols = Object.keys(row).map((k) => `"${k}"`).join(", ")
          const vals = Object.values(row)
            .map((v) => {
              if (v === null) return "NULL"
              if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`
              if (typeof v === "boolean") return v ? "true" : "false"
              if (v instanceof Date) return `'${v.toISOString()}'`
              return String(v)
            })
            .join(", ")
          sql += `INSERT INTO "${table}" (${cols}) VALUES (${vals});\n`
        })
        sql += `\n`
      }
    }

    return sql
  } finally {
    await client.end()
  }
}
