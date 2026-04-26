"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

const include = {
  sales: true,
  barangKeluar:  { include: { rokok: true } },
  penjualan:     { include: { rokok: true } },
  setoran:       true,
  barangKembali: { include: { rokok: true } },
  konsinyasi:    { include: { items: { include: { rokok: true } }, setoran: true, toko: true } },
}

function serialize(s) {
  const tanggal = s.tanggal.toISOString().split("T")[0]

  const nilaiPenjualan = s.penjualan.reduce((sum, it) => sum + it.qty * it.harga, 0)
  const totalSetoran   = s.setoran.reduce((sum, it) => sum + it.jumlah, 0)
  const qtyKeluar      = s.barangKeluar.reduce((sum, it) => sum + it.qty, 0)
  const qtyTerjual     = s.penjualan.reduce((sum, it) => sum + it.qty, 0)
  const qtyKonsinyasi  = s.konsinyasi.reduce((sum, k) => sum + k.items.reduce((ss, it) => ss + it.qty_keluar, 0), 0)
  const qtyKembali     = s.barangKembali.reduce((sum, it) => sum + it.qty, 0)
  const flagSetoran    = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const flagQty        = qtyKeluar > 0 && s.status === "selesai" && (qtyTerjual + qtyKonsinyasi + qtyKembali) !== qtyKeluar

  return {
    id:        s.id,
    tanggal,
    sales_id:  s.sales_id,
    sales:     s.sales.nama,
    status:    s.status,
    catatan:   s.catatan,
    createdAt: s.createdAt.toISOString(),
    flagSetoran,
    flagQty,
    nilaiPenjualan,
    totalSetoran,
    barangKeluar: s.barangKeluar.map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok.nama, qty: it.qty,
    })),
    penjualan: s.penjualan.map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok.nama,
      kategori: it.kategori, qty: it.qty, harga: it.harga,
    })),
    setoran: s.setoran.map((it) => ({
      id: it.id, metode: it.metode, jumlah: it.jumlah,
    })),
    barangKembali: s.barangKembali.map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok.nama, qty: it.qty,
    })),
    konsinyasi: s.konsinyasi.map((k) => ({
      id:                  k.id,
      toko_id:             k.toko_id,
      nama_toko:           k.toko.nama,
      kategori:            k.kategori,
      tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
      status:              k.status,
      items: k.items.map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok.nama,
        qty_keluar: it.qty_keluar, qty_terjual: it.qty_terjual,
        qty_kembali: it.qty_kembali, harga: it.harga,
      })),
      setoran: k.setoran.map((it) => ({
        id: it.id, metode: it.metode, jumlah: it.jumlah,
        tanggal: it.tanggal.toISOString().split("T")[0],
      })),
    })),
  }
}

export async function getSesiList() {
  const rows = await prisma.sesiHarian.findMany({
    include,
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  })
  return rows.map(serialize)
}

export async function getSesi(id) {
  const s = await prisma.sesiHarian.findUnique({ where: { id }, include })
  return s ? serialize(s) : null
}

