import * as XLSX from "xlsx-js-style"

// ─── Format ──────────────────────────────────────────────────────────────────

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

export const fmtIDR = (n) => idr.format(n || 0)

export const fmtTanggal = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

// ─── Date ranges ─────────────────────────────────────────────────────────────

export const getDateRanges = () => {
  const today = new Date()
  const day = today.getDay()
  const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1)
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), diffToMonday)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(endOfWeek.getDate() + 6)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  return {
    hari_ini: { start: fmt(today), end: fmt(today) },
    minggu_ini: { start: fmt(startOfWeek), end: fmt(endOfWeek) },
    bulan_ini: { start: fmt(startOfMonth), end: fmt(endOfMonth) },
  }
}

export const filterByDateRange = (rows, range) => {
  if (!range?.start || !range?.end) return rows
  return rows.filter((r) => r.tanggal >= range.start && r.tanggal <= range.end)
}

export const defaultDateRange = (type = "bulan_ini") => {
  const ranges = getDateRanges()
  return { preset: type, ...ranges[type] }
}

export const sortByDateDesc = (rows) =>
  [...rows].sort((a, b) => b.tanggal.localeCompare(a.tanggal))

// ─── Domain ───────────────────────────────────────────────────────────────────

export const getRokok = (rokokList, nama) => rokokList.find((r) => r.nama === nama)

export const hitungProfit = (rokokList, penjualan) =>
  (penjualan.masukItems || []).reduce((sum, item) => {
    const r = getRokok(rokokList, item.rokok)
    return r ? sum + item.qty * ((item.harga || 0) - r.harga_beli) : sum
  }, 0)

// ─── Excel ───────────────────────────────────────────────────────────────────

const buildSheet = (rows, columns, meta = [], options = {}) => {
  const header = columns.map((c) => c.label)
  const data = rows.map((r, i) => columns.map((c) => c.value(r, i)))

  const sheetRows = []
  if (meta.length > 0) {
    meta.forEach(([label, value]) => sheetRows.push([label, value ?? ""]))
    sheetRows.push([])
  }
  sheetRows.push(header)
  data.forEach((row) => sheetRows.push(row))

  const ws = XLSX.utils.aoa_to_sheet(sheetRows)
  const colWidths = columns.map((c, ci) => {
    const dataMax = data.length > 0 ? Math.max(...data.map((row) => String(row[ci] ?? "").length)) : 0
    return { wch: Math.max(c.label.length, dataMax) + 2 }
  })
  if (meta.length > 0 && colWidths.length >= 2) {
    colWidths[0].wch = Math.max(colWidths[0].wch, ...meta.map(([l]) => String(l).length + 2))
    colWidths[1].wch = Math.max(colWidths[1].wch, ...meta.map(([, v]) => String(v ?? "").length + 2))
  }
  ws["!cols"] = colWidths

  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"])
    const headerRowIdx = meta.length > 0 ? meta.length + 1 : 0
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[addr]) continue
        if (options.centered || (options.centerData && R >= headerRowIdx)) {
          ws[addr].s = { alignment: { horizontal: "center", vertical: "center", wrapText: true } }
        }
      }
    }
  }
  return ws
}

export const downloadExcel = (rows, filename, columns, meta = [], options = {}) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildSheet(rows, columns, meta, options), "Data")
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx")
}

export const downloadExcelMultiSheet = (sheets, filename) => {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows, columns, meta = [], centered = false }) => {
    XLSX.utils.book_append_sheet(wb, buildSheet(rows, columns, meta, { centered }), name)
  })
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx")
}
