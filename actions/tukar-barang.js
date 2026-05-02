"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

const include = {
  toko:        true,
  sesi:        { include: { sales: true } },
  itemsMasuk:  { include: { rokok: true } },
  itemsKeluar: { include: { rokok: true } },
}

function serialize(t) {
  const totalMasuk  = t.itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const totalKeluar = t.itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  return {
    id:        t.id,
    tanggal:   t.tanggal.toISOString().split("T")[0],
    sesi_id:   t.sesi_id,
    toko_id:   t.toko_id,
    nama_toko: t.toko.nama,
    sales_id:  t.sesi?.sales_id ?? null,
    nama_sales: t.sesi?.sales?.nama ?? "-",
    selisih_uang: t.selisih_uang,
    catatan:   t.catatan || "",
    pengeluaran_id: t.pengeluaran_id,
    createdAt: t.createdAt.toISOString(),
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

function validateInput(data) {
  if (!data.tanggal) throw new Error("Tanggal wajib diisi.")
  if (!data.sesi_id) throw new Error("Sesi sales hari itu wajib dipilih.")
  if (!data.toko_id) throw new Error("Toko wajib dipilih.")
  const itemsMasuk  = (data.itemsMasuk  || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
  const itemsKeluar = (data.itemsKeluar || []).filter((it) => it.rokok_id && Number(it.qty) > 0)
  if (itemsMasuk.length === 0)  throw new Error("Minimal 1 rokok dari toko harus diisi.")
  if (itemsKeluar.length === 0) throw new Error("Minimal 1 rokok dari sales harus diisi.")
  for (const it of itemsMasuk) {
    if (Number(it.harga_satuan) < 0) throw new Error("Harga rokok dari toko tidak boleh negatif.")
  }
  for (const it of itemsKeluar) {
    if (Number(it.harga_satuan) < 0) throw new Error("Harga rokok dari sales tidak boleh negatif.")
  }
  return {
    tanggal:     data.tanggal,
    sesi_id:     data.sesi_id,
    toko_id:     data.toko_id,
    catatan:     data.catatan ? String(data.catatan).trim() : null,
    itemsMasuk:  itemsMasuk.map((it) => ({
      rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan),
    })),
    itemsKeluar: itemsKeluar.map((it) => ({
      rokok_id: it.rokok_id, qty: Number(it.qty), harga_satuan: Number(it.harga_satuan),
    })),
  }
}

function hitungSelisih(itemsMasuk, itemsKeluar) {
  const totalMasuk  = itemsMasuk.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  const totalKeluar = itemsKeluar.reduce((s, it) => s + it.qty * it.harga_satuan, 0)
  // Selisih = nilai rokok yang sales kasih ke toko - nilai rokok dari toko
  // > 0 berarti rokok sales lebih mahal → toko bayar tambahan
  // < 0 berarti rokok toko lebih mahal → sales kasih kembalian
  return totalKeluar - totalMasuk
}

export async function getTukarBarangList() {
  const rows = await prisma.tukarBarang.findMany({ include, orderBy: { tanggal: "desc" } })
  return rows.map(serialize)
}

export async function getSesiAktifHariIni(tanggal) {
  const tgl = new Date(tanggal)
  const rows = await prisma.sesiHarian.findMany({
    where: { tanggal: tgl },
    include: { sales: true },
    orderBy: { createdAt: "asc" },
  })
  return rows.map((s) => ({
    id:       s.id,
    tanggal:  s.tanggal.toISOString().split("T")[0],
    sales_id: s.sales_id,
    sales:    s.sales.nama,
    status:   s.status,
  }))
}

export async function addTukarBarang(data) {
  const session = await auth()
  const v = validateInput(data)
  const selisih = hitungSelisih(v.itemsMasuk, v.itemsKeluar)

  await prisma.$transaction(async (tx) => {
    const sesi = await tx.sesiHarian.findUnique({
      where: { id: v.sesi_id },
      include: { sales: true },
    })
    if (!sesi) throw new Error("Sesi sales tidak ditemukan.")

    const toko = await tx.toko.findUnique({ where: { id: v.toko_id } })
    if (!toko) throw new Error("Toko tidak ditemukan.")

    let pengeluaran_id = null
    if (selisih < 0) {
      const peng = await tx.pengeluaran.create({
        data: {
          tanggal:    new Date(v.tanggal),
          jumlah:     Math.abs(selisih),
          keterangan: `Kembalian tukar barang - ${toko.nama} (sales ${sesi.sales.nama})`,
          sumber:     "penjualan",
        },
      })
      pengeluaran_id = peng.id
    }

    const tukar = await tx.tukarBarang.create({
      data: {
        tanggal:        new Date(v.tanggal),
        sesi_id:        v.sesi_id,
        toko_id:        v.toko_id,
        selisih_uang:   selisih,
        catatan:        v.catatan,
        pengeluaran_id,
        itemsMasuk: {
          create: v.itemsMasuk.map((it) => ({
            rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan,
          })),
        },
        itemsKeluar: {
          create: v.itemsKeluar.map((it) => ({
            rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan,
          })),
        },
      },
    })

    for (const it of v.itemsMasuk) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal:  v.tanggal,
        jenis:    'in',
        qty:      it.qty,
        source:   MUTATION_SOURCE.TUKAR_MASUK,
        reference_id: tukar.id,
        user_id:  session?.user?.id,
      })
    }
    for (const it of v.itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal:  v.tanggal,
        jenis:    'out',
        qty:      it.qty,
        source:   MUTATION_SOURCE.TUKAR_KELUAR,
        reference_id: tukar.id,
        user_id:  session?.user?.id,
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Tambah Tukar Barang",
      entity_id:   tukar.id,
      action:      AUDIT_ACTION.CREATE,
      new_values: {
        tanggal:      v.tanggal,
        toko:         toko.nama,
        sales:        sesi.sales.nama,
        itemsMasuk:   v.itemsMasuk.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan })),
        itemsKeluar:  v.itemsKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan })),
        selisih_uang: selisih,
        catatan:      v.catatan,
      },
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })

  revalidatePath("/tukar-barang")
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function updateTukarBarang(id, data, alasan) {
  const session = await auth()
  const v = validateInput(data)
  const selisihBaru = hitungSelisih(v.itemsMasuk, v.itemsKeluar)

  await prisma.$transaction(async (tx) => {
    const old = await tx.tukarBarang.findUnique({
      where: { id },
      include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } }, toko: true, sesi: { include: { sales: true } } },
    })
    if (!old) throw new Error("Data tukar barang tidak ditemukan.")

    // Revert stok lama
    for (const it of old.itemsMasuk) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: v.tanggal, jenis: 'out', qty: it.qty,
        source: MUTATION_SOURCE.REVERT, reference_id: id,
        keterangan: "Revert tukar barang masuk (edit)",
        user_id: session?.user?.id,
      })
    }
    for (const it of old.itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: v.tanggal, jenis: 'in', qty: it.qty,
        source: MUTATION_SOURCE.REVERT, reference_id: id,
        keterangan: "Revert tukar barang keluar (edit)",
        user_id: session?.user?.id,
      })
    }
    await tx.tukarBarangItemMasuk.deleteMany({ where: { tukar_id: id } })
    await tx.tukarBarangItemKeluar.deleteMany({ where: { tukar_id: id } })

    // Hapus pengeluaran lama jika ada
    if (old.pengeluaran_id) {
      await tx.pengeluaran.delete({ where: { id: old.pengeluaran_id } }).catch(() => null)
    }

    // Buat pengeluaran baru jika selisih baru < 0
    let pengeluaran_id = null
    const toko = await tx.toko.findUnique({ where: { id: v.toko_id } })
    const sesi = await tx.sesiHarian.findUnique({ where: { id: v.sesi_id }, include: { sales: true } })
    if (!sesi) throw new Error("Sesi sales tidak ditemukan.")
    if (!toko) throw new Error("Toko tidak ditemukan.")
    if (selisihBaru < 0) {
      const peng = await tx.pengeluaran.create({
        data: {
          tanggal:    new Date(v.tanggal),
          jumlah:     Math.abs(selisihBaru),
          keterangan: `Kembalian tukar barang - ${toko.nama} (sales ${sesi.sales.nama})`,
          sumber:     "penjualan",
        },
      })
      pengeluaran_id = peng.id
    }

    await tx.tukarBarang.update({
      where: { id },
      data: {
        tanggal:      new Date(v.tanggal),
        sesi_id:      v.sesi_id,
        toko_id:      v.toko_id,
        selisih_uang: selisihBaru,
        catatan:      v.catatan,
        pengeluaran_id,
        itemsMasuk: {
          create: v.itemsMasuk.map((it) => ({
            rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan,
          })),
        },
        itemsKeluar: {
          create: v.itemsKeluar.map((it) => ({
            rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan,
          })),
        },
      },
    })

    // Apply mutasi stok baru
    for (const it of v.itemsMasuk) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: v.tanggal, jenis: 'in', qty: it.qty,
        source: MUTATION_SOURCE.TUKAR_MASUK, reference_id: id,
        user_id: session?.user?.id,
      })
    }
    for (const it of v.itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: v.tanggal, jenis: 'out', qty: it.qty,
        source: MUTATION_SOURCE.TUKAR_KELUAR, reference_id: id,
        user_id: session?.user?.id,
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Edit Tukar Barang",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values: {
        tanggal:      old.tanggal.toISOString().split("T")[0],
        toko:         old.toko.nama,
        sales:        old.sesi?.sales?.nama,
        itemsMasuk:   old.itemsMasuk.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        itemsKeluar:  old.itemsKeluar.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        selisih_uang: old.selisih_uang,
        catatan:      old.catatan,
      },
      new_values: {
        tanggal:      v.tanggal,
        toko:         toko.nama,
        sales:        sesi.sales.nama,
        itemsMasuk:   v.itemsMasuk.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan })),
        itemsKeluar:  v.itemsKeluar.map((it) => ({ rokok_id: it.rokok_id, qty: it.qty, harga_satuan: it.harga_satuan })),
        selisih_uang: selisihBaru,
        catatan:      v.catatan,
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })

  revalidatePath("/tukar-barang")
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}

