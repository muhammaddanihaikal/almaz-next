import { getRokokList, getUsedRokokIds, getMutasiHariIni } from "@/actions/rokok"
import RokokPage from "@/components/pages/RokokPage"

export const dynamic = "force-dynamic"

export default async function Page() {
  const [rokokList, usedIds, mutasiHariIni] = await Promise.all([
    getRokokList(),
    getUsedRokokIds(),
    getMutasiHariIni(),
  ])
  return <RokokPage rokokList={rokokList} usedIds={usedIds} mutasiHariIni={mutasiHariIni} />
}
