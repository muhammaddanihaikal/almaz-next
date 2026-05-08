"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"

const include = {
  sales: true,
  toko:  true,
  items: { include: { rokok: true } },
  setoran: true,
}

function serialize(k) {
  const nilaiTotal    = k.items.reduce((s, it) => s + it.qty_keluar * it.harga, 0)
  const nilaiTerjual  = k.items.reduce((s, it) => s + it.qty_terjual * it.harga, 0)
  const totalSetoran  = k.setoran.reduce((s, it) => s + it.jumlah, 0)
  const flagSetoran   = k.status === "selesai" && totalSetoran !== nilaiTerjual
  const today         = new Date().toISOString().split("T")[0]
  const jatuhTempo    = k.tanggal_jatuh_tempo.toISOString().split("T")[0]
  const selisihHari   = Math.ceil((new Date(jatuhTempo) - new Date(today)) / 86400000)
  const flagJatuhTempo = k.status === "aktif" && selisihHari <= 3

  return {
    id:                  k.id,
    sesi_id:             k.sesi_id,
    sales_id:            k.sales_id,
    sales:               k.sales.nama,
    toko_id:             k.toko_id,
    nama_toko:           k.toko.nama,
    kategori:            k.kategori,
    tanggal_jatuh_tempo: jatuhTempo,
    tanggal_selesai:     k.tanggal_selesai ? k.tanggal_selesai.toISOString().split("T")[0] : null,
    status:              k.status,
    flag_selisih_setoran: k.flag_selisih_setoran,
    catatan:             k.catatan,
    createdAt:           k.createdAt.toISOString(),
    nilaiTotal,
    nilaiTerjual,
    totalSetoran,
    flagSetoran,
    flagJatuhTempo,
    selisihHari,
    items: k.items
      .sort((a, b) => (a.rokok?.urutan ?? 0) - (b.rokok?.urutan ?? 0))
      .map((it) => ({
      id:          it.id,
      rokok_id:    it.rokok_id,
      rokok:       it.rokok?.nama || "???",
      qty_keluar:  it.qty_keluar,
      qty_terjual: it.qty_terjual,
      qty_kembali: it.qty_kembali,
      harga:       it.harga,
    })),
    setoran: k.setoran.map((it) => ({
      id:     it.id,
      metode: it.metode,
      jumlah: it.jumlah,
      tanggal: it.tanggal.toISOString().split("T")[0],
    })),
  }
}

