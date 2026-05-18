import { auth } from "@/lib/auth"
import { getSampleHarianList } from "@/actions/sample-harian"
import { getRokokList } from "@/actions/rokok"
import SampleHarianPage from "@/components/pages/SampleHarianPage"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sample Harian",
}

export default async function Page() {
  const [session, list, rokokList] = await Promise.all([
    auth(),
    getSampleHarianList(),
    getRokokList(),
  ])
  return <SampleHarianPage role={session?.user?.role} list={list} rokokList={rokokList} />
}
