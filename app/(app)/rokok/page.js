import { getRokokList } from "@/actions/rokok"
import { getSesiList as getDistribusi } from "@/actions/distribusi"
import { getRetur } from "@/actions/retur"
import RokokPage from "@/components/pages/RokokPage"

export const revalidate = 60

export default async function Page() {
  const [rokokList, distribusi, retur] = await Promise.all([
    getRokokList(),
    getDistribusi(),
    getRetur(),
  ])
  return <RokokPage rokokList={rokokList} distribusi={distribusi} retur={retur} />
}
