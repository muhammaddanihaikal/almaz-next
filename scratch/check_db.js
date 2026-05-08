const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.sesiHarian.count();
  const first = await prisma.sesiHarian.findFirst();
  console.log('SesiHarian Count:', count);
  console.log('First Record:', first);
  process.exit(0);
}

check();
