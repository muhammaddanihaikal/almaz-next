"use server"

import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { mutateStock, mutateStockBatch, MUTATION_SOURCE } from "@/lib/stock"
import { auth } from "@/lib/auth"
import { logAudit, AUDIT_ACTION, AUDIT_ENTITY } from "@/lib/audit"
import { createTukarBarangInSesi, selesaikanTukarBarangInSesi, revertSelesaiTukarBarangInSesi } from "@/actions/tukar-barang"
import { getAppSetting } from "@/actions/settings"

const include = {
  sales: true,
  barangKeluar:  { include: { rokok: true } },
  penjualan:     { include: { rokok: true } },
  setoran:       true,
  barangKembali: { include: { rokok: true } },
  titipJual:     { include: { items: { include: { rokok: true } }, setoran: true, toko: true } },
  tukarBarang:   { include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } } } },
  tukarBarangSelesai: { include: { itemsMasuk: { include: { rokok: true } }, itemsKeluar: { include: { rokok: true } } } },
}

const DISTRIBUSI_TX_OPTIONS = { maxWait: 10000, timeout: 30000 }
const distribusiTransaction = (fn) => prisma.$transaction(fn, DISTRIBUSI_TX_OPTIONS)

function serializeTukarList(list) {
  return list.map((t) => ({
    id:              t.id,
    tanggal:         t.tanggal.toISOString().split("T")[0],
    tanggal_selesai: t.tanggal_selesai ? t.tanggal_selesai.toISOString().split("T")[0] : null,
    status:          t.status,
    kategori:        t.kategori || "grosir",
    selisih_uang:    t.selisih_uang,
    catatan:         t.catatan || "",
    itemsMasuk: (t.itemsMasuk || []).map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
      qty: it.qty, harga_satuan: it.harga_satuan,
    })),
    itemsKeluar: (t.itemsKeluar || []).map((it) => ({
      id: it.id, rokok_id: it.rokok_id, rokok: it.rokok?.nama || "???",
      qty: it.qty, harga_satuan: it.harga_satuan,
    })),
  }))
}

