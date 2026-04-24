import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getTokoList } from "@/actions/toko"
import { getSalesList } from "@/actions/sales"
import ReturPage from "@/components/pages/ReturPage"

export default async function Page() {
  const [distribusi, retur, rokokList, tokoList, salesList] = await Promise.all([
    getDistribusi(),
    getRetur(),
    getRokokList(),
    getTokoList(),
    getSalesList(),
  ])
  return <ReturPage distribusi={distribusi} retur={retur} rokokList={rokokList} tokoList={tokoList} salesList={salesList} />
}
