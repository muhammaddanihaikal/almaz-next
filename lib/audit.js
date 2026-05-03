import { prisma } from "@/lib/db"

export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
}

export const AUDIT_ENTITY = {
  SESI_HARIAN: "SesiHarian",
  TITIP_JUAL:  "TitipJual",
  PENGELUARAN: "Pengeluaran",
  ROKOK:       "Rokok",
}

/**
 * Catat perubahan data ke AuditLog.
 * Selalu dipanggil di dalam transaction yang sama agar atomik.
 *
 * @param {object} opts
 * @param {object}  opts.tx          - Prisma transaction client
 * @param {string}  opts.entity_type - Gunakan AUDIT_ENTITY konstanta
 * @param {string}  opts.entity_id   - ID record yang diubah
 * @param {string}  opts.action      - Gunakan AUDIT_ACTION konstanta
 * @param {object}  [opts.old_values] - Nilai sebelum perubahan
 * @param {object}  [opts.new_values] - Nilai setelah perubahan
 * @param {string}  [opts.alasan]    - Alasan perubahan (wajib untuk UPDATE/DELETE)
 * @param {string}  [opts.user_id]   - ID user yang melakukan aksi
 * @param {string}  [opts.user_name] - Nama user (disimpan langsung)
 */
export async function logAudit({ tx, entity_type, change_type, entity_id, action, old_values, new_values, alasan, user_id, user_name }) {
  const db = tx || prisma
  let finalUserId = (user_id && user_id !== "null" && user_id !== "undefined") ? user_id : null
  if (finalUserId) {
    const user = await db.user.findUnique({ where: { id: finalUserId }, select: { id: true } })
    if (!user) finalUserId = null
  }

  await db.auditLog.create({
    data: {
      entity_type,
      change_type: change_type ?? null,
      entity_id,
      action,
      old_values: old_values ?? null,
      new_values: new_values ?? null,
      alasan:     alasan    ?? null,
      user_id:    finalUserId,
      user_name:  user_name ?? null,
    },
  })
}
