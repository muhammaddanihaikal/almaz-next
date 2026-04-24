import { getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import { getTokoList } from "@/actions/toko"
import TokoPage from "@/components/pages/TokoPage"

export default async function Page() {
  const [tokoList, distribusi, retur] = await Promise.all([
    getTokoList(),
    getDistribusi(),
    getRetur(),
  ])
  return <TokoPage tokoList={tokoList} distribusi={distribusi} retur={retur} />
}
