import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import ReturPage from "@/components/pages/ReturPage"

export const revalidate = 60

export default async function Page() {
  const [retur, rokokList, salesList] = await Promise.all([
    getRetur(),
    getRokokList(),
    getSalesList(),
  ])
  return <ReturPage retur={retur} rokokList={rokokList} salesList={salesList} />
}
