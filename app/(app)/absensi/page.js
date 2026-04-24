import { getAbsensi } from "@/actions/absensi"
import { getSalesList } from "@/actions/sales"
import AbsensiPage from "@/components/pages/AbsensiPage"

export const revalidate = 60

export default async function Page() {
  const [absensiList, salesList] = await Promise.all([
    getAbsensi(),
    getSalesList(),
  ])
  return <AbsensiPage absensiList={absensiList} salesList={salesList} />
}
