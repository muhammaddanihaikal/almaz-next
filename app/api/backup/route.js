import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { generateSQLBackup } from "@/lib/backup"

export async function GET(req) {
  const session = await auth()
  if (!session || !["superadmin", "admin"].includes(session.user.role)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const stream = searchParams.get('stream') === 'true'

  if (!stream) {
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
      return new NextResponse(`Backup gagal: ${err.message}`, { status: 500 })
    }
  }

  // SSE Mode for Progress Tracking
  const responseStream = new TransformStream()
  const writer = responseStream.writable.getWriter()
  const encoder = new TextEncoder()

  // Start generation in background
  ;(async () => {
    try {
      const sql = await generateSQLBackup((p) => {
        writer.write(encoder.encode(`data: ${JSON.stringify(p)}\n\n`))
      })
      // Send final SQL content
      writer.write(encoder.encode(`event: done\ndata: ${JSON.stringify({ sql })}\n\n`))
    } catch (err) {
      console.error("Stream backup error:", err)
      writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`))
    } finally {
      writer.close()
    }
  })()

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
