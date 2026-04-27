import { getTitipJualList } from "@/actions/titip_jual"
import { getSalesList } from "@/actions/sales"
import KonsinyasiPage from "@/components/pages/KonsinyasiPage"

export const revalidate = 0

export default async function Page() {
  const [titipJualList, salesList] = await Promise.all([
    getTitipJualList(),
    getSalesList(),
  ])
  return <KonsinyasiPage titipJualList={titipJualList} salesList={salesList} />
}
