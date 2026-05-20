"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { mutateStock, MUTATION_SOURCE } from "@/lib/stock"

async function checkSuperAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") {
    throw new Error("Unauthorized: Hanya superadmin yang dapat mengakses pengaturan.")
  }
  return session.user
}

export async function getAppSetting(key) {
  const setting = await prisma.appSetting.findUnique({
    where: { key }
  })
  return setting
}

export async function setSetting(key, value) {
  const user = await checkSuperAdmin()

  // Proteksi khusus untuk cutoff stok
  if (key === "stock_cutoff_date") {
    // Cek apakah nilai berubah
    const current = await getAppSetting(key)
    if (current?.value === value) return { success: true }

    // Jika sudah ada data distribusi, dilarang ubah cutoff
    const hasData = await prisma.sesiHarian.findFirst()
    if (hasData) {
      throw new Error("Tanggal mulai stok sistem tidak dapat diubah karena sudah terdapat data distribusi. Hal ini diperlukan untuk menjaga integritas saldo stok gudang.")
    }
  }

  // Sinkronisasi status historis Sample Harian saat sample_cutoff_date diubah
  if (key === "sample_cutoff_date") {
    const current = await getAppSetting(key)
    if (current?.value === value) return { success: true }

    await prisma.$transaction(async (tx) => {
      const allSH = await tx.sampleHarian.findMany({
        include: { items: true },
      })
      
      const newCutoffStr = value || null
      
      for (const sh of allSH) {
        let shouldBeHistorical = false
        if (newCutoffStr) {
          const cutoffDate = new Date(newCutoffStr)
          cutoffDate.setHours(0, 0, 0, 0)
          const shDate = new Date(sh.tanggal)
          shDate.setHours(0, 0, 0, 0)
          if (shDate < cutoffDate) {
            shouldBeHistorical = true
          }
        }
        
        const oldIsHistorical = sh.is_historical || false
        
        if (oldIsHistorical && !shouldBeHistorical) {
          // Dari historical menjadi active -> potong stok net (keluar - kembali)
          for (const item of sh.items) {
            const net = item.qty_keluar - item.qty_kembali
            if (net > 0) {
              const stock_type = item.type === "cukai" ? "sample_cukai" : "sample_biasa"
              await mutateStock({
                tx,
                rokok_id:     item.rokok_id,
                tanggal:      sh.tanggal,
                jenis:        "out",
                qty:          net,
                source:       MUTATION_SOURCE.SAMPLE_HARIAN_KELUAR,
                stock_type,
                reference_id: sh.id,
                keterangan:   `Sample harian ${item.type} keluar (diaktifkan dari cutoff)`,
                user_id:      user.id,
              })
            }
          }
          await tx.sampleHarian.update({
            where: { id: sh.id },
            data: { is_historical: false },
          })
        } else if (!oldIsHistorical && shouldBeHistorical) {
          // Dari active menjadi historical -> kembalikan stok net (keluar - kembali)
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
                reference_id: sh.id,
                keterangan:   `Revert sample harian ${item.type} (dihistoriskan dari cutoff)`,
                user_id:      user.id,
                allowNegative: true,
              })
            }
          }
          await tx.sampleHarian.update({
            where: { id: sh.id },
            data: { is_historical: true },
          })
        }
      }
    }, { maxWait: 15000, timeout: 45000 })
  }
  
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })

  // Log action
  await prisma.auditLog.create({
    data: {
      entity_type: "AppSetting",
      entity_id: key,
      action: "UPDATE",
      user_id: user.id,
      user_name: user.name,
      new_values: { value }
    }
  })

  revalidatePath("/pengaturan")
  return { success: true }
}
