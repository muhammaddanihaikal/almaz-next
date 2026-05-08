"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { unstable_cache } from "next/cache"

// Daftar log audit untuk halaman Riwayat. Tidak mengikutsertakan
// old_values / new_values agar payload kecil; detail JSON di-fetch
// lazy via getAuditLogValues(id) saat user buka baris tertentu.
export async function getAuditLogs({ startDate, endDate, entity_type, user_id } = {}) {
  const session = await auth()
  if (!session?.user?.role || session.user.role === "staff") {
    throw new Error("Akses ditolak")
  }

  const where = {}

  if (startDate && endDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    where.createdAt = { gte: start, lte: end }
  }

  if (entity_type) where.entity_type = entity_type
  if (user_id)     where.user_id     = user_id

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id:          true,
      entity_type: true,
      change_type: true,
      entity_id:   true,
      action:      true,
      alasan:      true,
      user_id:     true,
      user_name:   true,
      createdAt:   true,
    },
  })

  // Format waktu ke WIB (UTC+7)
  return rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt.getTime() + 7 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
  }))
}

// Fetch hanya old_values & new_values untuk satu baris audit log.
// Dipanggil saat user expand baris di halaman Riwayat.
export async function getAuditLogValues(id) {
  const session = await auth()
  if (!session?.user?.role || session.user.role === "staff") {
    throw new Error("Akses ditolak")
  }
  const row = await prisma.auditLog.findUnique({
    where: { id },
    select: { old_values: true, new_values: true },
  })
  return row || { old_values: null, new_values: null }
}

// Distinct user_id pada tabel AuditLog cukup mahal saat tabel besar.
// Cache 5 menit; hasilnya cuma berubah ketika user baru pertama kali
// melakukan aksi yang dicatat — keterlambatan 5 menit di filter dropdown
// dapat diterima.
const _getAuditUsersCached = unstable_cache(
  async () => {
    const rows = await prisma.auditLog.findMany({
      where:    { user_name: { not: null } },
      select:   { user_id: true, user_name: true },
      distinct: ["user_id"],
      orderBy:  { user_name: "asc" },
    })
    return rows.map((r) => ({ id: r.user_id, name: r.user_name }))
  },
  ["audit-users"],
  { tags: ["audit-users"], revalidate: 300 }
)

export async function getAuditUsers() {
  const session = await auth()
  if (!session?.user?.role || session.user.role === "staff") {
    throw new Error("Akses ditolak")
  }
  return _getAuditUsersCached()
}
