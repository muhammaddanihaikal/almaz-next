import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getRokokList } from "@/actions/rokok"
import { getTokoList } from "@/actions/toko"
import DashboardPage from "@/components/pages/DashboardPage"

export default async function Page() {
  const [distribusi, retur, rokokList, tokoList] = await Promise.all([
    getDistribusi(),
    getRetur(),
    getRokokList(),
    getTokoList(),
  ])
  return <DashboardPage distribusi={distribusi} retur={retur} rokokList={rokokList} tokoList={tokoList} />
}
