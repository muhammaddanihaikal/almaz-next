"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"
const include = {
  sales: true,
  barangKeluar:  { include: { rokok: true } },
  penjualan:     { include: { rokok: true } },
  setoran:       true,
  barangKembali: { include: { rokok: true } },
  titipJual:     { include: { items: { include: { rokok: true } }, setoran: true, retail: true } },
}

function serialize(s) {
  const tanggal = s.tanggal.toISOString().split("T")[0]

  const nilaiPenjualan = s.penjualan.reduce((sum, it) => sum + it.qty * it.harga, 0)
  const totalSetoran   = s.setoran.reduce((sum, it) => sum + it.jumlah, 0)
  const flagSetoran    = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan

  return {
    id:        s.id,
    tanggal,
    sales_id:  s.sales_id,
    sales:     s.sales.nama,
    status:    s.status,
    catatan:   s.catatan,
    createdAt: s.createdAt.toISOString(),
    flagSetoran,
    nilaiPenjualan,
    totalSetoran,
    barangKeluar: s.barangKeluar
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    penjualan: s.penjualan
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
        kategori: it.kategori, qty: it.qty, harga: it.harga,
      })),
    setoran: s.setoran.map((it) => ({
      id: it.id, metode: it.metode, jumlah: it.jumlah,
    })),
    barangKembali: s.barangKembali
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
        id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???", qty: it.qty,
      })),
    konsinyasi: s.titipJual.map((k) => ({
      id:                  k.id,
      retail_id:           k.retail_id,
      nama_retail:         k.retail.nama,
      kategori:            k.kategori,
      tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
      tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
      status:              k.status,
      items: k.items
        .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
        .map((it) => ({
          id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
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
  const session = await auth()
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: MUTATION_SOURCE.DISTRIBUSI,
        reference_id: sesi.id,
        user_id: session?.user?.id
      })
    }
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SESI_HARIAN,
      change_type: "Laporan Pagi - Buat Sesi",
      entity_id:   sesi.id,
      action:      AUDIT_ACTION.CREATE,
      new_values:  {
        tanggal:      data.tanggal,
        sales_id:     data.sales_id,
        barangKeluar: (data.barangKeluar || []).map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
      },
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
    return sesi
  })
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function updateSesiPagi(id, data, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.sesiHarian.findUnique({
      where: { id },
      include: { barangKeluar: { include: { rokok: true } } },
    })
    for (const it of old.barangKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT,
        reference_id: id,
        keterangan: "Revert distribusi pagi (edit)",
        user_id: session?.user?.id
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: MUTATION_SOURCE.DISTRIBUSI,
        reference_id: id,
        user_id: session?.user?.id
      })
    }
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SESI_HARIAN,
      change_type: "Laporan Pagi - Barang Keluar",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  {
        tanggal:      old.tanggal.toISOString().split("T")[0],
        sales_id:     old.sales_id,
        barangKeluar: old.barangKeluar.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
      },
      new_values:  {
        tanggal:      data.tanggal,
        sales_id:     data.sales_id,
        barangKeluar: (data.barangKeluar || []).map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function submitLaporanSore(id, data) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, retail: r.harga_retail, perorangan: r.harga_perorangan }
  }

  const session = await auth()
  await prisma.$transaction(async (tx) => {
    await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
    await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })

    const oldKembali = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id } })
    for (const it of oldKembali) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT,
        reference_id: id,
        keterangan: "Revert retur sales (edit)",
        user_id: session?.user?.id
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: MUTATION_SOURCE.RETUR_SALES,
        reference_id: id,
        user_id: session?.user?.id
      })
    }

    const konsinyasiBaru = data.konsinyasiBaru || []
    for (const k of konsinyasiBaru) {
      await tx.titipJual.create({
        data: {
          sesi_id:             id,
          sales_id:            data.sales_id,
          retail_id:           k.retail_id,
          kategori:            k.kategori,
          tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
          catatan:             k.catatan || null,
          items: {
            create: k.items.map((it) => ({
              rokok_id:   it.rokok_id,
              qty_keluar: Number(it.qty),
              harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
            })),
          },
        },
      })
    }

    const penyelesaian = data.penyelesaianKonsinyasi || []
    for (const p of penyelesaian) {
      for (const it of p.items) {
        await tx.titipJualItem.update({
          where: { id: it.id },
          data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
        })
        if (it.qty_kembali > 0) {
          await mutateStock({
            tx,
            rokok_id: it.rokok_id,
            tanggal: data.tanggal,
            jenis: 'in',
            qty: it.qty_kembali,
            source: MUTATION_SOURCE.KONSINYASI_KEMBALI,
            reference_id: p.konsinyasi_id,
            user_id: session?.user?.id
          })
        }
      }
      await tx.titipJualSetoran.createMany({
        data: (p.setoran || []).map((st) => ({
          titip_jual_id:        p.konsinyasi_id,
          metode:               st.metode,
          jumlah:               st.jumlah,
          tanggal:              new Date(data.tanggal),
          sesi_penyelesaian_id: id,
        })),
      })
      await tx.titipJual.update({
        where: { id: p.konsinyasi_id },
        data:  { status: "selesai" },
      })
    }

    await tx.sesiHarian.update({
      where: { id },
      data:  { status: "selesai" },
    })

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SESI_HARIAN,
      change_type: "Laporan Sore - Submit",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      new_values:  {
        status:       "selesai",
        penjualan:    penjualan.map(it => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: it.qty })),
        setoran:      setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
        barangKembali: kembali.map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
      },
      alasan:    "Submit laporan sore",
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })
  revalidatePath("/distribusi")
  revalidatePath("/titip-jual")
  revalidatePath("/")
}