// Default: muat semua titip jual yang masih aktif (apapun tanggalnya)
// + titip jual selesai dari 90 hari terakhir. Data selesai lebih lama
// bisa diakses via filter tanggal di halaman atau halaman Riwayat.
export async function getTitipJualList(daysBack = 90) {
  const where = {}
  if (daysBack && Number.isFinite(daysBack)) {
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - daysBack)
    where.OR = [
      { status: "aktif" },
      { status: "selesai", tanggal_selesai: { gte: since } },
    ]
  }
  const rows = await prisma.titipJual.findMany({
    where,
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function getTitipJualJatuhTempo() {
  const tiga_hari = new Date()
  tiga_hari.setDate(tiga_hari.getDate() + 3)
  const rows = await prisma.titipJual.findMany({
    where: {
      status: "aktif",
      tanggal_jatuh_tempo: { lte: tiga_hari },
    },
    include,
    orderBy: { tanggal_jatuh_tempo: "asc" },
  })
  return rows.map(serialize)
}

export async function settleTitipJual(id, data) {
  const settlementDateStr = data.tanggal || new Date().toISOString().split("T")[0]
  const today = new Date(settlementDateStr)
  const session = await auth()

  await prisma.$transaction(async (tx) => {
    const setting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
    const cutoffDate = setting?.value || null
    const isSettlementHistorical = cutoffDate && settlementDateStr < cutoffDate

    const old = await tx.titipJual.findUnique({ where: { id }, include: { items: { include: { rokok: true } } } })

    for (const it of data.items) {
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
      })
      if (it.qty_kembali > 0 && !isSettlementHistorical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'in',
          qty: it.qty_kembali,
          source: MUTATION_SOURCE.KONSINYASI_KEMBALI,
          reference_id: id,
          user_id: session?.user?.id
        })
      }
    }

    const validSetoran = (data.setoran || []).filter((s) => s.jumlah > 0)
    if (validSetoran.length > 0) {
      await tx.titipJualSetoran.createMany({
        data: validSetoran.map((s) => ({
          titip_jual_id: id,
          metode:        s.metode,
          jumlah:        s.jumlah,
          tanggal:       today,
        })),
      })
    }

    const nilaiTerjual = data.items.reduce((s, it) => {
      const harga = old.items.find((o) => o.id === it.id)?.harga || 0
      return s + it.qty_terjual * harga
    }, 0)
    const totalSetoran         = validSetoran.reduce((s, st) => s + st.jumlah, 0)
    const flag_selisih_setoran = nilaiTerjual > 0 && totalSetoran !== nilaiTerjual

    await tx.titipJual.update({
      where: { id },
      data:  { status: "selesai", tanggal_selesai: today, flag_selisih_setoran },
    })

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Penyelesaian (Settlement)",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { status: old.status },
      new_values:  {
        status:  "selesai",
        items:   data.items.map(it => ({ id: it.id, qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali })),
        setoran: validSetoran.map(s => ({ metode: s.metode, jumlah: s.jumlah })),
      },
      alasan:    "Penyelesaian titip jual",
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function editTitipJualDetail(id, data, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const old = await tx.titipJual.findUnique({ where: { id } })
    await tx.titipJual.update({
      where: { id },
      data: {
        tanggal_jatuh_tempo: new Date(data.tanggal_jatuh_tempo),
        catatan:             data.catatan || null,
      },
    })
    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Perpanjang Jatuh Tempo",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  { tanggal_jatuh_tempo: old.tanggal_jatuh_tempo.toISOString().split("T")[0], catatan: old.catatan },
      new_values:  { tanggal_jatuh_tempo: data.tanggal_jatuh_tempo, catatan: data.catatan || null },
      alasan,
      user_id:     session?.user?.id,
      user_name:   session?.user?.name,
    })
  })
  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function deleteTitipJual(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const k = await tx.titipJual.findUnique({ where: { id }, include: { items: { include: { rokok: true } }, toko: true, sales: true } })
    if (!k) throw new Error("Data titip jual tidak ditemukan")
    if (k.status !== "aktif") throw new Error("Hanya titip jual aktif yang bisa dihapus")

    const sesi    = await tx.sesiHarian.findUnique({ where: { id: k.sesi_id }, select: { tanggal: true, is_historical: true } })
    const tanggal = sesi?.tanggal || k.createdAt

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Hapus Titip Jual",
      entity_id:   id,
      action:      AUDIT_ACTION.DELETE,
      old_values:  {
        sales:               k.sales.nama,
        toko:                k.toko.nama,
        kategori:            k.kategori,
        tanggal_jatuh_tempo: k.tanggal_jatuh_tempo.toISOString().split("T")[0],
        items: k.items.map(it => ({ rokok: it.rokok?.nama, qty_keluar: it.qty_keluar, harga: it.harga })),
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })

    for (const it of k.items) {
      if (it.qty_keluar > 0 && !sesi?.is_historical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal,
          jenis: 'in',
          qty: it.qty_keluar,
          source: MUTATION_SOURCE.REVERT,
          reference_id: id,
          keterangan: "Revert titip jual keluar (delete)",
          user_id: session?.user?.id,
          allowNegative: true,
        })
      }
    }
    await tx.titipJual.delete({ where: { id } })
  })
  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function createTitipJual(sesiId, salesId, k) {
  const rokokList = await prisma.rokok.findMany()
  const hargaMap  = {}
  for (const r of rokokList) {
    hargaMap[r.id] = { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan }
  }

  const session = await auth()
  const result = await prisma.$transaction(async (tx) => {
    const sesi    = await tx.sesiHarian.findUnique({ where: { id: sesiId }, select: { tanggal: true, is_historical: true } })
    const tanggal = sesi?.tanggal || new Date()

    const created = await tx.titipJual.create({
      data: {
        sesi_id:             sesiId,
        sales_id:            salesId,
        toko_id:             k.toko_id,
        kategori:            k.kategori,
        tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
        catatan:             k.catatan || null,
        is_historical:       sesi?.is_historical || false,
        items: {
          create: k.items
            .filter((it) => it.rokok_id && Number(it.qty) > 0)
            .map((it) => ({
              rokok_id:   it.rokok_id,
              qty_keluar: Number(it.qty),
              harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
            })),
        },
      },
      include,
    })

    for (const it of created.items) {
      if (it.qty_keluar > 0 && !sesi?.is_historical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal,
          jenis:    'out',
          qty:      it.qty_keluar,
          source:   MUTATION_SOURCE.KONSINYASI_KELUAR,
          reference_id: created.id,
          user_id:  session?.user?.id,
        })
      }
    }

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Buat Titip Jual",
      entity_id:   created.id,
      action:      AUDIT_ACTION.CREATE,
      new_values:  {
        sales_id:            salesId,
        toko_id:             k.toko_id,
        kategori:            k.kategori,
        tanggal_jatuh_tempo: k.tanggal_jatuh_tempo,
        items: k.items.filter(it => it.rokok_id && Number(it.qty) > 0).map(it => ({ rokok_id: it.rokok_id, qty: Number(it.qty) })),
      },
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
    return created
  })

  revalidatePath("/distribusi")
  revalidatePath("/titip-jual")
  return serialize(result)
}

