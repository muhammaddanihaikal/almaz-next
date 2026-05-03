import { getSesiList } from "@/actions/distribusi"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import { getRetailList } from "@/actions/retail"
import DistribusiPage from "@/components/pages/DistribusiPage"

export const revalidate = 0

export default async function Page() {
  const [sesiList, rokokList, salesList, retailList] = await Promise.all([
    getSesiList(),
    getRokokList(),
    getSalesList(),
    getRetailList(),
  ])
  return <DistribusiPage sesiList={sesiList} rokokList={rokokList} salesList={salesList} retailList={retailList} />
}
