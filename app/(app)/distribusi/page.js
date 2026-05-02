import { getSesiList } from "@/actions/distribusi"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import { getTokoList } from "@/actions/toko"
import { getTukarBarangList } from "@/actions/tukar-barang"
import DistribusiPage from "@/components/pages/DistribusiPage"

export const revalidate = 0

export default async function Page() {
  const [sesiList, rokokList, salesList, tokoList, tukarBarangList] = await Promise.all([
    getSesiList(),
    getRokokList(),
    getSalesList(),
    getTokoList(),
    getTukarBarangList(),
  ])
  return <DistribusiPage sesiList={sesiList} rokokList={rokokList} salesList={salesList} tokoList={tokoList} tukarBarangList={tukarBarangList} />
}
