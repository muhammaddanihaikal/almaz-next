import { Client } from "pg"

export async function generateSQLBackup(onProgress = () => {}) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    await client.connect()

    // 1. Inisialisasi
    onProgress({ progress: 2, message: "Menghubungkan ke database..." })

    let sql = `-- ALMAZ Database Backup\n`
    sql += `-- Generated: ${new Date().toISOString()}\n\n`

    sql += `SET statement_timeout = 0;\n`
    sql += `SET lock_timeout = 0;\n`
    sql += `SET idle_in_transaction_session_timeout = 0;\n`
    sql += `SET transaction_timeout = 0;\n`
    sql += `SET client_encoding = 'UTF8';\n`
    sql += `SET standard_conforming_strings = on;\n`
    sql += `SELECT pg_catalog.set_config('search_path', '', false);\n`
    sql += `SET check_function_bodies = false;\n`
    sql += `SET xmloption = content;\n`
    sql += `SET client_min_messages = warning;\n`
    sql += `SET row_security = off;\n`
    sql += `SET session_replication_role = 'replica';\n\n`

    const schemasResult = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog') 
        AND schema_name NOT LIKE 'pg_toast%'
    `)
    const schemas = schemasResult.rows.map(r => r.schema_name)

    for (const schema of schemas) {
      if (schema !== 'public') {
        sql += `CREATE SCHEMA IF NOT EXISTS "${schema}";\n`
      }
    }
    sql += `\n`

    const tablesResult = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables
      WHERE table_schema IN (${schemas.map((_, i) => `$${i + 1}`).join(', ')})
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `, schemas)
    const tables = tablesResult.rows
    const totalTables = tables.length

    onProgress({ progress: 5, message: `Ditemukan ${totalTables} tabel. Memulai ekspor struktur...` })

    // 2. Export Struktur Tabel (CREATE TABLE + PK)
    for (let i = 0; i < totalTables; i++) {
      const { table_schema, table_name } = tables[i]
      const fullTableName = `"${table_schema}"."${table_name}"`

      onProgress({ 
        progress: 5 + Math.round((i / totalTables) * 40), 
        message: `Mengekspor struktur: ${table_name} (${i + 1}/${totalTables})` 
      })

      sql += `-- Table: ${fullTableName}\n`
      sql += `DROP TABLE IF EXISTS ${fullTableName} CASCADE;\n`
      sql += `CREATE TABLE ${fullTableName} (\n`

      const colsResult = await client.query(`
        SELECT 
            column_name, 
            data_type, 
            is_nullable, 
            column_default,
            datetime_precision,
            character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = $2
        ORDER BY ordinal_position
      `, [table_name, table_schema])

      const colDefs = []
      for (const col of colsResult.rows) {
        let type = col.data_type
        if (col.character_maximum_length) {
          type += `(${col.character_maximum_length})`
        } else if (col.datetime_precision !== null) {
          if (type.includes('timestamp')) {
            type = type.replace('timestamp', `timestamp(${col.datetime_precision})`)
          } else if (type.includes('time')) {
            type = type.replace('time', `time(${col.datetime_precision})`)
          }
        }

        let def = `    "${col.column_name}" ${type}`
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`
        }
        if (col.is_nullable === 'NO') {
          def += ` NOT NULL`
        }
        colDefs.push(def)
      }

      const pkResult = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' 
          AND tc.table_name = $1
          AND tc.table_schema = $2
        ORDER BY kcu.ordinal_position
      `, [table_name, table_schema])
      
      if (pkResult.rows.length > 0) {
        const pkCols = pkResult.rows.map(r => `"${r.column_name}"`).join(', ')
        colDefs.push(`    CONSTRAINT "${table_name}_pkey" PRIMARY KEY (${pkCols})`)
      }

      sql += colDefs.join(',\n')
      sql += `\n);\n\n`
    }

    // 3. Export Data (INSERT INTO)
    onProgress({ progress: 45, message: "Struktur selesai. Memulai ekspor data..." })
    
    for (let i = 0; i < totalTables; i++) {
      const { table_schema, table_name } = tables[i]
      const fullTableName = `"${table_schema}"."${table_name}"`

      onProgress({ 
        progress: 45 + Math.round((i / totalTables) * 45), 
        message: `Mengekspor data: ${table_name} (${i + 1}/${totalTables})` 
      })

      const dataResult = await client.query(`SELECT * FROM ${fullTableName}`)
      if (dataResult.rows.length === 0) {
        sql += `-- Table ${fullTableName} is empty\n\n`
        continue
      }

      sql += `-- Data for: ${fullTableName}\n`
      const columns = Object.keys(dataResult.rows[0])
      const columnList = columns.map((c) => `"${c}"`).join(", ")

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
        sql += `INSERT INTO ${fullTableName} (${columnList}) VALUES (${values});\n`
      })
      sql += `\n`
    }

    // 4. Constraints & Indexes
    onProgress({ progress: 90, message: "Data selesai. Memproses constraints & indexes..." })
    await client.query(`SET search_path = ''`)

    for (const table of tables) {
      const { table_schema, table_name } = table
      const fullTableName = `"${table_schema}"."${table_name}"`

      const constraintsResult = await client.query(`
        SELECT conname, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = $1 AND conrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
          AND contype != 'p'
      `, [table_schema, table_name])

      for (const con of constraintsResult.rows) {
        sql += `ALTER TABLE ONLY ${fullTableName} ADD CONSTRAINT "${con.conname}" ${con.def};\n`
      }

      const indexesResult = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2
          AND indexname NOT IN (
            SELECT conname FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = $1 AND conrelid = (quote_ident($1) || '.' || quote_ident($2))::regclass
          )
          AND indexname NOT LIKE '%_pkey'
      `, [table_schema, table_name])

      for (const idx of indexesResult.rows) {
        sql += `${idx.indexdef};\n`
      }
      
      if (constraintsResult.rows.length > 0 || indexesResult.rows.length > 0) {
        sql += `\n`
      }
    }

    sql += `SET session_replication_role = 'origin';\n`
    
    onProgress({ progress: 100, message: "Backup selesai!" })
    return sql
  } finally {
    await client.end()
  }
}
