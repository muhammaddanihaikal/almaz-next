import { getRokokList } from "@/actions/rokok"
import DashboardPage from "@/components/pages/DashboardPage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Dashboard",
}

export default async function Page() {
  const rokokList = await getRokokList()
  return (
    <DashboardPage
      sesiList={[]}
      titipJualList={[]}
      rokokList={rokokList}
    />
  )
}
