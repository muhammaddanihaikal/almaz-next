import { getSesiList } from "@/actions/distribusi"
import { getTitipJualJatuhTempo } from "@/actions/titip_jual"
import { getRokokList } from "@/actions/rokok"
import { getPengeluaran } from "@/actions/pengeluaran"
import DashboardPage from "@/components/pages/DashboardPage"

export const revalidate = 0

export default async function Page() {
  const [sesiList, titipJualJatuhTempo, rokokList, pengeluaranList] = await Promise.all([
    getSesiList(),
    getTitipJualJatuhTempo(),
    getRokokList(),
    getPengeluaran(),
  ])
  return (
    <DashboardPage
      sesiList={sesiList}
      titipJualJatuhTempo={titipJualJatuhTempo}
      rokokList={rokokList}
      pengeluaranList={pengeluaranList}
    />
  )
}
