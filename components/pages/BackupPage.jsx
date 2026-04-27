"use client"

import { useState } from "react"
import { Download, Database, CheckCircle } from "lucide-react"
import { Card, PageHeader } from "@/components/ui"

export default function BackupPage() {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [success, setSuccess]   = useState(false)

  const handleBackup = async () => {
    setLoading(true)
    setError("")
    setSuccess(false)
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) {
        const msg = await res.text()
        setError(msg)
        return
      }
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const date     = new Date().toISOString().slice(0, 10)
      const a        = document.createElement("a")
      a.href         = url
      a.download     = `backup-almaz-${date}.sql`
      a.click()
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (e) {
      setError("Terjadi kesalahan: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Database"
        subtitle="Unduh backup database dalam format SQL. Hanya dapat diakses oleh Super Admin."
      />

      <Card>
        <div className="flex flex-col items-center gap-5 py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100">
            <Database className="h-8 w-8 text-neutral-500" strokeWidth={1.5} />
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-900">Backup Database ALMAZ</p>
            <p className="mt-1 text-xs text-neutral-500">
              File akan diunduh dalam format <code className="rounded bg-neutral-100 px-1 py-0.5">.sql</code> dan dapat
              digunakan untuk restore database PostgreSQL.
            </p>
          </div>

          {error && (
            <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Backup berhasil diunduh.
            </div>
          )}

          <button
            onClick={handleBackup}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {loading ? "Memproses..." : "Download Backup .sql"}
          </button>
        </div>
      </Card>
    </div>
  )
}
