"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"
import { getJakartaToday, fmtTanggal } from "@/lib/utils"

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 }

async function getSession() {
  const session = await auth()
  let userId = session?.user?.id
  if (!userId && session?.user?.name) {
    const u = await prisma.user.findFirst({
      where: { OR: [{ name: session.user.name }, { username: session.user.name }] },
    })
    userId = u?.id
  }
  return { userId, userName: session?.user?.name }
}

function dateOnly(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return getJakartaToday()
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/**
 * Buat sesi sample harian pagi.
 * items: [{ rokok_id, type: "cukai"|"biasa", qty_keluar }]
 */
export async function createSampleHarian(tanggal, items, catatan) {
  try {
    const { userId, userName } = await getSession()

    const valid = (items || []).filter((i) => i.rokok_id && Number(i.qty_keluar) > 0)
    if (valid.length === 0) throw new Error("Minimal satu produk dengan qty keluar > 0.")

    const targetDate = tanggal || getJakartaToday()
    const todayStr = getJakartaToday()
    const pureDateStr = dateOnly(targetDate)
    if (pureDateStr > todayStr) {
      throw new Error("Tidak dapat membuat sesi sample harian untuk tanggal besok / mendatang.")
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.sampleHarian.findFirst({
        where: { tanggal: new Date(`${pureDateStr}T00:00:00.000Z`) }
      })
      if (existing) {
        throw new Error(`Sesi sample harian untuk tanggal ${fmtTanggal(pureDateStr)} sudah ada. Satu hari hanya diperbolehkan satu sesi.`)
      }

      for (const item of valid) {
        const rokok = await tx.rokok.findUnique({
          where: { id: item.rokok_id },
          select: { nama: true, stok_sample_biasa: true, stok_sample_cukai: true },
        })
        if (!rokok) throw new Error(`Rokok tidak ditemukan.`)
        
        const stockField = item.type === "cukai" ? "stok_sample_cukai" : "stok_sample_biasa"
        const label = item.type === "cukai" ? "cukai" : "biasa"
        const currentStock = rokok[stockField] ?? 0
        
        if (currentStock < Number(item.qty_keluar)) {
          throw new Error(`Stok sample ${label} ${rokok.nama} tidak cukup. Stok: ${currentStock}, dibutuhkan: ${item.qty_keluar}.`)
        }
      }

      const sh = await tx.sampleHarian.create({
        data: {
          tanggal: new Date(`${pureDateStr}T00:00:00.000Z`),
          status:  "buka",
          catatan: catatan || null,
        },
      })

      for (const item of valid) {
        const qty = Number(item.qty_keluar)
        const type = item.type === "cukai" ? "cukai" : "biasa"

        await tx.sampleHarianItem.create({
          data: { 
            sample_harian_id: sh.id, 
            rokok_id: item.rokok_id, 
            type, 
            qty_keluar: qty, 
            qty_kembali: 0 
          },
        })

        const stock_type = type === "cukai" ? "sample_cukai" : "sample_biasa"

        await mutateStock({
          tx,
          rokok_id:     item.rokok_id,
          tanggal:      new Date(`${pureDateStr}T00:00:00.000Z`),
          jenis:        "out",
          qty,
          source:       MUTATION_SOURCE.SAMPLE_HARIAN_KELUAR,
          stock_type,
          reference_id: sh.id,
          keterangan:   `Sample harian ${type} keluar pagi`,
          user_id:      userId || null,
        })
      }

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SAMPLE_HARIAN,
        change_type: "Buat Sample Harian",
        entity_id:   sh.id,
        action:      AUDIT_ACTION.CREATE,
        new_values:  { tanggal: pureDateStr, items: valid.map((i) => ({ rokok_id: i.rokok_id, type: i.type, qty_keluar: i.qty_keluar })) },
        user_id:     userId,
        user_name:   userName,
      })
    }, TX_OPTIONS)

    revalidatePath("/sample-harian")
    return { success: true }
  } catch (error) {
    console.error("[createSampleHarian ERROR]", error)
    return { success: false, error: error?.message || "Gagal membuat sesi sample harian." }
  }
}

/**
 * Ubah/edit sesi sample harian.
 * items: [{ rokok_id, type: "cukai"|"biasa", qty_keluar }]
 */
