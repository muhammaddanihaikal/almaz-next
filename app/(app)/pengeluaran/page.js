import { auth } from "@/lib/auth"
import { getPengeluaran } from "@/actions/pengeluaran"
import { getSesiList } from "@/actions/distribusi"
import { getTitipJualList } from "@/actions/titip_jual"
import PengeluaranPage from "@/components/pages/PengeluaranPage"

export const revalidate = 60

export default async function Page() {
  const [session, pengeluaranList, sesiList, titipJualList] = await Promise.all([
    auth(),
    getPengeluaran(),
    getSesiList(null),
    getTitipJualList(null),
  ])
  return <PengeluaranPage role={session?.user?.role} pengeluaranList={pengeluaranList} sesiList={sesiList} titipJualList={titipJualList} />
}
