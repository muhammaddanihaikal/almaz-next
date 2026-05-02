import { getTukarBarangList } from "@/actions/tukar-barang"
import { getSalesList } from "@/actions/sales"
import { getRokokList } from "@/actions/rokok"
import TukarBarangPage from "@/components/pages/TukarBarangPage"

export const revalidate = 60

export default async function Page() {
  const [list, salesList, rokokList] = await Promise.all([
    getTukarBarangList(),
    getSalesList(),
    getRokokList(),
  ])
  return <TukarBarangPage list={list} salesList={salesList} rokokList={rokokList} />
}
