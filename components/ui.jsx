"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Calendar, ChevronDown, Download, Eye, Pencil, Trash2, ChevronRight, CalendarDays, X, Loader2 } from "lucide-react"
import { getDateRanges } from "@/lib/utils"

export const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"

export function MoneyInput({ value, onChange, placeholder, className, disabled }) {
  const [focused, setFocused] = useState(false)
  const raw = String(value || "").replace(/\D/g, "")
  const display = focused ? raw : (raw ? Number(raw).toLocaleString("id-ID") : "")
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  )
}

export function SelectInput({ value, onChange, required, children }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} required={required} className={inputCls + " appearance-none pr-8"}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={2} />
    </div>
  )
}

export function SearchableSelect({ value, onChange, options, placeholder, disabled }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredOptions = options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
  const selectedOption = options.find((opt) => String(opt.value) === String(value))

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`${inputCls} flex justify-between items-center pr-2 ${!selectedOption && placeholder ? "text-neutral-500" : ""} ${disabled ? "cursor-not-allowed bg-neutral-100 opacity-70" : "cursor-pointer"}`}
        onClick={() => { if (disabled) return; setIsOpen(!isOpen); setSearch("") }}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder || "Pilih..."}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          <div className="px-2 pb-2 pt-1 sticky top-0 bg-white border-b border-neutral-100">
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              placeholder="Cari..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto pt-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-neutral-500">Tidak ditemukan</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-neutral-100 ${String(value) === String(opt.value) ? "bg-neutral-50 font-medium text-neutral-900" : "text-neutral-700"}`}
                  onClick={() => { onChange({ target: { value: opt.value } }); setIsOpen(false) }}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function MultiSearchableSelect({ value = [], onChange, options, placeholder, disabled }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredOptions = options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
  const selectedOptions = options.filter((opt) => opt.value !== "" && value.includes(opt.value))

  const toggle = (val) => {
    if (val === "") {
      onChange({ target: { value: [] } })
      setIsOpen(false)
    } else {
      const next = value.includes(val) ? value.filter((v) => v !== val) : [...value, val]
      onChange({ target: { value: next } })
    }
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange({ target: { value: [] } })
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`${inputCls} flex h-auto min-h-[38px] justify-between items-center pr-2 py-1.5 ${value.length === 0 && placeholder ? "text-neutral-500" : ""} ${disabled ? "cursor-not-allowed bg-neutral-100 opacity-70" : "cursor-pointer"}`}
        onClick={() => { if (disabled) return; setIsOpen(!isOpen); setSearch("") }}
      >
        <div className="flex flex-wrap gap-1 max-w-[calc(100%-40px)]">
          {selectedOptions.length === 0 ? (
            <span className="truncate">{placeholder || "Pilih..."}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span key={opt.value} className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
                {opt.label}
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-1">
          {value.length > 0 && (
            <button
              onClick={clear}
              className="rounded-full p-0.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} />
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          <div className="px-2 pb-2 pt-1 sticky top-0 bg-white border-b border-neutral-100">
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              placeholder="Cari..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-60 overflow-y-auto pt-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-neutral-500">Tidak ditemukan</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-center gap-2 cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-neutral-100 ${value.includes(opt.value) ? "bg-neutral-50 font-medium text-neutral-900" : "text-neutral-700"}`}
                  onClick={(e) => { e.stopPropagation(); toggle(opt.value) }}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={value.includes(opt.value) || (opt.value === "" && value.length === 0)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                  />
                  <span>{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  )
}

