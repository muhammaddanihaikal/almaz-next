import { getBarangKeluar } from "@/actions/barang-keluar"
import { getRokokList } from "@/actions/rokok"
import { getSalesList } from "@/actions/sales"
import BarangKeluarPage from "@/components/pages/BarangKeluarPage"

export const revalidate = 60

export default async function Page() {
  const [barangKeluar, rokokList, salesList] = await Promise.all([
    getBarangKeluar(),
    getRokokList(),
    getSalesList(),
  ])
  return <BarangKeluarPage barangKeluar={barangKeluar} rokokList={rokokList} salesList={salesList} />
}