export async function editLaporanSore(id, data, alasan) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, retail: r.harga_retail, perorangan: r.harga_perorangan }
  }

  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const oldKembali  = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id }, include: { rokok: true } })
    const oldPenjualan = await tx.sesiPenjualan.findMany({ where: { sesi_id: id }, include: { rokok: true } })
    const oldSetoran  = await tx.sesiSetoran.findMany({ where: { sesi_id: id } })

    for (const it of oldKembali) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT,
        reference_id: id,
        keterangan: "Revert retur sales (edit sore)",
        user_id: session?.user?.id
      })
    }

    await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
    await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
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
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: data.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: MUTATION_SOURCE.RETUR_SALES,
        reference_id: id,
        user_id: session?.user?.id
      })
    }

    const konsinyasiBaru = data.konsinyasiBaru || []
    for (const k of konsinyasiBaru) {
      await tx.titipJual.create({
        data: {
          sesi_id:             id,
          sales_id:            data.sales_id,
          retail_id:           k.retail_id,
          kategori:            k.kategori,
          tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
          catatan:             k.catatan || null,
          items: {
            create: k.items.map((it) => ({
              rokok_id:   it.rokok_id,
              qty_keluar: Number(it.qty),
              harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
            })),
          },
        },
      })
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SESI_HARIAN,
      change_type: "Laporan Sore - Edit",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  {
        penjualan:    oldPenjualan.map(it => ({ rokok: it.rokok?.nama, kategori: it.kategori, qty: it.qty, harga: it.harga })),
        setoran:      oldSetoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
        barangKembali: oldKembali.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
      },
      new_values:  {
        penjualan:    penjualan.map(it => ({ rokok_id: it.rokok_id, kategori: it.kategori, qty: it.qty })),
        setoran:      setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
        barangKembali: kembali.map(it => ({ rokok_id: it.rokok_id, qty: it.qty })),
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })
  revalidatePath("/distribusi")
  revalidatePath("/titip-jual")
  revalidatePath("/")
}

export async function deleteSesi(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const sesi = await tx.sesiHarian.findUnique({
      where: { id },
      include: {
        barangKeluar:  { include: { rokok: true } },
        barangKembali: { include: { rokok: true } },
        penjualan:     true,
        setoran:       true,
        titipJual:     { include: { items: true } },
      },
    })

    if (!sesi) return

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.SESI_HARIAN,
      change_type: "Hapus Sesi",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values:  {
        tanggal:      sesi.tanggal.toISOString().split("T")[0],
        sales_id:     sesi.sales_id,
        status:       sesi.status,
        barangKeluar: sesi.barangKeluar.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
        penjualan:    sesi.penjualan.map(it => ({ rokok_id: it.rokok_id, qty: it.qty, harga: it.harga })),
        setoran:      sesi.setoran.map(it => ({ metode: it.metode, jumlah: it.jumlah })),
        barangKembali: sesi.barangKembali.map(it => ({ rokok: it.rokok?.nama, qty: it.qty })),
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })

    for (const it of sesi.barangKeluar) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: sesi.tanggal,
        jenis: 'in',
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT,
        reference_id: id,
        keterangan: "Revert distribusi pagi (delete sesi)",
        user_id: session?.user?.id
      })
    }

    for (const it of sesi.barangKembali) {
      await mutateStock({
        tx,
        rokok_id: it.rokok_id,
        tanggal: sesi.tanggal,
        jenis: 'out',
        qty: it.qty,
        source: MUTATION_SOURCE.REVERT,
        reference_id: id,
        keterangan: "Revert retur sales (delete sesi)",
        user_id: session?.user?.id
      })
    }

    const setoransPenyelesaian = await tx.titipJualSetoran.findMany({
      where: { sesi_penyelesaian_id: id }
    })

    const completedTjIds = [...new Set(setoransPenyelesaian.map(s => s.titip_jual_id))]

    for (const tjId of completedTjIds) {
      const tj = await tx.titipJual.findUnique({
        where: { id: tjId },
        include: { items: true }
      })

      if (tj) {
        for (const it of tj.items) {
          if (it.qty_kembali > 0) {
            await mutateStock({
              tx,
              rokok_id: it.rokok_id,
              tanggal: sesi.tanggal,
              jenis: 'out',
              qty: it.qty_kembali,
              source: MUTATION_SOURCE.REVERT,
              reference_id: tjId,
              keterangan: "Revert konsinyasi kembali (delete sesi)",
              user_id: session?.user?.id
            })
          }
        }
        await tx.titipJualItem.updateMany({
          where: { titip_jual_id: tjId },
          data: { qty_terjual: 0, qty_kembali: 0 }
        })
        await tx.titipJual.update({
          where: { id: tjId },
          data: { status: "aktif", tanggal_selesai: null }
        })
      }
    }

    await tx.titipJualSetoran.deleteMany({ where: { sesi_penyelesaian_id: id } })

    for (const k of sesi.titipJual) {
      for (const it of k.items) {
        if (it.qty_kembali > 0) {
          await mutateStock({
            tx,
            rokok_id: it.rokok_id,
            tanggal: sesi.tanggal,
            jenis: 'out',
            qty: it.qty_kembali,
            source: MUTATION_SOURCE.REVERT,
            reference_id: k.id,
            keterangan: "Revert konsinyasi kembali (delete sesi/titip jual baru)",
            user_id: session?.user?.id
          })
        }
      }
    }

    await tx.titipJual.deleteMany({ where: { sesi_id: id } })

    await tx.sesiHarian.delete({ where: { id } })
  })

  revalidatePath("/distribusi")
  revalidatePath("/titip-jual")
  revalidatePath("/")
}
