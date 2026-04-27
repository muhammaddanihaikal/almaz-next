import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { generateSQLBackup } from "@/lib/backup"

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const sqlContent = await generateSQLBackup()
    const date     = new Date().toISOString().slice(0, 10)
    const filename = `backup-almaz-${date}.sql`

    return new NextResponse(sqlContent, {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("Backup error:", err)
    return new NextResponse(
      `Backup gagal: ${err.message}`,
      { status: 500 }
    )
  }
}
