import { getPengeluaran } from "@/actions/pengeluaran"
import { getSesiList } from "@/actions/distribusi"
import { getTitipJualList } from "@/actions/titip_jual"
import PengeluaranPage from "@/components/pages/PengeluaranPage"

export const revalidate = 60

export default async function Page() {
  const [pengeluaranList, sesiList, titipJualList] = await Promise.all([
    getPengeluaran(),
    getSesiList(),
    getTitipJualList(),
  ])
  return <PengeluaranPage pengeluaranList={pengeluaranList} sesiList={sesiList} titipJualList={titipJualList} />
}
