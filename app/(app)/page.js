import { getPenjualan } from "@/actions/penjualan"
import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getPengeluaran } from "@/actions/pengeluaran"
import DashboardPage from "@/components/pages/DashboardPage"

export const revalidate = 60

export default async function Page() {
  const [penjualan, retur, rokokList, pengeluaranList] = await Promise.all([
    getPenjualan(),
    getRetur(),
    getRokokList(),
    getPengeluaran(),
  ])
  return <DashboardPage penjualan={penjualan} retur={retur} rokokList={rokokList} pengeluaranList={pengeluaranList} />
}
