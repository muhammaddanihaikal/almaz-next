"use server"

import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

export async function getUserList() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, role: true, aktif: true, createdAt: true },
  })
}

export async function addUser(data) {
  const hashed = await bcrypt.hash(data.password, 10)
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
    update.password = await bcrypt.hash(data.password, 10)
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
