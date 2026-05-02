import { getTukarBarangList } from "@/actions/tukar-barang"
import { getSalesList } from "@/actions/sales"
import TukarBarangPage from "@/components/pages/TukarBarangPage"

export const revalidate = 60

export default async function Page() {
  const [list, salesList] = await Promise.all([
    getTukarBarangList(),
    getSalesList(),
  ])
  return <TukarBarangPage list={list} salesList={salesList} />
}
