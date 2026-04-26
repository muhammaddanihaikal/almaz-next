import { getSesiList } from "@/actions/distribusi"
import { getKonsinyasiJatuhTempo } from "@/actions/konsinyasi"
import { getRokokList } from "@/actions/rokok"
import { getPengeluaran } from "@/actions/pengeluaran"
import DashboardPage from "@/components/pages/DashboardPage"

export const revalidate = 0

export default async function Page() {
  const [sesiList, konsinyasiJatuhTempo, rokokList, pengeluaranList] = await Promise.all([
    getSesiList(),
    getKonsinyasiJatuhTempo(),
    getRokokList(),
    getPengeluaran(),
  ])
  return (
    <DashboardPage
      sesiList={sesiList}
      konsinyasiJatuhTempo={konsinyasiJatuhTempo}
      rokokList={rokokList}
      pengeluaranList={pengeluaranList}
    />
  )
}
