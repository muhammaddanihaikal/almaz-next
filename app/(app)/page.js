import { getRokokList } from "@/actions/rokok"
import { getSesiListByDateRange } from "@/actions/distribusi"
import { getTitipJualListByDateRange } from "@/actions/titip_jual"
import { defaultDateRange } from "@/lib/utils"
import DashboardPage from "@/components/pages/DashboardPage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Dashboard",
}

function parseDate(value) {
  if (!value) return null
  const [year, month, day] = String(value).split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function getPreviousRange(range) {
  if (!range?.start || !range?.end) return null
  const start = parseDate(range.start)
  const end = parseDate(range.end)
  if (!start || !end || end < start) return null

  const days = Math.round((end - start) / 86400000) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - days + 1)

  return { start: formatDateInput(previousStart), end: formatDateInput(previousEnd) }
}

export default async function Page() {
  const initialRange = defaultDateRange("minggu_ini")
  const prevRange = getPreviousRange(initialRange)
  const fetchStart = prevRange?.start || initialRange.start
  const fetchEnd = initialRange.end

  const [rokokList, sesiList, titipJualList] = await Promise.all([
    getRokokList(),
    getSesiListByDateRange(fetchStart, fetchEnd),
    getTitipJualListByDateRange(fetchStart, fetchEnd),
  ])

  return (
    <DashboardPage
      sesiList={sesiList}
      titipJualList={titipJualList}
      rokokList={rokokList}
    />
  )
}