export function FormActions({ onCancel, disabled, submitLabel, loading }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onCancel} disabled={disabled || loading}>
        Batal
      </Button>
      <Button type="submit" disabled={disabled} loading={loading}>
        {submitLabel}
      </Button>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PrimaryButton({ onClick, icon: Icon, children, type = "button", loading: manualLoading, disabled, className = "" }) {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = manualLoading || internalLoading
  
  const handleClick = async (e) => {
    if (onClick) {
      const result = onClick(e)
      if (result instanceof Promise) {
        setInternalLoading(true)
        try { await result } finally { setInternalLoading(false) }
      }
    }
  }

  const isDisabled = disabled || loading
  return (
    <button 
      type={type} 
      onClick={handleClick} 
      disabled={isDisabled}
      className={`inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300 ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Icon && (
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      )}
      {children}
    </button>
  )
}

export function Button({ onClick, children, variant = "primary", size = "md", loading: manualLoading, disabled, icon: Icon, type = "button", className = "" }) {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = manualLoading || internalLoading

  const handleClick = async (e) => {
    if (onClick) {
      const result = onClick(e)
      if (result instanceof Promise) {
        setInternalLoading(true)
        try { await result } finally { setInternalLoading(false) }
      }
    }
  }

  const isDisabled = disabled || loading
  
  const variants = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-300",
    secondary: "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    success: "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300",
    ghost: "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
  }

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-[38px] px-4 text-sm",
    lg: "h-11 px-6 text-base"
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Icon && (
        <Icon className="h-4 w-4" strokeWidth={2} />
      )}
      {children}
    </button>
  )
}

export function DateFilter({ value, onChange }) {
  const handlePresetChange = (e) => {
    const preset = e.target.value
    if (preset === "custom") {
      onChange({ preset: "custom", start: value?.start || "", end: value?.end || "" })
    } else if (preset === "semua") {
      onChange({ preset: "semua", start: "", end: "" })
    } else {
      const ranges = getDateRanges()
      onChange({ preset, ...ranges[preset] })
    }
  }
  const handleCustomChange = (field, val) => {
    onChange({ preset: "custom", start: value?.start || "", end: value?.end || "", [field]: val })
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-auto">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={2} />
        <select
          value={value?.preset || "semua"}
          onChange={handlePresetChange}
          className="h-[38px] w-full cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-9 pr-8 text-sm font-medium text-neutral-800 outline-none transition hover:border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 sm:w-auto"
        >
          <option value="semua">Semua Waktu</option>
          <option value="hari_ini">Hari Ini</option>
          <option value="minggu_ini">Minggu Ini</option>
          <option value="bulan_ini">Bulan Ini</option>
          <option value="custom">Kustom...</option>
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" />
        </svg>
      </div>
      <div className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1 sm:w-auto">
        <input type="date" value={value?.start || ""} onChange={(e) => handleCustomChange("start", e.target.value)} className="h-[28px] w-full border-none bg-transparent text-sm font-medium text-neutral-800 outline-none sm:w-auto" />
        <span className="text-sm font-medium text-neutral-400">-</span>
        <input type="date" value={value?.end || ""} onChange={(e) => handleCustomChange("end", e.target.value)} className="h-[28px] w-full border-none bg-transparent text-sm font-medium text-neutral-800 outline-none sm:w-auto" />
      </div>
    </div>
  )
}

export function DownloadButton({ onClick, disabled, loading }) {
  return (
    <button 
      type="button" 
      onClick={onClick} 
      disabled={disabled || loading} 
      title="Download data sebagai Excel" 
      className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
      ) : (
        <Download className="h-4 w-4" strokeWidth={2} />
      )}
      Download Excel
    </button>
  )
}

export function IconButton({ onClick, icon: Icon, label, variant, disabled, loading: manualLoading }) {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = manualLoading || internalLoading

  const handleClick = async (e) => {
    if (onClick) {
      const result = onClick(e)
      if (result instanceof Promise) {
        setInternalLoading(true)
        try { await result } finally { setInternalLoading(false) }
      }
    }
  }

  const base = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition disabled:cursor-not-allowed"
  const look = disabled || loading
    ? "text-neutral-300"
    : variant === "danger"
    ? "text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
    : "text-neutral-500 hover:border-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
    
  return (
    <button 
      type="button" 
      onClick={disabled || loading ? undefined : handleClick} 
      title={label} 
      aria-label={label} 
      disabled={disabled || loading} 
      className={base + " " + look}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" strokeWidth={2} />
      )}
    </button>
  )
}

export function RowActions({ onDetail, onEdit, onDelete, deleteDisabled, deleteTitle, deleteLoading }) {
  return (
    <div className="flex justify-end gap-1">
      {onDetail && <IconButton onClick={onDetail} icon={Eye} label="Detail" />}
      {onEdit && <IconButton onClick={onEdit} icon={Pencil} label="Edit" />}
      {onDelete && (
        <IconButton 
          onClick={onDelete} 
          icon={Trash2} 
          label={deleteDisabled ? (deleteTitle || "Tidak bisa dihapus") : "Hapus"} 
          variant="danger" 
          disabled={deleteDisabled} 
          loading={deleteLoading}
        />
      )}
    </div>
  )
}

export function Toggle({ checked, onChange, loading: manualLoading }) {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = manualLoading || internalLoading

  const handleClick = async () => {
    if (onChange) {
      const result = onChange(!checked)
      if (result instanceof Promise) {
        setInternalLoading(true)
        try { await result } finally { setInternalLoading(false) }
      }
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={loading ? undefined : handleClick}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-neutral-900" : "bg-neutral-300"} ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${loading ? "scale-0" : checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      {loading && (
        <Loader2 className="absolute left-1/2 h-3 w-3 -translate-x-1/2 animate-spin text-white" />
      )}
    </button>
  )
}

export function Card({ title, subtitle, action, children }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {(title || subtitle || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function KpiCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700">
      {children}
    </span>
  )
}

export function useConfirm() {
  const [dialog, setDialog] = useState(null)

  const confirm = useCallback((message, options = {}) =>
    new Promise((resolve) => setDialog({ message, options, resolve }))
  , [])

  const handleClose = (result) => {
    setDialog((d) => { d?.resolve(result); return null })
  }

  const ConfirmModal = dialog ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => handleClose(false)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-4 p-6">
        {dialog.options?.title && (
          <h3 className="text-base font-semibold text-neutral-900">{dialog.options.title}</h3>
        )}
        <p className="text-sm text-neutral-600 leading-relaxed">{dialog.message}</p>
        <div className="flex justify-end gap-2.5 pt-1">
          {!dialog.options?.hideCancel && (
            <Button
              variant="secondary"
              onClick={() => handleClose(false)}
            >
              Batal
            </Button>
          )}
          <Button
            autoFocus
            variant={dialog.options?.variant === "danger" ? "danger" : "primary"}
            onClick={() => handleClose(true)}
          >
            {dialog.options?.confirmLabel ?? (dialog.options?.hideCancel ? "OK" : "Ya, Lanjutkan")}
          </Button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, ConfirmModal }
}
