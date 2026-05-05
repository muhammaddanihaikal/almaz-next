"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

const include = {
  sesi:        { include: { sales: true } },
  sesiSelesai: { include: { sales: true } },
  itemsMasuk:  { include: { rokok: true } },
  itemsKeluar: { include: { rokok: true } },
}

function serialize(t) {
  const totalMasuk  = t.itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const totalKeluar = t.itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  return {
    id:              t.id,
    tanggal:         t.tanggal.toISOString().split("T")[0],
    tanggal_selesai: t.tanggal_selesai ? t.tanggal_selesai.toISOString().split("T")[0] : null,
    sesi_id:         t.sesi_id,
    sesi_selesai_id: t.sesi_selesai_id,
    sales_id:        t.sesi?.sales_id ?? null,
    nama_sales:      t.sesi?.sales?.nama ?? "-",
    status:          t.status,
    kategori:        t.kategori || "grosir",
    selisih_uang:    t.selisih_uang,
    catatan:         t.catatan || "",
    createdAt:       t.createdAt.toISOString(),
    totalMasuk,
    totalKeluar,
    itemsMasuk: t.itemsMasuk
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
        qty: it.qty, harga_satuan: it.harga_satuan,
      })),
    itemsKeluar: t.itemsKeluar
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
        qty: it.qty, harga_satuan: it.harga_satuan,
      })),
  }
}

// ─── PUBLIC: TRACKING (HALAMAN /tukar-barang) ──────────────────────────────────

export async function getTukarBarangList() {
  const rows = await prisma.tukarBarang.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function getTukarBarangAktifCount() {
  return prisma.tukarBarang.count({ where: { status: "aktif" } })
}

export async function getTukarBarangAktifBySalesId(sales_id) {
  const rows = await prisma.tukarBarang.findMany({
    where: { status: "aktif", sesi: { sales_id } },
    include,
    orderBy: { tanggal: "asc" },
  })
  return rows.map(serialize)
}

export async function deleteTukarBarang(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.tukarBarang.findUnique({
      where: { id },
      include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } }, sesi: { include: { sales: true } } },
    })
    if (!old) return

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Hapus Tukar Barang",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values: {
        tanggal:         old.tanggal.toISOString().split("T")[0],
        tanggal_selesai: old.tanggal_selesai ? old.tanggal_selesai.toISOString().split("T")[0] : null,
        status:          old.status,
        sales:           old.sesi?.sales?.nama,
        itemsMasuk:      old.itemsMasuk.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        itemsKeluar:     old.itemsKeluar.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        selisih_uang:    old.selisih_uang,
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })

    for (const it of old.itemsMasuk) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: old.tanggal, jenis: 'out', qty: it.qty,
        source: MUTATION_SOURCE.REVERT, reference_id: id,
        keterangan: "Revert tukar barang masuk (delete)",
        user_id: session?.user?.id,
      })
    }
    if (old.status === "selesai") {
      for (const it of old.itemsKeluar) {
        if (it.qty > 0) {
          await mutateStock({
            tx,
            rokok_id: it.rokok_id, tanggal: old.tanggal_selesai || old.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert tukar barang keluar (delete)",
            user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }
    }
    await tx.tukarBarang.delete({ where: { id } })
  })

  revalidatePath("/tukar-barang")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

// ─── INTERNAL: DIPANGGIL DARI submitLaporanSore ─────────────────────────────────

/**
 * Buat tukar barang baru dari dalam sesi sore.
 * - itemsMasuk (B dari toko) → mutasi in (tukar_masuk)
 * - itemsKeluar (A planned) → tidak ada mutasi (akan di-handle implicit oleh distribusi-vs-barangKembali)
 * - selisih_uang ≥ 0 (toko bayar tambahan, atau setara)
 *
 * Status:
 * - Kalau dipanggil dengan flag `langsungSelesai = true` (semua A langsung diserahkan hari-1):
 *   status = "selesai", sesi_selesai_id = sesi_id, tanggal_selesai = sesi.tanggal
 * - Else status = "aktif"
 */
export async function createTukarBarangInSesi(tx, sesi, data, session, langsungSelesai = false) {
  const itemsMasuk  = (data.itemsMasuk  || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
  const itemsKeluar = (data.itemsKeluar || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
  if (itemsMasuk.length === 0)  throw new Error("Minimal 1 rokok dari toko harus diisi.")
  if (langsungSelesai && itemsKeluar.length === 0) throw new Error("Tukar Selesai: Barang pengganti harus diisi.")

  const totalMasuk  = itemsMasuk.reduce((s, it)  => s + Number(it.qty) * Number(it.harga_satuan || 0), 0)
  const totalKeluar = itemsKeluar.reduce((s, it) => s + Number(it.qty) * Number(it.harga_satuan || 0), 0)
  const selisih = totalKeluar - totalMasuk

  const tukar = await tx.tukarBarang.create({
    data: {
      tanggal:         new Date(sesi.tanggal),
      sesi_id:         sesi.id,
      status:          langsungSelesai ? "selesai" : "aktif",
      kategori:        data.kategori || "grosir",
      tanggal_selesai: langsungSelesai ? new Date(sesi.tanggal) : null,
      sesi_selesai_id: langsungSelesai ? sesi.id : null,
      selisih_uang:    selisih,
      catatan:         data.catatan ? String(data.catatan).trim() : null,
      itemsMasuk: {
        create: itemsMasuk.map((it) => ({
          rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan),
        })),
      },
      itemsKeluar: {
        create: itemsKeluar.map((it) => ({
          rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan),
        })),
      },
    },
  })

  for (const it of itemsMasuk) {
    await mutateStock({
      tx,
      rokok_id: it.rokok_id,
      tanggal:  sesi.tanggal,
      jenis:    'in',
      qty:      Number(it.qty),
      source:   MUTATION_SOURCE.TUKAR_MASUK,
      reference_id: tukar.id,
      user_id:  session?.user?.id,
    })
  }
  if (langsungSelesai) {
    for (const it of itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal:  sesi.tanggal,
        jenis:    'out',
        qty:      Number(it.qty),
        source:   MUTATION_SOURCE.TUKAR_KELUAR,
        reference_id: tukar.id,
        user_id:  session?.user?.id,
      })
    }
  }

  await logAudit({
    tx,
    entity_type: AUDIT_ENTITY.TUKAR_BARANG,
    change_type: langsungSelesai ? "Buat & Selesaikan Tukar Barang" : "Buat Tukar Barang (aktif)",
    entity_id:   tukar.id,
    action:      AUDIT_ACTION.CREATE,
    new_values: {
      tanggal:      tukar.tanggal.toISOString().split("T")[0],
      status:       tukar.status,
      itemsMasuk:   itemsMasuk.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan) })),
      itemsKeluar:  itemsKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan) })),
      selisih_uang: selisih,
      catatan:      tukar.catatan,
    },
    user_id:   session?.user?.id,
    user_name: session?.user?.name,
  })

  return tukar
}

