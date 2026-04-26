import { getKonsinyasiList } from "@/actions/konsinyasi"
import { getSalesList } from "@/actions/sales"
import KonsinyasiPage from "@/components/pages/KonsinyasiPage"

export const revalidate = 0

export default async function Page() {
  const [konsinyasiList, salesList] = await Promise.all([
    getKonsinyasiList(),
    getSalesList(),
  ])
  return <KonsinyasiPage konsinyasiList={konsinyasiList} salesList={salesList} />
}
