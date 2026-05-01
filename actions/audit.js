"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

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
  })

  // Format waktu ke WIB (UTC+7)
  return rows.map((r) => ({
    id:          r.id,
    entity_type: r.entity_type,
    change_type: r.change_type,
    entity_id:   r.entity_id,
    action:      r.action,
    old_values:  r.old_values,
    new_values:  r.new_values,
    alasan:      r.alasan,
    user_id:     r.user_id,
    user_name:   r.user_name,
    createdAt:   new Date(r.createdAt.getTime() + 7 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19),
  }))
}

export async function getAuditUsers() {
  const session = await auth()
  if (!session?.user?.role || session.user.role === "staff") {
    throw new Error("Akses ditolak")
  }
  const rows = await prisma.auditLog.findMany({
    where:    { user_name: { not: null } },
    select:   { user_id: true, user_name: true },
    distinct: ["user_id"],
    orderBy:  { user_name: "asc" },
  })
  return rows.map(r => ({ id: r.user_id, name: r.user_name }))
}