/**
 * Selesaikan tukar barang yang masih aktif (dipanggil dari laporan sore hari-N).
 * TUKAR_KELUAR OUT untuk itemsKeluar — rokok A keluar gudang ke toko.
 */
export async function selesaikanTukarBarangInSesi(tx, sesi, tukar_id, session) {
  const tukar = await tx.tukarBarang.findUnique({
    where: { id: tukar_id },
    include: { itemsKeluar: true },
  })
  if (!tukar) throw new Error("Data tukar barang tidak ditemukan.")
  if (tukar.status === "selesai") throw new Error("Tukar barang sudah selesai sebelumnya.")

  await tx.tukarBarang.update({
    where: { id: tukar_id },
    data: {
      status:          "selesai",
      tanggal_selesai: new Date(sesi.tanggal),
      sesi_selesai_id: sesi.id,
    },
  })

  for (const it of tukar.itemsKeluar) {
    if (it.qty > 0) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal:  sesi.tanggal,
        jenis:    'out',
        qty:      it.qty,
        source:   MUTATION_SOURCE.TUKAR_KELUAR,
        reference_id: tukar_id,
        user_id:  session?.user?.id,
      })
    }
  }

  await logAudit({
    tx,
    entity_type: AUDIT_ENTITY.TUKAR_BARANG,
    change_type: "Selesaikan Tukar Barang",
    entity_id:   tukar_id,
    action:      AUDIT_ACTION.UPDATE,
    new_values: {
      status:          "selesai",
      tanggal_selesai: new Date(sesi.tanggal).toISOString().split("T")[0],
      sesi_selesai_id: sesi.id,
    },
    user_id:   session?.user?.id,
    user_name: session?.user?.name,
  })
}

/**
 * Batalkan penyelesaian tukar barang (dipanggil saat edit/revert laporan sore).
 * Revert TUKAR_KELUAR OUT untuk itemsKeluar.
 */
