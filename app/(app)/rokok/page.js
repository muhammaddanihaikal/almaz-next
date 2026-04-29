import { getRokokList, getUsedRokokIds } from "@/actions/rokok"
import RokokPage from "@/components/pages/RokokPage"

export const dynamic = "force-dynamic"

export default async function Page() {
  const [rokokList, usedIds] = await Promise.all([
    getRokokList(),
    getUsedRokokIds(),
  ])
  return <RokokPage rokokList={rokokList} usedIds={usedIds} />
}
