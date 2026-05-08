"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, ShieldCheck, Shield, User } from "lucide-react"
import { addUser, updateUser, deleteUser, toggleAktifUser } from "@/actions/user"
import { Card, PageHeader, PrimaryButton, RowActions, Field, FormActions, Toggle, inputCls, useConfirm } from "@/components/ui"
import DataTable from "@/components/DataTable"
import Modal from "@/components/Modal"

const ROLE_LABELS = { superadmin: "Super Admin", admin: "Admin", staff: "Staff" }
const ROLE_COLORS = {
  superadmin: "bg-purple-50 text-purple-700 border-purple-200",
  admin:      "bg-blue-50   text-blue-700   border-blue-200",
  staff:      "bg-neutral-50 text-neutral-600 border-neutral-200",
}
const ROLE_ICONS = { superadmin: ShieldCheck, admin: Shield, staff: User }

function RoleBadge({ role }) {
  const Icon = ROLE_ICONS[role] || User
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] || ROLE_COLORS.staff}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {ROLE_LABELS[role] || role}
    </span>
  )
}

const EMPTY_FORM = { username: "", name: "", password: "", role: "staff" }

function SkeletonText({ w = "w-24" }) {
  return <div className={`h-3.5 ${w} animate-pulse rounded bg-neutral-200`} />
}

export default function PenggunaPage({ users, currentUserId, currentUserRole }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [localList, setLocalList] = useState(users)
  const [mode, setMode]       = useState(null) // "add" | "edit"
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  useEffect(() => { setLocalList(users) }, [users])

  const upsertLocal = (record) => {
    if (!record?.id) return
    setLocalList((prev) =>
      prev.some((r) => r.id === record.id)
        ? prev.map((r) => r.id === record.id ? record : r)
        : [record, ...prev]
    )
  }
  const removeLocal = (id) => setLocalList((prev) => prev.filter((r) => r.id !== id))

  const isSuperadmin = currentUserRole === "superadmin"

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError("")
    setMode("add")
  }

  const openEdit = (u) => {
    setEditing(u)
    setForm({ username: u.username, name: u.name || "", password: "", role: u.role })
    setError("")
    setMode("edit")
  }

  const close = () => { setMode(null); setEditing(null); setError("") }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username.trim()) return setError("Username wajib diisi.")
    if (mode === "add" && !form.password) return setError("Password wajib diisi.")
    const capturedForm = { ...form }
    const capturedEditing = editing
    if (mode === "add") {
      const tempId = `temp-${Date.now()}`
      upsertLocal({ id: tempId, username: capturedForm.username, name: capturedForm.name, role: capturedForm.role, aktif: true, _pending: true })
      close()
      addUser(capturedForm)
        .then(() => router.refresh())
        .catch(async (err) => {
          removeLocal(tempId)
          await confirm(err.message?.includes("Unique") ? "Username sudah digunakan." : "Terjadi kesalahan.", { title: "Gagal Tambah", hideCancel: true })
        })
    } else {
      upsertLocal({ ...capturedEditing, ...capturedForm, _pending: true })
      close()
      updateUser(capturedEditing.id, capturedForm)
        .then(() => router.refresh())
        .catch(async (err) => {
          upsertLocal({ ...capturedEditing, _pending: false })
          await confirm(err.message?.includes("Unique") ? "Username sudah digunakan." : "Terjadi kesalahan.", { title: "Gagal Edit", hideCancel: true })
        })
    }
  }

  const handleToggleAktif = (u) => {
    setLocalList((prev) => prev.map((r) => r.id === u.id ? { ...r, aktif: !r.aktif } : r))
    toggleAktifUser(u.id).catch(() => {
      setLocalList((prev) => prev.map((r) => r.id === u.id ? { ...r, aktif: !r.aktif } : r))
    })
  }

  const handleDelete = async (u) => {
    if (u.id === currentUserId) return
    const ok = await confirm(`Hapus pengguna "${u.username}"?`, {
      title: "Hapus Pengguna",
      variant: "danger",
      confirmLabel: "Ya, Hapus",
    })
    if (!ok) return
    removeLocal(u.id)
    deleteUser(u.id).catch(async (error) => {
      upsertLocal(u)
      await confirm(error?.message || "Gagal menghapus pengguna.", { title: "Gagal Hapus", hideCancel: true })
    })
  }

  const roleOptions = [
    { v: "superadmin", l: "Super Admin" },
    { v: "admin",      l: "Admin"       },
    { v: "staff",      l: "Staff"       },
  ]

  const cols = [
    {
      key: "name",
      label: "Nama",
      render: (u) => u._pending ? <SkeletonText w="w-28" /> : (
        <div>
          <div className="text-sm font-medium text-neutral-900">{u.name || u.username}</div>
          {u.name && <div className="text-xs text-neutral-400">@{u.username}</div>}
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (u) => u._pending ? <SkeletonText w="w-20" /> : <RoleBadge role={u.role} />,
    },
    {
      key: "aktif",
      label: "Aktif",
      align: "center",
      render: (u) => u._pending ? <SkeletonText w="w-8" /> : (
        <Toggle
          checked={u.aktif}
          onChange={() => handleToggleAktif(u)}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      render: (u) => {
        if (u._pending) return (
          <div className="flex items-center justify-end gap-2 pr-1">
            <svg className="h-4 w-4 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-xs text-neutral-400">Menyimpan...</span>
          </div>
        )
        return (
          <RowActions
            onEdit={() => openEdit(u)}
            onDelete={() => { handleDelete(u) }}
            deleteDisabled={u.id === currentUserId}
            deleteTitle="Tidak bisa menghapus akun sendiri"
          />
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengguna"
        subtitle={`${users.length} pengguna terdaftar.`}
        action={
          <PrimaryButton onClick={openAdd} icon={Plus}>Tambah Pengguna</PrimaryButton>
        }
      />

      <Card>
        <DataTable rows={localList} columns={cols} empty="Belum ada pengguna." />
      </Card>

      {ConfirmModal}

      {mode && (
        <Modal title={mode === "add" ? "Tambah Pengguna" : "Edit Pengguna"} onClose={close}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username">
              <input
                type="text"
                value={form.username}
                onChange={set("username")}
                placeholder="contoh: budi123"
                className={inputCls}
                required
                autoFocus
              />
            </Field>
            <Field label="Nama Lengkap">
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="Nama tampilan (opsional)"
                className={inputCls}
              />
            </Field>
            <Field label={mode === "edit" ? "Password Baru (kosongkan jika tidak diubah)" : "Password"}>
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder={mode === "edit" ? "Biarkan kosong jika tidak diubah" : "Minimal 6 karakter"}
                className={inputCls}
                required={mode === "add"}
              />
            </Field>
            <Field label="Role">
              <div className="relative">
                <select value={form.role} onChange={set("role")} className={inputCls + " appearance-none pr-8"}>
                  {roleOptions.map((r) => (
                    <option key={r.v} value={r.v}>{r.l}</option>
                  ))}
                </select>
              </div>
            </Field>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <FormActions
              onCancel={close}
              disabled={loading}
              loading={loading}
              submitLabel={mode === "add" ? "Tambah" : "Simpan"}
            />
          </form>
        </Modal>
      )}
    </div>
  )
}
