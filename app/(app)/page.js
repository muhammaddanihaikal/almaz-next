import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getPengeluaran } from "@/actions/pengeluaran"
import DashboardPage from "@/components/pages/DashboardPage"

export const revalidate = 60

export default async function Page() {
  const [distribusi, retur, rokokList, pengeluaranList] = await Promise.all([
    getDistribusi(),
    getRetur(),
    getRokokList(),
    getPengeluaran(),
  ])
  return <DashboardPage distribusi={distribusi} retur={retur} rokokList={rokokList} pengeluaranList={pengeluaranList} />
}
