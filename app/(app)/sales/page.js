import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getSalesList } from "@/actions/sales"
import SalesPage from "@/components/pages/SalesPage"

export default async function Page() {
  const [salesList, distribusi, retur] = await Promise.all([
    getSalesList(),
    getDistribusi(),
    getRetur(),
  ])
  return <SalesPage salesList={salesList} distribusi={distribusi} retur={retur} />
}
