"use server"

import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

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
