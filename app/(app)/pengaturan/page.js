import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import PengaturanPage from "@/components/pages/PengaturanPage"
import { getAppSetting } from "@/actions/settings"

export const metadata = {
  title: "Pengaturan | ALMAZ",
}

export default async function Page() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") {
    redirect("/")
  }

  const setting = await getAppSetting("stock_cutoff_date")
  const stockCutoffDate = setting?.value || null
  const hasData = await prisma.sesiHarian.findFirst()

  return <PengaturanPage initialStockCutoffDate={stockCutoffDate} hasData={!!hasData} />
}