export async function updateSampleHarian(id, tanggal, items, catatan, alasan) {
  try {
    const { userId, userName } = await getSession()

    const valid = (items || []).filter((i) => i.rokok_id && Number(i.qty_keluar) > 0)
    if (valid.length === 0) throw new Error("Minimal satu produk dengan qty keluar > 0.")

    const targetDate = tanggal || getJakartaToday()
    const todayStr = getJakartaToday()
    const pureDateStr = dateOnly(targetDate)
    if (pureDateStr > todayStr) {
      throw new Error("Tidak dapat mengubah tanggal sesi sample harian ke tanggal besok / mendatang.")
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.sampleHarian.findFirst({
        where: {
          tanggal: new Date(`${pureDateStr}T00:00:00.000Z`),
          id: { not: id }
        }
      })
      if (existing) {
        throw new Error(`Sesi sample harian untuk tanggal ${fmtTanggal(pureDateStr)} sudah ada.`)
      }

      const old = await tx.sampleHarian.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!old) throw new Error("Sample harian tidak ditemukan.")

      // 1. Revert old stock mutations
      for (const oldItem of old.items) {
        const stock_type = oldItem.type === "cukai" ? "sample_cukai" : "sample_biasa"
        await mutateStock({
          tx,
          rokok_id: oldItem.rokok_id,
          tanggal: old.tanggal,
          jenis: "in",
          qty: oldItem.qty_keluar,
          source: MUTATION_SOURCE.REVERT,
          stock_type,
          reference_id: id,
          keterangan: `Revert sample harian ${oldItem.type} keluar (edit)`,
          user_id: userId || null,
          allowNegative: true,
        })
        if (old.status === "selesai" && oldItem.qty_kembali > 0) {
          await mutateStock({
            tx,
            rokok_id: oldItem.rokok_id,
            tanggal: old.tanggal,
            jenis: "out",
            qty: oldItem.qty_kembali,
            source: MUTATION_SOURCE.REVERT,
            stock_type,
            reference_id: id,
            keterangan: `Revert sample harian ${oldItem.type} kembali (edit)`,
            user_id: userId || null,
            allowNegative: true,
          })
        }
      }

      // 2. Validate new stock sufficiency
      for (const item of valid) {
        const rokok = await tx.rokok.findUnique({
          where: { id: item.rokok_id },
          select: { nama: true, stok_sample_biasa: true, stok_sample_cukai: true },
        })
        if (!rokok) throw new Error(`Rokok tidak ditemukan.`)
        
        const stockField = item.type === "cukai" ? "stok_sample_cukai" : "stok_sample_biasa"
        const label = item.type === "cukai" ? "cukai" : "biasa"
        const currentStock = rokok[stockField] ?? 0
        
        if (currentStock < Number(item.qty_keluar)) {
          throw new Error(`Stok sample ${label} ${rokok.nama} tidak cukup. Stok: ${currentStock}, dibutuhkan: ${item.qty_keluar}.`)
        }
      }

      // 3. Update main record date & catatan
      await tx.sampleHarian.update({
        where: { id },
        data: {
          tanggal: new Date(`${pureDateStr}T00:00:00.000Z`),
          catatan: catatan || null,
        },
      })

    // 4. Delete old items and create new ones
    await tx.sampleHarianItem.deleteMany({ where: { sample_harian_id: id } })

    for (const item of valid) {
      const qty = Number(item.qty_keluar)
      const type = item.type === "cukai" ? "cukai" : "biasa"

      const oldItem = old.items.find((o) => o.rokok_id === item.rokok_id && o.type === type)
      let qtyKembali = 0
      if (oldItem && old.status === "selesai") {
        qtyKembali = Math.min(oldItem.qty_kembali, qty)
      }

      await tx.sampleHarianItem.create({
        data: {
          sample_harian_id: id,
          rokok_id: item.rokok_id,
          type,
          qty_keluar: qty,
          qty_kembali: qtyKembali,
        },
      })

      const stock_type = type === "cukai" ? "sample_cukai" : "sample_biasa"

      // Deduct new qty_keluar
      await mutateStock({
        tx,
        rokok_id:     item.rokok_id,
        tanggal:      new Date(`${pureDateStr}T00:00:00.000Z`),
        jenis:        "out",
        qty,
        source:       MUTATION_SOURCE.SAMPLE_HARIAN_KELUAR,
        stock_type,
        reference_id: id,
        keterangan:   `Sample harian ${type} keluar pagi (edit)`,
        user_id:      userId || null,
      })

      // Add back qty_kembali if completed
      if (old.status === "selesai" && qtyKembali > 0) {
        await mutateStock({
          tx,
          rokok_id:     item.rokok_id,
          tanggal:      new Date(`${pureDateStr}T00:00:00.000Z`),
          jenis:        "in",
          qty:          qtyKembali,
          source:       MUTATION_SOURCE.SAMPLE_HARIAN_KEMBALI,
          stock_type,
          reference_id: id,
          keterangan:   `Sample harian ${type} kembali sore (edit)`,
          user_id:      userId || null,
        })
      }
    }

    // 5. Audit Log
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SAMPLE_HARIAN,
      change_type: "Ubah Sample Harian",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  {
        tanggal: old.tanggal,
        catatan: old.catatan,
        items: old.items.map((i) => ({ rokok_id: i.rokok_id, type: i.type, qty_keluar: i.qty_keluar, qty_kembali: i.qty_kembali })),
      },
      new_values:  {
        tanggal: pureDateStr,
        catatan: catatan || null,
        items: valid.map((i) => ({ rokok_id: i.rokok_id, type: i.type, qty_keluar: i.qty_keluar })),
      },
      alasan: alasan || null,
      user_id:     userId,
      user_name:   userName,
    })
    }, TX_OPTIONS)
    
    revalidatePath("/sample-harian")
    return { success: true }
  } catch (error) {
    console.error("[updateSampleHarian ERROR]", error)
    return { success: false, error: error?.message || "Gagal mengubah sesi sample harian." }
  }
}