export async function editSettlement(id, data, alasan) {
  const settlementDateStr = data.tanggal || new Date().toISOString().split("T")[0]
  const today = new Date(settlementDateStr)
  const session = await auth()

  await prisma.$transaction(async (tx) => {
    const setting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
    const cutoffDate = setting?.value || null
    const isSettlementHistorical = cutoffDate && settlementDateStr < cutoffDate

    const old = await tx.titipJual.findUnique({
      where: { id },
      include: { items: { include: { rokok: true } }, setoran: true },
    })

    const oldSettlementDateStr = old.tanggal_selesai ? old.tanggal_selesai.toISOString().split("T")[0] : null
    const wasOldSettlementHistorical = cutoffDate && oldSettlementDateStr && oldSettlementDateStr < cutoffDate

    for (const it of old.items) {
      if (it.qty_kembali > 0 && !wasOldSettlementHistorical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'out',
          qty: it.qty_kembali,
          source: MUTATION_SOURCE.REVERT,
          reference_id: id,
          keterangan: "Revert titip jual kembali (edit settlement)",
          user_id: session?.user?.id
        })
      }
    }

    for (const it of data.items) {
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
      })
      if (it.qty_kembali > 0 && !isSettlementHistorical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: data.tanggal || new Date().toISOString().split("T")[0],
          jenis: 'in',
          qty: it.qty_kembali,
          source: MUTATION_SOURCE.KONSINYASI_KEMBALI,
          reference_id: id,
          user_id: session?.user?.id
        })
      }
    }

    await tx.titipJualSetoran.deleteMany({ where: { titip_jual_id: id } })
    const validSetoran = (data.setoran || []).filter((s) => s.jumlah > 0)
    if (validSetoran.length > 0) {
      await tx.titipJualSetoran.createMany({
        data: validSetoran.map((s) => ({
          titip_jual_id: id,
          metode:        s.metode,
          jumlah:        s.jumlah,
          tanggal:       today,
        })),
      })
    }

    const nilaiTerjual = data.items.reduce((s, it) => {
      const harga = old.items.find((o) => o.id === it.id)?.harga || 0
      return s + it.qty_terjual * harga
    }, 0)
    const totalSetoran         = validSetoran.reduce((s, st) => s + st.jumlah, 0)
    const flag_selisih_setoran = nilaiTerjual > 0 && totalSetoran !== nilaiTerjual

    await tx.titipJual.update({
      where: { id },
      data:  { tanggal_selesai: today, flag_selisih_setoran },
    })

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Edit Settlement",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  {
        items:   old.items.map(it => ({ rokok: it.rokok?.nama, qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali })),
        setoran: old.setoran.map(s => ({ metode: s.metode, jumlah: s.jumlah })),
      },
      new_values:  {
        items:   data.items.map(it => ({ id: it.id, qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali })),
        setoran: validSetoran.map(s => ({ metode: s.metode, jumlah: s.jumlah })),
      },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function revertSettlement(id, alasan) {
  const session = await auth()
  await prisma.$transaction(async (tx) => {
    const setting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
    const cutoffDate = setting?.value || null

    const old = await tx.titipJual.findUnique({ where: { id }, include: { items: { include: { rokok: true } }, setoran: true } })

    const oldSettlementDateStr = old.tanggal_selesai ? old.tanggal_selesai.toISOString().split("T")[0] : null
    const wasOldSettlementHistorical = cutoffDate && oldSettlementDateStr && oldSettlementDateStr < cutoffDate

    for (const it of old.items) {
      if (it.qty_kembali > 0 && !wasOldSettlementHistorical) {
        await mutateStock({
          tx,
          rokok_id: it.rokok_id,
          tanggal: new Date().toISOString().split("T")[0],
          jenis: 'out',
          qty: it.qty_kembali,
          source: MUTATION_SOURCE.REVERT,
          reference_id: id,
          keterangan: "Revert titip jual kembali (revert settlement)",
          user_id: session?.user?.id
        })
      }
      await tx.titipJualItem.update({
        where: { id: it.id },
        data:  { qty_terjual: 0, qty_kembali: 0 },
      })
    }

    await tx.titipJualSetoran.deleteMany({ where: { titip_jual_id: id } })
    await tx.titipJual.update({ where: { id }, data: { status: "aktif", tanggal_selesai: null, flag_selisih_setoran: false } })

    await logAudit({
      tx,
      entity_type: AUDIT_ENTITY.TITIP_JUAL,
      change_type: "Batalkan Settlement",
      entity_id:   id,
      action:      AUDIT_ACTION.UPDATE,
      old_values:  {
        status: "selesai",
        items:  old.items.map(it => ({ rokok: it.rokok?.nama, qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali })),
        setoran: old.setoran.map(s => ({ metode: s.metode, jumlah: s.jumlah })),
      },
      new_values:  { status: "aktif", items: "direset ke 0", setoran: "dihapus" },
      alasan,
      user_id:   session?.user?.id,
      user_name: session?.user?.name,
    })
  })

  revalidatePath("/titip-jual")
  revalidatePath("/distribusi")
  revalidatePath("/")
}

export async function getTitipJualNotificationCounts() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const tigaHariLagi = new Date(today)
  tigaHariLagi.setDate(tigaHariLagi.getDate() + 3)

  const [red, yellow, neutral] = await Promise.all([
    prisma.titipJual.count({
      where: { status: "aktif", tanggal_jatuh_tempo: { lte: today } }
    }),
    prisma.titipJual.count({
      where: { status: "aktif", tanggal_jatuh_tempo: { gte: tomorrow, lte: tigaHariLagi } }
    }),
    prisma.titipJual.count({
      where: { status: "selesai", flag_selisih_setoran: true }
    }),
  ])

  return { red, yellow, neutral }
}
