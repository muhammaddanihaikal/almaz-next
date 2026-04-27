import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import { existsSync } from "fs"

const execAsync = promisify(exec)

const findPgDump = () => {
  // Cek di PATH
  if (process.platform !== "win32") {
    return "pg_dump"
  }

  // Di Windows, coba lokasi default PostgreSQL
  const commonPaths = [
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe",
    "C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump.exe",
    "C:\\Program Files (x86)\\PostgreSQL\\15\\bin\\pg_dump.exe",
  ]

  for (const path of commonPaths) {
    if (existsSync(path)) return path
  }

  return "pg_dump" // fallback, try PATH
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return new NextResponse("DATABASE_URL tidak ditemukan", { status: 500 })
  }

  try {
    const pgDump = findPgDump()
    const { stdout } = await execAsync(`"${pgDump}" "${dbUrl}"`, { maxBuffer: 100 * 1024 * 1024 })
    const date     = new Date().toISOString().slice(0, 10)
    const filename = `backup-almaz-${date}.sql`

    return new NextResponse(stdout, {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const msg = err.stderr || err.message || "Unknown error"

    // Helpful error message untuk pg_dump not found
    if (msg.includes("not recognized") || msg.includes("No such file")) {
      return new NextResponse(
        "Error: pg_dump tidak ditemukan.\n\n" +
        "Solusi:\n" +
        "1. Pastikan PostgreSQL sudah terinstall\n" +
        "2. Tambahkan path PostgreSQL ke System PATH:\n" +
        "   - Windows: Control Panel > Environment Variables\n" +
        "   - Tambahkan: C:\\Program Files\\PostgreSQL\\[VERSION]\\bin\n" +
        "3. Restart dev server setelah mengubah PATH\n\n" +
        "Error detail: " + msg,
        { status: 500 }
      )
    }

    return new NextResponse("Backup gagal: " + msg, { status: 500 })
  }
}
