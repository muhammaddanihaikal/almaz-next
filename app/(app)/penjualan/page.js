import { getDistribusi } from "@/actions/distribusi"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import PenjualanPage from "@/components/pages/PenjualanPage"

export const revalidate = 60

export default async function Page() {
  const [distribusi, rokokList, salesList] = await Promise.all([
    getDistribusi(),
    getRokokList(),
    getSalesList(),
  ])
  return <PenjualanPage distribusi={distribusi} rokokList={rokokList} salesList={salesList} />
}