export async function deleteTukarBarang(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.tukarBarang.findUnique({
      where: { id },
      include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } }, toko: true, sesi: { include: { sales: true } } },
    })
    if (!old) return

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TUKAR_BARANG,
      change_type: "Hapus Tukar Barang",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values: {
        tanggal:      old.tanggal.toISOString().split("T")[0],
        toko:         old.toko.nama,
        sales:        old.sesi?.sales?.nama,
        itemsMasuk:   old.itemsMasuk.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        itemsKeluar:  old.itemsKeluar.map((it) => ({ rokok: it.rokok?.nama, qty: it.qty, harga_satuan: it.harga_satuan })),
        selisih_uang: old.selisih_uang,
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
    for (const it of old.itemsKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id, tanggal: old.tanggal, jenis: 'in', qty: it.qty,
        source: MUTATION_SOURCE.REVERT, reference_id: id,
        keterangan: "Revert tukar barang keluar (delete)",
        user_id: session?.user?.id,
      })
    }

    if (old.pengeluaran_id) {
      await tx.pengeluaran.delete({ where: { id: old.pengeluaran_id } }).catch(() => null)
    }
    await tx.tukarBarang.delete({ where: { id } })
  })

  revalidatePath("/tukar-barang")
  revalidatePath("/pengeluaran")
  revalidatePath("/")
}
