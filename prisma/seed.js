const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash("admin123", 10)
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", password, name: "Administrator" },
  })
  console.log("Seed done: user admin / admin123")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
