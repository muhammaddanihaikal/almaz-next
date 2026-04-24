import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getTokoList } from "@/actions/toko"
import { getSalesList } from "@/actions/sales"
import DistribusiPage from "@/components/pages/DistribusiPage"

export default async function Page() {
  const [distribusi, retur, rokokList, tokoList, salesList] = await Promise.all([
    getDistribusi(),
    getRetur(),
    getRokokList(),
    getTokoList(),
    getSalesList(),
  ])
  return <DistribusiPage distribusi={distribusi} retur={retur} rokokList={rokokList} tokoList={tokoList} salesList={salesList} />
}
