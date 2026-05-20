import { auth } from "@/lib/auth"
import { getSampleHarianList } from "@/actions/sample-harian"
import { getRokokList } from "@/actions/rokok"
import { getAppSetting } from "@/actions/settings"
import SampleHarianPage from "@/components/pages/SampleHarianPage"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sample Harian",
}

export default async function Page() {
  const [session, list, rokokList, cutoffSetting] = await Promise.all([
    auth(),
    getSampleHarianList(),
    getRokokList(),
    getAppSetting("sample_cutoff_date")
  ])
  const sampleCutoffDate = cutoffSetting?.value || null
  return (
    <SampleHarianPage
      role={session?.user?.role}
      list={list}
      rokokList={rokokList}
      sampleCutoffDate={sampleCutoffDate}
    />
  )
}
