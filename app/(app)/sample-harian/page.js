import { auth } from "@/lib/auth"
import { getSampleHarianListByRange } from "@/actions/sample-harian"
import { getRokokList } from "@/actions/rokok"
import { getAppSetting } from "@/actions/settings"
import { defaultDateRange } from "@/lib/utils"
import SampleHarianPage from "@/components/pages/SampleHarianPage"

export const revalidate = 0

export const metadata = {
  title: "Sample Harian",
}

export default async function Page() {
  const initialRange = defaultDateRange("bulan_ini")

  const [session, list, rokokList, cutoffSetting] = await Promise.all([
    auth(),
    getSampleHarianListByRange(initialRange.start, initialRange.end),
    getRokokList(),
    getAppSetting("sample_cutoff_date"),
  ])
  const sampleCutoffDate = cutoffSetting?.value || null
  return (
    <SampleHarianPage
      role={session?.user?.role}
      initialList={list}
      initialRange={initialRange}
      rokokList={rokokList}
      sampleCutoffDate={sampleCutoffDate}
    />
  )
}
