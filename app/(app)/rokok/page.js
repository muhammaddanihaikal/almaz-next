import { auth } from "@/lib/auth"
import { getRokokList, getUsedRokokIds, getMutasiHariIni } from "@/actions/rokok"
import RokokPage from "@/components/pages/RokokPage"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Data Rokok",
}

export default async function Page() {
  const [session, rokokList, usedIds, mutasiHariIni] = await Promise.all([
    auth(),
    getRokokList(),
    getUsedRokokIds(),
    getMutasiHariIni(),
  ])
  return <RokokPage role={session?.user?.role} rokokList={rokokList} usedIds={usedIds} mutasiHariIni={mutasiHariIni} />
}