/**
 * Tutup sesi sample harian sore (catat sisa yang kembali).
 * items: [{ rokok_id, type: "cukai"|"biasa", qty_kembali }]
 */
export async function closeSampleHarian(id, items) {
  try {
    const { userId, userName } = await getSession()

    await prisma.$transaction(async (tx) => {
      const sh = await tx.sampleHarian.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!sh) throw new Error("Sample harian tidak ditemukan.")
      if (sh.status === "selesai") throw new Error("Sample harian sudah ditutup.")

      for (const upd of (items || [])) {
        const qtyKembali = Number(upd.qty_kembali)
        const type = upd.type === "cukai" ? "cukai" : "biasa"
        const existing = sh.items.find((i) => i.rokok_id === upd.rokok_id && i.type === type)
        if (!existing) continue
        if (qtyKembali > existing.qty_keluar) {
          throw new Error(`Qty kembali tidak boleh melebihi qty keluar (${existing.qty_keluar}).`)
        }

        await tx.sampleHarianItem.update({
          where: { id: existing.id },
          data: { qty_kembali: qtyKembali },
        })

        const stock_type = type === "cukai" ? "sample_cukai" : "sample_biasa"

        if (qtyKembali > 0) {
          await mutateStock({
            tx,
            rokok_id:     upd.rokok_id,
            tanggal:      sh.tanggal,
            jenis:        "in",
            qty:          qtyKembali,
            source:       MUTATION_SOURCE.SAMPLE_HARIAN_KEMBALI,
            stock_type,
            reference_id: id,
            keterangan:   `Sample harian ${type} kembali sore`,
            user_id:      userId || null,
          })
        }
      }

      await tx.sampleHarian.update({ where: { id }, data: { status: "selesai" } })

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SAMPLE_HARIAN,
        change_type: "Tutup Sample Harian",
        entity_id:   id,
        action:      AUDIT_ACTION.UPDATE,
        new_values:  { status: "selesai", items: (items || []).map((i) => ({ rokok_id: i.rokok_id, type: i.type, qty_kembali: i.qty_kembali })) },
        user_id:     userId,
        user_name:   userName,
      })
    }, TX_OPTIONS)

    revalidatePath("/sample-harian")
    return { success: true }
  } catch (error) {
    console.error("[closeSampleHarian ERROR]", error)
    return { success: false, error: error?.message || "Gagal menutup sesi sample harian." }
  }
}

/**
 * Hapus sample harian dan revert stok net (keluar - kembali).
 */