export async function revertSelesaiTukarBarangInSesi(tx, tukar_id, session) {
  const tukar = await tx.tukarBarang.findUnique({
    where: { id: tukar_id },
    include: { itemsKeluar: true },
  })
  if (!tukar) return
  if (tukar.status !== "selesai") return

  for (const it of tukar.itemsKeluar) {
    if (it.qty > 0) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal:  tukar.tanggal_selesai || tukar.tanggal,
        jenis:    'in',
        qty:      it.qty,
        source:   MUTATION_SOURCE.REVERT,
        reference_id: tukar_id,
        keterangan: "Revert tukar keluar (batalkan penyelesaian)",
        user_id:  session?.user?.id,
        allowNegative: true,
      })
    }
  }

  await tx.tukarBarang.update({
    where: { id: tukar_id },
    data: { status: "aktif", tanggal_selesai: null, sesi_selesai_id: null },
  })

  await logAudit({
    tx,
    entity_type: AUDIT_ENTITY.TUKAR_BARANG,
    change_type: "Batalkan Penyelesaian Tukar Barang",
    entity_id:   tukar_id,
    action:      AUDIT_ACTION.UPDATE,
    new_values:  { status: "aktif" },
    user_id:     session?.user?.id,
    user_name:   session?.user?.name,
  })
}

export async function selesaikanTukarBarang(tukar_id, itemsKeluarData) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const tukar = await tx.tukarBarang.findUnique({
      where: { id: tukar_id },
      include: { itemsKeluar: true }
    })
    if (!tukar) throw new Error("Data tukar barang tidak ditemukan.")
    if (tukar.status === "selesai") throw new Error("Tukar barang sudah selesai sebelumnya.")

    const itemsKeluar = (itemsKeluarData || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
    if (itemsKeluar.length === 0) throw new Error("Minimal 1 rokok pengganti harus diisi.")

    await tx.tukarBarang.update({
      where: { id: tukar_id },
      data: {
        status: "selesai",
        tanggal_selesai: new Date(),
        itemsKeluar: {
          create: itemsKeluar.map((it) => ({
            rokok_id: it.rokok_id,
            qty: Number(it.qty),
            harga_satuan: Number(it.harga_satuan) || 0,
          }))
        }
      }
    })

    // Create mutasi stock out for itemsKeluar
    for (const it of itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: new Date(),
        jenis: 'out',
        qty: Number(it.qty),
        source: MUTATION_SOURCE.TUKAR_KELUAR,
        reference_id: tukar_id,
        user_id: session?.user?.id,
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Selesaikan Tukar Barang Manual",
      entity_id: tukar_id,
      action: AUDIT_ACTION.UPDATE,
      new_values: {
        status: "selesai",
        tanggal_selesai: new Date().toISOString().split("T")[0],
        itemsKeluar: itemsKeluar,
      },
      user_id: session?.user?.id,
      user_name: session?.user?.name,
    })
  })
  revalidatePath("/tukar-barang")
}

export async function editTukarBarangAktif(id, data, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.tukarBarang.findUnique({
      where: { id },
      include: { itemsMasuk: true }
    })
    if (!old) throw new Error("Data tidak ditemukan")
    if (old.status !== "aktif") throw new Error("Hanya bisa edit tukar barang yang masih aktif")

    // 1. Revert old stock (masuk -> out)
    for (const it of old.itemsMasuk) {
       await mutateStock({
        tx,
        rokok_id: it.rokok_id, 
        tanggal: old.tanggal, 
        jenis: 'out', 
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT, 
        reference_id: id,
        keterangan: "Revert tukar barang masuk (edit)",
        user_id: session?.user?.id,
        allowNegative: true
      })
    }

    // 2. Delete old items
    await tx.tukarBarangItemMasuk.deleteMany({ where: { tukar_id: id } })

    // 3. Create new items
    const itemsMasuk = data.itemsMasuk.filter(it => it.rokok_id && Number(it.qty) > 0)
    const totalMasuk = itemsMasuk.reduce((s, it) => s + Number(it.qty) * Number(it.harga_satuan), 0)

    await tx.tukarBarang.update({
      where: { id },
      data: {
        catatan: data.catatan ? String(data.catatan).trim() : null,
        itemsMasuk: {
          create: itemsMasuk.map(it => ({
            rokok_id: it.rokok_id,
            qty: Number(it.qty),
            harga_satuan: Number(it.harga_satuan)
          }))
        }
      }
    })

    // 4. Mutate new stock (masuk -> in)
    for (const it of itemsMasuk) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, 
        tanggal: old.tanggal, 
        jenis: 'in', 
        qty: Number(it.qty),
        source: MUTATION_SOURCE.TUKAR_MASUK, 
        reference_id: id,
        user_id: session?.user?.id
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Edit Tukar Barang Aktif",
      entity_id: id,
      action: AUDIT_ACTION.UPDATE,
      new_values: { 
        catatan: data.catatan,
        itemsMasuk: itemsMasuk.map(it => ({ rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan }))
      },
      alasan,
      user_id: session?.user?.id,
      user_name: session?.user?.name
    })
  })
  revalidatePath("/tukar-barang")
}
