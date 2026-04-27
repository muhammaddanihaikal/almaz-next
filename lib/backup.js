import { Client } from "pg"

export async function generateSQLBackup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    await client.connect()

    // Get all table names dengan case yang benar
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    const tables = tablesResult.rows.map((r) => r.table_name)

    let sql = `-- ALMAZ Database Backup\n`
    sql += `-- Generated: ${new Date().toISOString()}\n\n`

    // Untuk setiap table, export data sebagai INSERT statements
    for (const tableName of tables) {
      // Escape table name dengan double quotes
      const escapedTable = `"${tableName}"`

      // Get data dari table
      const dataResult = await client.query(`SELECT * FROM ${escapedTable}`)

      if (dataResult.rows.length === 0) {
        sql += `-- Table: ${tableName} (empty)\n\n`
        continue
      }

      sql += `-- Table: ${tableName}\n`

      // Get column names
      const columns = Object.keys(dataResult.rows[0])
      const columnList = columns.map((c) => `"${c}"`).join(", ")

      // Generate INSERT statements
      dataResult.rows.forEach((row) => {
        const values = columns
          .map((col) => {
            const val = row[col]
            if (val === null) return "NULL"
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`
            if (typeof val === "boolean") return val ? "true" : "false"
            if (val instanceof Date) return `'${val.toISOString()}'`
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`
            return String(val)
          })
          .join(", ")
        sql += `INSERT INTO ${escapedTable} (${columnList}) VALUES (${values});\n`
      })
      sql += `\n`
    }

    return sql
  } finally {
    await client.end()
  }
}
