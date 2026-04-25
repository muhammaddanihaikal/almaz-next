import { getPenjualan } from "@/actions/penjualan"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import PenjualanPage from "@/components/pages/PenjualanPage"

export const revalidate = 60

export default async function Page() {
  const [penjualan, rokokList, salesList] = await Promise.all([
    getPenjualan(),
    getRokokList(),
    getSalesList(),
  ])
  return <PenjualanPage penjualan={penjualan} rokokList={rokokList} salesList={salesList} />
}
