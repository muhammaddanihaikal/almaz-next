"use client"

import { useState } from "react"
import { Download, Database, CheckCircle, AlertCircle } from "lucide-react"
import { Card, PageHeader, Button } from "@/components/ui"

export default function BackupPage() {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [success, setSuccess]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus]     = useState("")

  const handleBackup = async () => {
    setLoading(true)
    setError("")
    setSuccess(false)
    setProgress(0)
    setStatus("Memulai backup...")

    try {
      const response = await fetch("/api/backup?stream=true")
      if (!response.ok) {
        throw new Error("Gagal memulai stream backup")
      }

      const reader = response.body.getReader()
      const textDecoder = new TextDecoder()
      
      let done = false
      let buffer = ""

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          buffer += textDecoder.decode(value, { stream: true })
          
          // Split by SSE double newline
          const parts = buffer.split("\n\n")
          buffer = parts.pop() || ""

          for (const part of parts) {
            if (part.startsWith("event: done")) {
              const dataLine = part.split("\n").find(line => line.startsWith("data: "))
              if (dataLine) {
                const { sql } = JSON.parse(dataLine.slice(6))
                triggerDownload(sql)
                setSuccess(true)
                setProgress(100)
                setStatus("Backup selesai!")
              }
            } else if (part.startsWith("event: error")) {
              const dataLine = part.split("\n").find(line => line.startsWith("data: "))
              if (dataLine) {
                const { message } = JSON.parse(dataLine.slice(6))
                throw new Error(message)
              }
            } else if (part.startsWith("data: ")) {
              const data = JSON.parse(part.slice(6))
              setProgress(data.progress)
              setStatus(data.message)
            }
          }
        }
      }
    } catch (e) {
      setError("Terjadi kesalahan: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const triggerDownload = (sqlContent) => {
    const blob     = new Blob([sqlContent], { type: "application/octet-stream" })
    const url      = URL.createObjectURL(blob)
    const date     = new Date().toISOString().slice(0, 10)
    const a        = document.createElement("a")
    a.href         = url
    a.download     = `backup-almaz-${date}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Database"
        subtitle="Unduh backup database Neon DB dalam format SQL. Hanya dapat diakses oleh Super Admin."
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

          {loading && (
            <div className="w-full max-w-md space-y-3">
              <div className="flex justify-between text-[10px] font-medium text-neutral-500 uppercase tracking-wider">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div 
                  className="h-full bg-neutral-900 transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" strokeWidth={2} />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {success && !loading && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Backup berhasil diunduh.
            </div>
          )}

          <Button
            onClick={handleBackup}
            loading={loading}
            icon={Download}
            size="lg"
            className="w-full max-w-xs"
          >
            Download Backup .sql
          </Button>
        </div>
      </Card>
    </div>
  )
}
