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

  const isProd = typeof window !== "undefined" && window.location.hostname !== "localhost"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Database"
        subtitle={isProd
          ? "Gunakan Neon Console untuk backup. Hanya dapat diakses oleh Super Admin."
          : "Unduh backup database dalam format SQL. Hanya dapat diakses oleh Super Admin."
        }
      />

      {isProd ? (
        <Card>
          <div className="flex flex-col items-center gap-5 py-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
              <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.482l1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
            <div className="text-center max-w-md">
              <p className="text-sm font-semibold text-neutral-900">Backup via Neon Console</p>
              <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
                Di production, gunakan <span className="font-medium text-blue-600">Neon Console</span> untuk backup database:
              </p>
              <ol className="mt-3 text-xs text-neutral-600 text-left space-y-1">
                <li>1. Login ke <a href="https://console.neon.tech" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.neon.tech</a></li>
                <li>2. Pilih project → Database</li>
                <li>3. Klik tab <span className="font-medium">"Backups"</span></li>
                <li>4. Download SQL backup</li>
              </ol>
            </div>
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Buka Neon Console
            </a>
          </div>
        </Card>
      ) : (
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
      )}
    </div>
  )
}
