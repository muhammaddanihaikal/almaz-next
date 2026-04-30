"use client"

import { useState } from "react"
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

export default function PenggunaPage({ users, currentUserId, currentUserRole }) {
  const router = useRouter()
  const { confirm, ConfirmModal } = useConfirm()
  const [mode, setMode]       = useState(null) // "add" | "edit"
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const [deletingId, setDeletingId] = useState(null)

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
    setLoading(true)
    setError("")
    try {
      if (mode === "add") {
        await addUser(form)
      } else {
        await updateUser(editing.id, form)
      }
      close()
      router.refresh()
    } catch (err) {
      setError(err.message?.includes("Unique") ? "Username sudah digunakan." : "Terjadi kesalahan.")
    } finally {
      setLoading(false)
    }
  }

  const handleToggleAktif = async (u) => {
    await toggleAktifUser(u.id)
    router.refresh()
  }

  const handleDelete = async (u) => {
    if (u.id === currentUserId) return
    const ok = await confirm(`Hapus pengguna "${u.username}"?`, {
      title: "Hapus Pengguna",
      variant: "danger",
      confirmLabel: "Ya, Hapus",
    })
    if (!ok) return
    
    setDeletingId(u.id)
    try {
      await deleteUser(u.id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
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
      render: (u) => (
        <div>
          <div className="text-sm font-medium text-neutral-900">{u.name || u.username}</div>
          {u.name && <div className="text-xs text-neutral-400">@{u.username}</div>}
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (u) => <RoleBadge role={u.role} />,
    },
    {
      key: "aktif",
      label: "Aktif",
      align: "center",
      render: (u) => (
        <Toggle
          checked={u.aktif}
          onChange={() => handleToggleAktif(u)}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      render: (u) => (
        <RowActions
          onEdit={() => openEdit(u)}
          onDelete={() => { handleDelete(u) }}
          deleteDisabled={u.id === currentUserId}
          deleteTitle="Tidak bisa menghapus akun sendiri"
          deleteLoading={deletingId === u.id}
        />
      ),
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
        <DataTable rows={users} columns={cols} empty="Belum ada pengguna." />
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