export async function deleteSampleHarian(id, alasan) {
  try {
    const { userId, userName } = await getSession()

    await prisma.$transaction(async (tx) => {
      const sh = await tx.sampleHarian.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!sh) throw new Error("Sample harian tidak ditemukan.")

      for (const item of sh.items) {
        const net = item.qty_keluar - item.qty_kembali
        if (net > 0) {
          const stock_type = item.type === "cukai" ? "sample_cukai" : "sample_biasa"
          await mutateStock({
            tx,
            rokok_id:     item.rokok_id,
            tanggal:      sh.tanggal,
            jenis:        "in",
            qty:          net,
            source:       MUTATION_SOURCE.REVERT,
            stock_type,
            reference_id: id,
            keterangan:   `Revert sample harian ${item.type} (dihapus)`,
            user_id:      userId || null,
            allowNegative: true,
          })
        }
      }

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SAMPLE_HARIAN,
        change_type: "Hapus Sample Harian",
        entity_id:   id,
        action:      AUDIT_ACTION.DELETE,
        old_values:  { tanggal: sh.tanggal, status: sh.status },
        alasan,
        user_id:     userId,
        user_name:   userName,
      })

      await tx.sampleHarian.delete({ where: { id } })
    }, TX_OPTIONS)

    revalidatePath("/sample-harian")
    return { success: true }
  } catch (error) {
    console.error("[deleteSampleHarian ERROR]", error)
    return { success: false, error: error?.message || "Gagal menghapus sesi sample harian." }
  }
}

export async function getSampleHarianList() {
  const rows = await prisma.sampleHarian.findMany({
    orderBy: { tanggal: "desc" },
    include: {
      items: {
        include: { rokok: { select: { nama: true } } },
        orderBy: { rokok: { urutan: "asc" } },
      },
    },
  })
  return rows.map((sh) => ({
    id:       sh.id,
    tanggal:  sh.tanggal.toISOString().split("T")[0],
    status:   sh.status,
    catatan:  sh.catatan,
    items: sh.items.map((i) => ({
      id:          i.id,
      rokok_id:    i.rokok_id,
      rokok:       i.rokok.nama,
      type:        i.type,
      qty_keluar:  i.qty_keluar,
      qty_kembali: i.qty_kembali,
    })),
  }))
}

/**
 * Ubah/edit laporan sample harian sore (edit qty kembali).
 */
export async function updateSampleHarianReport(id, items) {
  try {
    const { userId, userName } = await getSession()

    await prisma.$transaction(async (tx) => {
      const sh = await tx.sampleHarian.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!sh) throw new Error("Sample harian tidak ditemukan.")
      if (sh.status !== "selesai") throw new Error("Sample harian belum selesai.")

      for (const upd of (items || [])) {
        const qtyKembali = Number(upd.qty_kembali)
        const type = upd.type === "cukai" ? "cukai" : "biasa"
        const existing = sh.items.find((i) => i.rokok_id === upd.rokok_id && i.type === type)
        if (!existing) continue
        if (qtyKembali > existing.qty_keluar) {
          throw new Error(`Qty kembali tidak boleh melebihi qty keluar (${existing.qty_keluar}).`)
        }

        const stock_type = type === "cukai" ? "sample_cukai" : "sample_biasa"

        // 1. Revert old qty_kembali (if it was > 0, deduct it out of stock)
        if (existing.qty_kembali > 0) {
          await mutateStock({
            tx,
            rokok_id:     upd.rokok_id,
            tanggal:      sh.tanggal,
            jenis:        "out",
            qty:          existing.qty_kembali,
            source:       MUTATION_SOURCE.REVERT,
            stock_type,
            reference_id: id,
            keterangan:   `Revert sample harian ${type} kembali (edit laporan)`,
            user_id:      userId || null,
            allowNegative: true,
          })
        }

        // 2. Update record
        await tx.sampleHarianItem.update({
          where: { id: existing.id },
          data: { qty_kembali: qtyKembali },
        })

        // 3. Apply new qty_kembali (if > 0, add it to stock)
        if (qtyKembali > 0) {
          await mutateStock({
            tx,
            rokok_id:     upd.rokok_id,
            tanggal:      sh.tanggal,
            jenis:        "in",
            qty:          qtyKembali,
            source:       MUTATION_SOURCE.SAMPLE_HARIAN_KEMBALI,
            stock_type,
            reference_id: id,
            keterangan:   `Sample harian ${type} kembali sore (edit laporan)`,
            user_id:      userId || null,
          })
        }
      }

      await logAudit({
        tx,
        entity_type: AUDIT_ENTITY.SAMPLE_HARIAN,
        change_type: "Ubah Laporan Sample Harian",
        entity_id:   id,
        action:      AUDIT_ACTION.UPDATE,
        new_values:  { items: (items || []).map((i) => ({ rokok_id: i.rokok_id, type: i.type, qty_kembali: i.qty_kembali })) },
        user_id:     userId,
        user_name:   userName,
      })
    }, TX_OPTIONS)

    revalidatePath("/sample-harian")
    return { success: true }
  } catch (error) {
    console.error("[updateSampleHarianReport ERROR]", error)
    return { success: false, error: error?.message || "Gagal mengubah laporan sample harian." }
  }
}