export async function createSesi(data) {
  await prisma.$transaction(async (tx) => {
    const sesi = await tx.sesiHarian.create({
      data: {
        tanggal:  new Date(data.tanggal),
        sales_id: data.sales_id,
        status:   "aktif",
        catatan:  data.catatan || null,
        barangKeluar: {
          create: (data.barangKeluar || []).map((it) => ({
            rokok_id: it.rokok_id,
            qty:      it.qty,
          })),
        },
      },
    })
    for (const it of data.barangKeluar || []) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
    return sesi
  })
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function updateSesiPagi(id, data) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.sesiHarian.findUnique({
      where: { id },
      include: { barangKeluar: true },
    })
    for (const it of old.barangKeluar) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    await tx.sesiBarangKeluar.deleteMany({ where: { sesi_id: id } })
    await tx.sesiHarian.update({
      where: { id },
      data: {
        tanggal:  new Date(data.tanggal),
        sales_id: data.sales_id,
        catatan:  data.catatan || null,
        barangKeluar: {
          create: (data.barangKeluar || []).map((it) => ({
            rokok_id: it.rokok_id,
            qty:      it.qty,
          })),
        },
      },
    })
    for (const it of data.barangKeluar || []) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
  })
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function submitLaporanSore(id, data) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan }
  }

  await prisma.$transaction(async (tx) => {
    await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
    await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })

    const oldKembali = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id } })
    for (const it of oldKembali) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
    await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

    const penjualan = data.penjualan || []
    await tx.sesiPenjualan.createMany({
      data: penjualan.map((it) => ({
        sesi_id:  id,
        rokok_id: it.rokok_id,
        kategori: it.kategori,
        qty:      it.qty,
        harga:    hargaMap[it.rokok_id]?.[it.kategori] || 0,
      })),
    })

    const setoran = data.setoran || []
    await tx.sesiSetoran.createMany({
      data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
    })

    const kembali = data.barangKembali || []
    await tx.sesiBarangKembali.createMany({
      data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
    })
    for (const it of kembali) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }

    const konsinyasiBaru = data.konsinyasiBaru || []
    for (const k of konsinyasiBaru) {
      await tx.konsinyasi.create({
        data: {
          sesi_id:             id,
          sales_id:            data.sales_id,
          toko_id:             k.toko_id,
          kategori:            k.kategori,
          tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
          catatan:             k.catatan || null,
          items: {
            create: k.items.map((it) => ({
              rokok_id:   it.rokok_id,
              qty_keluar: it.qty,
              harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
            })),
          },
        },
      })
    }

    const penyelesaian = data.penyelesaianKonsinyasi || []
    for (const p of penyelesaian) {
      for (const it of p.items) {
        await tx.konsinyasiItem.update({
          where: { id: it.id },
          data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
        })
        if (it.qty_kembali > 0) {
          await tx.rokok.update({
            where: { id: it.rokok_id },
            data:  { stok: { increment: it.qty_kembali } },
          })
        }
      }
      await tx.konsinyasiSetoran.createMany({
        data: (p.setoran || []).map((st) => ({
          konsinyasi_id:        p.konsinyasi_id,
          metode:               st.metode,
          jumlah:               st.jumlah,
          tanggal:              new Date(data.tanggal),
          sesi_penyelesaian_id: id,
        })),
      })
      await tx.konsinyasi.update({
        where: { id: p.konsinyasi_id },
        data:  { status: "selesai" },
      })
    }

    await tx.sesiHarian.update({
      where: { id },
      data:  { status: "selesai" },
    })
  })
  revalidatePath("/distribusi")
  revalidatePath("/konsinyasi")
  revalidatePath("/")
}

export async function editLaporanSore(id, data) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan }
  }

  await prisma.$transaction(async (tx) => {
    // Reverse stok dari barang kembali lama
    const oldKembali = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id } })
    for (const it of oldKembali) {
      await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { decrement: it.qty } } })
    }

    // Hapus data laporan lama (penjualan, setoran, barang kembali)
    await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
    await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
    await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

    // Insert penjualan baru
    const penjualan = data.penjualan || []
    await tx.sesiPenjualan.createMany({
      data: penjualan.map((it) => ({
        sesi_id:  id,
        rokok_id: it.rokok_id,
        kategori: it.kategori,
        qty:      it.qty,
        harga:    hargaMap[it.rokok_id]?.[it.kategori] || 0,
      })),
    })

    // Insert setoran baru
    const setoran = data.setoran || []
    await tx.sesiSetoran.createMany({
      data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
    })

    // Insert barang kembali baru & update stok
    const kembali = data.barangKembali || []
    await tx.sesiBarangKembali.createMany({
      data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
    })
    for (const it of kembali) {
      await tx.rokok.update({ where: { id: it.rokok_id }, data: { stok: { increment: it.qty } } })
    }
    // Tidak mengubah status sesi (tetap "selesai")
  })
  revalidatePath("/distribusi")
  revalidatePath("/konsinyasi")
  revalidatePath("/")
}

export async function deleteSesi(id) {
  await prisma.$transaction(async (tx) => {
    const sesi = await tx.sesiHarian.findUnique({
      where: { id },
      include: {
        barangKeluar:  true,
        barangKembali: true,
        konsinyasi:    { include: { items: true } },
      },
    })
    for (const it of sesi.barangKeluar) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { increment: it.qty } },
      })
    }
    for (const it of sesi.barangKembali) {
      await tx.rokok.update({
        where: { id: it.rokok_id },
        data:  { stok: { decrement: it.qty } },
      })
    }
    for (const k of sesi.konsinyasi) {
      for (const it of k.items) {
        if (it.qty_kembali > 0) {
          await tx.rokok.update({
            where: { id: it.rokok_id },
            data:  { stok: { decrement: it.qty_kembali } },
          })
        }
      }
    }
    // Hapus konsinyasi (items & setoran cascade) sebelum hapus sesi
    await tx.konsinyasi.deleteMany({ where: { sesi_id: id } })
    await tx.sesiHarian.delete({ where: { id } })
  })
  revalidatePath("/distribusi")
  revalidatePath("/konsinyasi")
  revalidatePath("/")
}
