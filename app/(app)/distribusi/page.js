import { auth } from "@/lib/auth"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import { getTokoList } from "@/actions/toko"
import { getAppSetting } from "@/actions/settings"
import { getSesiListLightweight } from "@/actions/distribusi"
import { defaultDateRange } from "@/lib/utils"
import DistribusiPage from "@/components/pages/DistribusiPage"

export const revalidate = 0

export const metadata = {
  title: "Distribusi",
}

export default async function Page() {
  const initialRange = defaultDateRange("minggu_ini")
  
  const [session, rokokList, salesList, tokoList, settingCutoff, initialSesiList] = await Promise.all([
    auth(),
    getRokokList(),
    getSalesList(),
    getTokoList(),
    getAppSetting("stock_cutoff_date"),
    getSesiListLightweight(initialRange.start, initialRange.end),
  ])
  
  return (
    <DistribusiPage 
      role={session?.user?.role} 
      rokokList={rokokList} 
      salesList={salesList} 
      tokoList={tokoList} 
      stockCutoffSetting={settingCutoff} 
      initialSesiList={initialSesiList} 
    />
  )
}
