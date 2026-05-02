import { getTukarBarangList } from "@/actions/tukar-barang"
import { getSalesList } from "@/actions/sales"
import { getTokoList } from "@/actions/toko"
import TukarBarangPage from "@/components/pages/TukarBarangPage"

export const revalidate = 60

export default async function Page() {
  const [list, tokoList, salesList] = await Promise.all([
    getTukarBarangList(),
    getTokoList(),
    getSalesList(),
  ])
  return <TukarBarangPage list={list} tokoList={tokoList} salesList={salesList} />
}
