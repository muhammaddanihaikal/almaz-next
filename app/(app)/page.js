import { getSesiList } from "@/actions/distribusi"
import { getTitipJualList, getTitipJualJatuhTempo } from "@/actions/titip_jual"
import { getRokokList } from "@/actions/rokok"
import { getPengeluaran } from "@/actions/pengeluaran"
import DashboardPage from "@/components/pages/DashboardPage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const [sesiList, titipJualList, titipJualJatuhTempo, rokokList, pengeluaranList] = await Promise.all([
    getSesiList(),
    getTitipJualList(),
    getTitipJualJatuhTempo(),
    getRokokList(),
    getPengeluaran(),
  ])
  return (
    <DashboardPage
      sesiList={sesiList}
      titipJualList={titipJualList}
      titipJualJatuhTempo={titipJualJatuhTempo}
      rokokList={rokokList}
      pengeluaranList={pengeluaranList}
    />
  )
}
