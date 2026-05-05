import { auth } from "@/lib/auth"
import { getTukarBarangList } from "@/actions/tukar-barang"
import { getSalesList } from "@/actions/sales"
import { getRokokList } from "@/actions/rokok"
import TukarBarangPage from "@/components/pages/TukarBarangPage"

export const revalidate = 60

export const metadata = {
  title: "Tukar Barang",
}

export default async function Page() {
  const [session, list, salesList, rokokList] = await Promise.all([
    auth(),
    getTukarBarangList(),
    getSalesList(),
    getRokokList(),
  ])
  return <TukarBarangPage role={session?.user?.role} list={list} salesList={salesList} rokokList={rokokList} />
}
