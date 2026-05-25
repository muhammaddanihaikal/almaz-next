import { auth } from "@/lib/auth"
import { getTitipJualList } from "@/actions/titip_jual"
import { getSalesList } from "@/actions/sales"
import { getRokokList } from "@/actions/rokok"
import KonsinyasiPage from "@/components/pages/KonsinyasiPage"

export const revalidate = 0

export const metadata = {
  title: "Titip Jual",
}

export default async function Page() {
  const [session, titipJualList, salesList, rokokList] = await Promise.all([
    auth(),
    getTitipJualList(),
    getSalesList(),
    getRokokList(),
  ])
  return <KonsinyasiPage role={session?.user?.role} titipJualList={titipJualList} salesList={salesList} rokokList={rokokList} />
}