function serialize(s) {
  const tanggal = s.tanggal.toISOString().split("T")[0]

  const nilaiPenjualanLangsung = s.penjualan.reduce((sum, it) => sum + it.qty * it.harga, 0)
  const nilaiTitipJual = s.titipJual.reduce((sum, k) => (
    sum + k.items.reduce((ss, it) => ss + it.qty_keluar * it.harga, 0)
  ), 0)
  const tukarMap = new Map([...(s.tukarBarang || []), ...(s.tukarBarangSelesai || [])].map((t) => [t.id, t]))
  const nilaiTukar = [...tukarMap.values()].reduce((sum, t) => {
    const totalMasuk = t.itemsMasuk.reduce((ss, it) => ss + it.qty * it.harga_satuan, 0)
    const totalKeluar = t.itemsKeluar.reduce((ss, it) => ss + it.qty * it.harga_satuan, 0)
    return sum + (totalMasuk - totalKeluar)
  }, 0)
  const nilaiPenjualan = nilaiPenjualanLangsung + nilaiTitipJual + nilaiTukar
  const totalSetoran   = s.setoran.reduce((sum, it) => sum + it.jumlah, 0)
  const qtyKeluar      = s.barangKeluar.reduce((sum, it) => sum + it.qty, 0)
  const qtyTerjual     = s.penjualan.reduce((sum, it) => sum + it.qty, 0)
  const qtyKonsinyasi  = s.titipJual.reduce((sum, k) => sum + k.items.reduce((ss, it) => ss + it.qty_keluar, 0), 0)
  const qtyKembali     = s.barangKembali.reduce((sum, it) => sum + it.qty, 0)
  const flagSetoran    = nilaiPenjualan > 0 && totalSetoran !== nilaiPenjualan
  const flagQty        = qtyKeluar > 0 && s.status === "selesai" && (qtyTerjual + qtyKonsinyasi + qtyKembali) !== qtyKeluar

  return {
    id:        s.id,
    tanggal,
    sales_id:  s.sales_id,
    sales:     s.sales.nama,
    sales_kategori: s.sales.kategori || "grosir",
    status:    s.status,
    is_historical: s.is_historical,
    catatan:   s.catatan,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    flagSetoran,
    flagQty,
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
    tukarBarang: serializeTukarList(s.tukarBarang || []),
    tukarBarangSelesaiDiSesi: serializeTukarList(s.tukarBarangSelesai || []),
    konsinyasi: s.titipJual.map((k) => ({
      id:                  k.id,
      toko_id:             k.toko_id,
      nama_toko:           k.toko.nama,
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
  try {
    const cutoffSetting = await getAppSetting("stock_cutoff_date")
    const cutoffStr = cutoffSetting?.value || null
    let is_historical = false
    if (cutoffStr) {
      const cutoffDate = new Date(cutoffStr)
      cutoffDate.setHours(0,0,0,0)
      const sesiDate = new Date(data.tanggal)
      sesiDate.setHours(0,0,0,0)
      if (sesiDate < cutoffDate) {
        is_historical = true
      }
    }

    const createdId = await distribusiTransaction(async (tx) => {
      const sesi = await tx.sesiHarian.create({
        data: {
          tanggal:  new Date(data.tanggal),
          sales_id: data.sales_id,
          status:   "aktif",
          is_historical,
          catatan:  data.catatan || null,
          barangKeluar: {
            create: (data.barangKeluar || []).map((it) => ({
              rokok_id: it.rokok_id,
              qty:      it.qty,
            })),
          },
        },
      })
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
      return sesi.id
    })
    revalidatePath("/distribusi")
    revalidatePath("/")
    return { success: true, data: await getSesi(createdId) }
  } catch (error) {
    console.error("[createSesi ERROR]", {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
    })
    return { success: false, error: error.message || "Gagal membuat sesi distribusi." }
  }
}

export async function updateSesiPagi(id, data, alasan) {
  const session = await auth()
  try {
    // Hitung ulang is_historical jika tanggal berubah
    const cutoffSetting = await getAppSetting("stock_cutoff_date")
    const cutoffStr = cutoffSetting?.value || null
    let is_historical = false
    if (cutoffStr) {
      const cutoffDate = new Date(cutoffStr)
      cutoffDate.setHours(0, 0, 0, 0)
      const sesiDate = new Date(data.tanggal)
      sesiDate.setHours(0, 0, 0, 0)
      if (sesiDate < cutoffDate) is_historical = true
    }

    await distribusiTransaction(async (tx) => {
      const old = await tx.sesiHarian.findUnique({
        where: { id },
        include: { barangKeluar: { include: { rokok: true } } },
      })
      await tx.sesiBarangKeluar.deleteMany({ where: { sesi_id: id } })
      await tx.sesiHarian.update({
        where: { id },
        data: {
          tanggal:      new Date(data.tanggal),
          sales_id:     data.sales_id,
          catatan:      data.catatan || null,
          is_historical,
          barangKeluar: {
            create: (data.barangKeluar || []).map((it) => ({
              rokok_id: it.rokok_id,
              qty:      it.qty,
            })),
          },
        },
      })
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
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[updateSesiPagi ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
      alasan,
    })
    return { success: false, error: error.message || "Gagal mengubah sesi distribusi." }
  }
}

export async function submitLaporanSore(id, data) {
  const session = await auth()
  try {
    const rokokList = await prisma.rokok.findMany()
    const hargaMap = Object.fromEntries(
      rokokList.map((r) => [
        r.id,
        { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan },
      ])
    )

    await distribusiTransaction(async (tx) => {
      const mutQueue = []
      const sesiHarian = await tx.sesiHarian.findUnique({ where: { id } })
      const is_historical = sesiHarian?.is_historical || false

      // Ambil cutoff date untuk logika settlement titip jual historical
      const cutoffSetting = await tx.appSetting.findUnique({ where: { key: "stock_cutoff_date" } })
      const cutoffStr = cutoffSetting?.value || null

      // Revert old PENJUALAN mutations before recreating
      const oldPenjualanSore = await tx.sesiPenjualan.findMany({ where: { sesi_id: id } })
      for (const it of oldPenjualanSore) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: "Revert penjualan (re-submit sore)", user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }

      await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
      await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
      await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

      // Revert & Delete existing Titip Jual for this session to prevent duplication
      const oldKonsinyasi = await tx.titipJual.findMany({ where: { sesi_id: id }, include: { items: true } })
      for (const k of oldKonsinyasi) {
        for (const it of k.items) {
          if (it.qty_keluar > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty_keluar,
              source: MUTATION_SOURCE.REVERT, reference_id: k.id,
              keterangan: "Revert titip jual (re-submit sore)", user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }
      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

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
      for (const it of penjualan) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
            source: MUTATION_SOURCE.PENJUALAN, reference_id: id, user_id: session?.user?.id,
          })
        }
      }

      const setoran = data.setoran || []
      await tx.sesiSetoran.createMany({
        data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
      })

      const kembali = data.barangKembali || []
      await tx.sesiBarangKembali.createMany({
        data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
      })

      const konsinyasiBaru = data.konsinyasiBaru || []
      for (const k of konsinyasiBaru) {
        const titipJual = await tx.titipJual.create({
          data: {
            sesi_id:             id,
            sales_id:            data.sales_id,
            toko_id:             k.toko_id,
            kategori:            k.kategori,
            tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
            catatan:             k.catatan || null,
            is_historical:       is_historical,
            items: {
              create: k.items
                .filter((it) => it.rokok_id && Number(it.qty ?? it.qty_keluar) > 0)
                .map((it) => ({
                  rokok_id:   it.rokok_id,
                  qty_keluar: Number(it.qty ?? it.qty_keluar),
                  harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
                })),
            },
          },
          include: { items: true },
        })
        for (const it of titipJual.items) {
          if (it.qty_keluar > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty_keluar,
              source: MUTATION_SOURCE.KONSINYASI_KELUAR, reference_id: titipJual.id, user_id: session?.user?.id,
            })
          }
        }
      }

      // Tukar Barang Baru
      const tukarBaru = data.tukarBaru || []
      const sesiObj = { id, tanggal: data.tanggal, is_historical }
      for (const t of tukarBaru) {
        await createTukarBarangInSesi(tx, sesiObj, t, session, !!t.langsungSelesai, mutQueue)
      }

      // Penyelesaian Tukar Barang yang masih aktif
      const penyelesaianTukar = data.penyelesaianTukar || []
      for (const tukar_id of penyelesaianTukar) {
        await selesaikanTukarBarangInSesi(tx, sesiObj, tukar_id, session, mutQueue)
      }

      // Penyelesaian Titip Jual (Settlement)
      const penyelesaianKonsinyasi = data.penyelesaianKonsinyasi || []
      for (const p of penyelesaianKonsinyasi) {
        // Ambil data titip jual untuk cek is_historical dari record itu sendiri
        const titipJualRecord = await tx.titipJual.findUnique({ where: { id: p.konsinyasi_id }, select: { is_historical: true } })
        const isTitipJualHistorical = titipJualRecord?.is_historical || false
        await tx.titipJual.update({
          where: { id: p.konsinyasi_id },
          data: { status: "selesai", tanggal_selesai: new Date(data.tanggal) }
        })
        for (const it of (p.items || [])) {
          await tx.titipJualItem.update({
            where: { titip_jual_id_rokok_id: { titip_jual_id: p.konsinyasi_id, rokok_id: it.rokok_id } },
            data:  { qty_terjual: it.qty_terjual, qty_kembali: it.qty_kembali },
          })
          // Titip jual historical yang diselesaikan SETELAH cutoff: barang kembali ke gudang secara fisik
          const settlementAfterCutoff = !cutoffStr || data.tanggal >= cutoffStr
          const shouldAddStock = !isTitipJualHistorical || (isTitipJualHistorical && settlementAfterCutoff)
          if (it.qty_kembali > 0 && shouldAddStock) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty_kembali,
              source: MUTATION_SOURCE.KONSINYASI_KEMBALI, reference_id: p.konsinyasi_id, user_id: session?.user?.id,
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
      }

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

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
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[submitLaporanSore ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
    })
    return { success: false, error: error.message || "Gagal submit laporan sore." }
  }
}

export async function editLaporanSore(id, data, alasan) {
  const session = await auth()
  try {
    const rokokList = await prisma.rokok.findMany()
    const hargaMap = Object.fromEntries(
      rokokList.map((r) => [
        r.id,
        { grosir: r.harga_grosir, toko: r.harga_toko, perorangan: r.harga_perorangan },
      ])
    )

    await distribusiTransaction(async (tx) => {
      const mutQueue = []
      // 1. Ambil data lama + is_historical
      const sesiHarian      = await tx.sesiHarian.findUnique({ where: { id } })
      const is_historical   = sesiHarian?.is_historical || false
      const oldPenjualan    = await tx.sesiPenjualan.findMany({ where: { sesi_id: id }, include: { rokok: true } })
      const oldSetoran      = await tx.sesiSetoran.findMany({ where: { sesi_id: id } })
      const oldKembali      = await tx.sesiBarangKembali.findMany({ where: { sesi_id: id }, include: { rokok: true } })

      // 2. Revert stok penjualan lama (hanya jika bukan historical)
      for (const it of oldPenjualan) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty,
            source: MUTATION_SOURCE.REVERT, reference_id: id,
            keterangan: `Revert stok penjualan untuk edit laporan (alasan: ${alasan})`, user_id: session?.user?.id,
            allowNegative: true,
          })
        }
      }

      // Revert tukar barang yang dibuat di sesi ini (revert mutasi tukar_masuk + tukar_keluar + delete record)
      const oldTukarBaru = await tx.tukarBarang.findMany({
        where: { sesi_id: id },
        include: { itemsMasuk: true, itemsKeluar: true },
      })
      for (const t of oldTukarBaru) {
        for (const it of t.itemsMasuk) {
          if (!is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: data.tanggal,
              jenis: 'out',
              qty: it.qty,
              source: MUTATION_SOURCE.REVERT,
              reference_id: t.id,
              keterangan: "Revert tukar barang masuk (edit sore)",
              user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
        if (t.status === "selesai") {
          for (const it of t.itemsKeluar) {
            if (it.qty > 0 && !is_historical) {
              mutQueue.push({
                rokok_id: it.rokok_id,
                tanggal: data.tanggal,
                jenis: 'in',
                qty: it.qty,
                source: MUTATION_SOURCE.REVERT,
                reference_id: t.id,
                keterangan: "Revert tukar barang keluar (edit sore)",
                user_id: session?.user?.id,
                allowNegative: true,
              })
            }
          }
        }
        await tx.tukarBarang.delete({ where: { id: t.id } })
      }

      // Revert penyelesaian tukar yang diselesaikan di sesi ini (status balik aktif)
      const oldTukarSelesai = await tx.tukarBarang.findMany({
        where: { sesi_selesai_id: id, status: "selesai" },
      })
      for (const t of oldTukarSelesai) {
        // skip kalau tukar dibuat di sesi yang sama (langsung selesai) — sudah dihapus di blok atas
        if (t.sesi_id === id) continue
        await revertSelesaiTukarBarangInSesi(tx, t.id, session, mutQueue)
      }

      // 3. Hapus data lama
      await tx.sesiPenjualan.deleteMany({ where: { sesi_id: id } })
      await tx.sesiSetoran.deleteMany({   where: { sesi_id: id } })
      await tx.sesiBarangKembali.deleteMany({ where: { sesi_id: id } })

      // Revert & Delete existing Titip Jual for this session to prevent duplication
      const oldKonsinyasi = await tx.titipJual.findMany({ where: { sesi_id: id }, include: { items: true } })
      for (const k of oldKonsinyasi) {
        for (const it of k.items) {
          if (it.qty_keluar > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'in', qty: it.qty_keluar,
              source: MUTATION_SOURCE.REVERT, reference_id: k.id,
              keterangan: `Revert titip jual (edit sore - alasan: ${alasan})`, user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }
      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

      // 4. Buat data baru
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
      for (const it of penjualan) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty,
            source: MUTATION_SOURCE.PENJUALAN, reference_id: id, user_id: session?.user?.id,
          })
        }
      }

      const setoran = data.setoran || []
      await tx.sesiSetoran.createMany({
        data: setoran.map((it) => ({ sesi_id: id, metode: it.metode, jumlah: it.jumlah })),
      })

      const kembali = data.barangKembali || []
      await tx.sesiBarangKembali.createMany({
        data: kembali.map((it) => ({ sesi_id: id, rokok_id: it.rokok_id, qty: it.qty })),
      })

      // 5. Konsinyasi Baru
      const konsinyasiBaru = data.konsinyasiBaru || []
      for (const k of konsinyasiBaru) {
        const titipJual = await tx.titipJual.create({
          data: {
            sesi_id:             id,
            sales_id:            data.sales_id,
            toko_id:             k.toko_id,
            kategori:            k.kategori,
            tanggal_jatuh_tempo: new Date(k.tanggal_jatuh_tempo),
            catatan:             k.catatan || null,
            is_historical: is_historical,
            items: {
              create: k.items
                .filter((it) => it.rokok_id && Number(it.qty ?? it.qty_keluar) > 0)
                .map((it) => ({
                  rokok_id:   it.rokok_id,
                  qty_keluar: Number(it.qty ?? it.qty_keluar),
                  harga:      hargaMap[it.rokok_id]?.[k.kategori] || 0,
                })),
            },
          },
          include: { items: true },
        })
        for (const it of titipJual.items) {
          if (it.qty_keluar > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id, tanggal: data.tanggal, jenis: 'out', qty: it.qty_keluar,
              source: MUTATION_SOURCE.KONSINYASI_KELUAR, reference_id: titipJual.id, user_id: session?.user?.id,
            })
          }
        }
      }

      // 6. Tukar Barang
      const sesiObjEdit = { id, tanggal: data.tanggal, is_historical }
      for (const t of (data.tukarBaru || [])) {
        await createTukarBarangInSesi(tx, sesiObjEdit, t, session, !!t.langsungSelesai, mutQueue)
      }
      for (const tukar_id of (data.penyelesaianTukar || [])) {
        await selesaikanTukarBarangInSesi(tx, sesiObjEdit, tukar_id, session, mutQueue)
      }

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

      // 7. Audit Log
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
    return { success: true, data: await getSesi(id) }
  } catch (error) {
    console.error(`[editLaporanSore ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
      data: JSON.stringify(data),
      alasan
    })
    return { success: false, error: error.message || "Gagal edit laporan sore." }
  }
}

export async function deleteSesi(id, alasan) {
  const session = await auth()
  try {
    await distribusiTransaction(async (tx) => {
      const mutQueue = []
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
      const is_historical = sesi.is_historical || false

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

      for (const it of sesi.penjualan) {
        if (it.qty > 0 && !is_historical) {
          mutQueue.push({
            rokok_id: it.rokok_id,
            tanggal: sesi.tanggal,
            jenis: 'in',
            qty: it.qty,
            source: MUTATION_SOURCE.REVERT,
            reference_id: id,
            keterangan: "Revert penjualan (delete sesi)",
            user_id: session?.user?.id,
            allowNegative: true,
          })
        }
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
            if (it.qty_kembali > 0 && !is_historical) {
              mutQueue.push({
                rokok_id: it.rokok_id,
                tanggal: sesi.tanggal,
                jenis: 'out',
                qty: it.qty_kembali,
                source: MUTATION_SOURCE.REVERT,
                reference_id: tjId,
                keterangan: "Revert konsinyasi kembali (delete sesi)",
                user_id: session?.user?.id,
                allowNegative: true,
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
          if (it.qty_keluar > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: sesi.tanggal,
              jenis: 'in',
              qty: it.qty_keluar,
              source: MUTATION_SOURCE.REVERT,
              reference_id: k.id,
              keterangan: "Revert konsinyasi keluar (delete sesi)",
              user_id: session?.user?.id,
              allowNegative: true,
            })
          }
          if (it.qty_kembali > 0 && !is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: sesi.tanggal,
              jenis: 'out',
              qty: it.qty_kembali,
              source: MUTATION_SOURCE.REVERT,
              reference_id: k.id,
              keterangan: "Revert konsinyasi kembali (delete sesi)",
              user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
      }

      await tx.titipJual.deleteMany({ where: { sesi_id: id } })

      // Revert tukar barang yang dibuat di sesi ini
      const tukarBaruDiSesi = await tx.tukarBarang.findMany({
        where: { sesi_id: id },
        include: { itemsMasuk: true, itemsKeluar: true },
      })
      for (const t of tukarBaruDiSesi) {
        for (const it of t.itemsMasuk) {
          if (!is_historical) {
            mutQueue.push({
              rokok_id: it.rokok_id,
              tanggal: sesi.tanggal,
              jenis: 'out',
              qty: it.qty,
              source: MUTATION_SOURCE.REVERT,
              reference_id: t.id,
              keterangan: "Revert tukar barang masuk (delete sesi)",
              user_id: session?.user?.id,
              allowNegative: true,
            })
          }
        }
        if (t.status === "selesai") {
          for (const it of t.itemsKeluar) {
            if (it.qty > 0 && !is_historical) {
              mutQueue.push({
                rokok_id: it.rokok_id,
                tanggal: t.tanggal_selesai || sesi.tanggal,
                jenis: 'in',
                qty: it.qty,
                source: MUTATION_SOURCE.REVERT,
                reference_id: t.id,
                keterangan: "Revert tukar barang keluar (delete sesi)",
                user_id: session?.user?.id,
                allowNegative: true,
              })
            }
          }
        }
        await tx.tukarBarang.delete({ where: { id: t.id } })
      }

      // Revert penyelesaian tukar yang diselesaikan di sesi ini (status balik aktif)
      const tukarSelesaiDiSesi = await tx.tukarBarang.findMany({
        where: { sesi_selesai_id: id, status: "selesai" },
      })
      for (const t of tukarSelesaiDiSesi) {
        if (t.sesi_id === id) continue
        await revertSelesaiTukarBarangInSesi(tx, t.id, session, mutQueue)
      }

      // Flush semua mutasi stok dalam batch
      await mutateStockBatch({ tx, mutations: mutQueue })

      await tx.sesiHarian.delete({ where: { id } })
    })

    revalidatePath("/distribusi")
    revalidatePath("/titip-jual")
    revalidatePath("/")
    return { success: true, id }
  } catch (error) {
    console.error(`[deleteSesi ERROR] id: ${id}`, {
      message: error.message,
      stack: error.stack,
    })
    return { success: false, error: error.message || "Gagal menghapus sesi." }
  }
}
