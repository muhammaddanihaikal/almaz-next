import { getSesiList } from "@/actions/distribusi"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import { getTokoList } from "@/actions/toko"
import { getTukarBarangList } from "@/actions/tukar-barang"
import DistribusiPage from "@/components/pages/DistribusiPage"

export const revalidate = 0

export const metadata = {
  title: "Distribusi",
}

export default async function Page() {
  const [session, sesiList, rokokList, salesList, tokoList, tukarBarangList] = await Promise.all([
    auth(),
    getSesiList(),
    getRokokList(),
    getSalesList(),
    getTokoList(),
    getTukarBarangList(),
  ])
  return <DistribusiPage role={session?.user?.role} sesiList={sesiList} rokokList={rokokList} salesList={salesList} tokoList={tokoList} tukarBarangList={tukarBarangList} />
}
