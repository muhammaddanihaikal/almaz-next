import { getSalesList } from "@/actions/sales"
import { getSesiList } from "@/actions/distribusi"
import SalesPage from "@/components/pages/SalesPage"

export const revalidate = 0

export default async function Page() {
  const [salesList, sesiList] = await Promise.all([
    getSalesList(),
    getSesiList(),
  ])
  return <SalesPage salesList={salesList} sesiList={sesiList} />
}
