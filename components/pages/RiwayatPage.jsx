"use client"

import { useState, useTransition } from "react"
import { getAuditLogs } from "@/actions/audit"
import { Card, PageHeader, DateFilter, Field, SelectInput, Button } from "@/components/ui"
import { defaultDateRange } from "@/lib/utils"
import DataTable from "@/components/DataTable"

const ENTITY_LABELS = {
  SesiHarian:  "Distribusi",
  TitipJual:   "Titip Jual",
  Pengeluaran: "Pengeluaran",
  Rokok:       "Rokok",
}

const ACTION_LABELS = {
  CREATE: { label: "Tambah", cls: "bg-emerald-100 text-emerald-700" },
  UPDATE: { label: "Edit",   cls: "bg-amber-100 text-amber-700"    },
  DELETE: { label: "Hapus",  cls: "bg-red-100 text-red-700"        },
}

export default function RiwayatPage({ initialLogs, users }) {
  const today = new Date().toISOString().split("T")[0]
  const [dateRange,   setDateRange]   = useState({ preset: "hari_ini", start: today, end: today })
  const [entityType,  setEntityType]  = useState("")
  const [userId,      setUserId]      = useState("")
  const [logs,        setLogs]        = useState(initialLogs)
  const [expanded,    setExpanded]    = useState(null)
  const [isPending,   startTransition] = useTransition()

  const handleFilter = () => {
    startTransition(async () => {
      const result = await getAuditLogs({
        startDate:   dateRange?.start || undefined,
        endDate:     dateRange?.end   || undefined,
        entity_type: entityType       || undefined,
        user_id:     userId           || undefined,
      })
      setLogs(result)
      setExpanded(null)
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Perubahan"
        subtitle="Catatan semua perubahan data oleh admin. Waktu ditampilkan dalam WIB."
      />

      {/* Filter */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rentang Waktu">
            <DateFilter value={dateRange} onChange={setDateRange} />
          </Field>
          <Field label="Jenis Data">
            <SelectInput value={entityType} onChange={e => setEntityType(e.target.value)}>
              <option value="">Semua</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Diubah Oleh">
            <SelectInput value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Semua User</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label=" ">
            <Button onClick={handleFilter} loading={isPending} className="w-full">
              Tampilkan
            </Button>
          </Field>
        </div>
      </Card>

      {/* Tabel */}
      <Card>
        <DataTable
          pageSize={20}
          rows={logs}
          empty="Tidak ada perubahan data pada periode ini."
          columns={[
            { key: "no",          label: "No",     render: (_, i) => i + 1 },
            { key: "createdAt",   label: "Waktu",  render: r => <span className="tabular-nums text-xs">{r.createdAt}</span> },
            {
              key: "entity_type", label: "Data",
              render: r => (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</span>
                  {r.change_type && <span className="text-xs text-neutral-500">{r.change_type}</span>}
                </div>
              ),
            },
            {
              key: "action", label: "Aksi",
              render: r => {
                const a = ACTION_LABELS[r.action] ?? { label: r.action, cls: "bg-neutral-100 text-neutral-700" }
                return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${a.cls}`}>{a.label}</span>
              },
            },
            { key: "user_name",   label: "Oleh",   render: r => r.user_name ?? "-" },
            { key: "alasan",      label: "Alasan", render: r => r.alasan ? <span className="text-xs text-neutral-600">{r.alasan}</span> : <span className="text-xs text-neutral-400">-</span> },
            {
              key: "detail", label: "Detail",
              render: r => (
                <button
                  className="text-xs font-medium text-neutral-500 underline hover:text-neutral-900"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  {expanded === r.id ? "Tutup" : "Lihat"}
                </button>
              ),
            },
          ]}
          mobileRender={(r) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_LABELS[r.action]?.cls ?? "bg-neutral-100 text-neutral-700"}`}>
                      {ACTION_LABELS[r.action]?.label ?? r.action}
                    </span>
                    <span className="text-sm font-medium">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</span>
                  </div>
                  {r.change_type && <span className="text-xs text-neutral-500">{r.change_type}</span>}
                </div>
                <button
                  className="text-xs font-medium text-neutral-500 underline"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  {expanded === r.id ? "Tutup" : "Detail"}
                </button>
              </div>
              <p className="text-xs text-neutral-500">{r.createdAt} · {r.user_name ?? "-"}</p>
              {r.alasan && <p className="text-xs text-neutral-600">Alasan: {r.alasan}</p>}
              {expanded === r.id && <DiffView old_values={r.old_values} new_values={r.new_values} />}
            </div>
          )}
          rowExtra={(r) => expanded === r.id ? (
            <tr>
              <td colSpan={99} className="bg-neutral-50 px-4 py-3">
                <DiffView old_values={r.old_values} new_values={r.new_values} />
              </td>
            </tr>
          ) : null}
        />
      </Card>
    </div>
  )
}

function DiffView({ old_values, new_values }) {
  if (!old_values && !new_values) return <p className="text-xs text-neutral-400">Tidak ada detail.</p>

  const keys = [...new Set([
    ...Object.keys(old_values ?? {}),
    ...Object.keys(new_values ?? {}),
  ])]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-1 pr-4 font-medium">Field</th>
            {old_values && <th className="py-1 pr-4 font-medium text-red-600">Sebelum</th>}
            {new_values && <th className="py-1 font-medium text-emerald-600">Sesudah</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map(k => (
            <tr key={k} className="border-b border-neutral-100 last:border-0">
              <td className="py-1 pr-4 font-medium text-neutral-700">{k}</td>
              {old_values && (
                <td className="py-1 pr-4 text-red-700 font-mono">
                  {formatVal(old_values[k])}
                </td>
              )}
              {new_values && (
                <td className="py-1 text-emerald-700 font-mono">
                  {formatVal(new_values[k])}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatVal(v) {
  if (v === null || v === undefined) return <span className="text-neutral-400">-</span>
  if (typeof v === "object") return <span className="break-all">{JSON.stringify(v)}</span>
  return String(v)
}
