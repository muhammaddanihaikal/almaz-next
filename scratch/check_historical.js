const { prisma } = require("../lib/db");
const { getSesiList } = require("../actions/distribusi");

async function check() {
  const allSesi = await prisma.sesiHarian.findMany({
    select: { id: true, tanggal: true, is_historical: true }
  });
  console.log("Total sesi in DB:", allSesi.length);
  console.log("Historical sessions:", allSesi.filter(s => s.is_historical).length);
  
  const sesiList = await getSesiList();
  console.log("Sesi from getSesiList:", sesiList.length);
  console.log("Historical sessions in list:", sesiList.filter(s => s.is_historical).length);
}

check().catch(console.error);
