"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export default function DataTable({ columns, rows, empty, pageSize: defaultPageSize, mobileRender }) {
  const hasPagination = !!defaultPageSize
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize || 9999)
  const total = rows?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [totalPages, page])

  if (!total) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
        {empty || "Tidak ada data."}
      </div>
    )
  }

  const visible = hasPagination ? rows.slice((page - 1) * pageSize, page * pageSize) : rows

  const Pagination = hasPagination && (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">
          Menampilkan{" "}
          <span className="font-medium text-neutral-700">{(page - 1) * pageSize + 1}</span>
          &ndash;
          <span className="font-medium text-neutral-700">{Math.min(page * pageSize, total)}</span>{" "}
          dari <span className="font-medium text-neutral-700">{total}</span> data
        </span>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="h-7 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 outline-none focus:border-neutral-400"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} / hal</option>
          ))}
        </select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <PageNavButton onClick={() => setPage(page - 1)} disabled={page === 1} icon={ChevronLeft} label="Sebelumnya" />
          {buildPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`gap-${i}`} className="px-2 text-xs text-neutral-400">&hellip;</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={"h-8 min-w-[32px] rounded-md px-2 text-xs font-medium transition " + (p === page ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")}
              >
                {p}
              </button>
            )
          )}
          <PageNavButton onClick={() => setPage(page + 1)} disabled={page === totalPages} icon={ChevronRight} label="Selanjutnya" />
        </div>
      )}
    </div>
  )

  if (mobileRender) {
    return (
      <div>
        <div className="block sm:hidden space-y-2">
          {visible.map((row, visIdx) => {
            const rowIndex = (page - 1) * pageSize + visIdx
            return (
              <div key={row.id ?? visIdx} className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                {mobileRender(row, rowIndex)}
              </div>
            )
          })}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                {columns.map((c) => (
                  <th key={c.key} className={"px-3 py-2.5 " + (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, visIdx) => {
                const rowIndex = (page - 1) * pageSize + visIdx
                return (
                  <tr key={row.id ?? visIdx} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60">
                    {columns.map((c) => (
                      <td key={c.key} className={"px-3 py-3 text-neutral-800 " + (c.align === "right" ? "text-right tabular-nums" : "") + (c.align === "center" ? " text-center" : "")}>
                        {c.render ? c.render(row, rowIndex) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {Pagination}
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              {columns.map((c) => (
                <th key={c.key} className={"px-3 py-2.5 " + (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, visIdx) => {
              const rowIndex = (page - 1) * pageSize + visIdx
              return (
                <tr key={row.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className={"px-3 py-3 text-neutral-800 " + (c.align === "right" ? "text-right tabular-nums" : "") + (c.align === "center" ? " text-center" : "")}>
                      {c.render ? c.render(row, rowIndex) : row[c.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {Pagination}
    </div>
  )
}

function PageNavButton({ onClick, disabled, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  )
}

function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total]
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total]
  return [1, "...", current - 1, current, current + 1, "...", total]
}
