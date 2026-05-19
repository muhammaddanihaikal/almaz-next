"use server"

import { prisma } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { revalidatePath } from "next/cache"

export async function getUserList() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, role: true, aktif: true, createdAt: true },
  })
}

export async function addUser(data) {
  const hashed = hashPassword(data.password)
  await prisma.user.create({
    data: {
      username: data.username,
      password: hashed,
      name:     data.name || null,
      role:     data.role,
    },
  })
  revalidatePath("/pengguna")
}

export async function updateUser(id, data) {
  const update = {
    username: data.username,
    name:     data.name || null,
    role:     data.role,
  }
  if (data.password) {
    update.password = hashPassword(data.password)
  }
  await prisma.user.update({ where: { id }, data: update })
  revalidatePath("/pengguna")
}

export async function toggleAktifUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: { aktif: true } })
  await prisma.user.update({ where: { id }, data: { aktif: !user.aktif } })
  revalidatePath("/pengguna")
}

export async function deleteUser(id) {
  await prisma.user.delete({ where: { id } })
  revalidatePath("/pengguna")
}
