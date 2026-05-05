import { auth } from "@/lib/auth"
import { getAbsensi } from "@/actions/absensi"
import { getSalesList } from "@/actions/sales"
import AbsensiPage from "@/components/pages/AbsensiPage"

export const revalidate = 60

export default async function Page() {
  const [session, absensiList, salesList] = await Promise.all([
    auth(),
    getAbsensi(),
    getSalesList(),
  ])
  return <AbsensiPage role={session?.user?.role} absensiList={absensiList} salesList={salesList} />
}
