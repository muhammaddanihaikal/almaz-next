import { auth } from "@/lib/auth"
import { getSalesList } from "@/actions/sales"
import { getSesiList } from "@/actions/distribusi"
import SalesPage from "@/components/pages/SalesPage"

export const revalidate = 0

export const metadata = {
  title: "Data Sales",
}

export default async function Page() {
  const [session, salesList, sesiList] = await Promise.all([
    auth(),
    getSalesList(),
    getSesiList(),
  ])
  return <SalesPage role={session?.user?.role} salesList={salesList} sesiList={sesiList} />
}
