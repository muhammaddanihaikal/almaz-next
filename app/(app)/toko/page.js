import { auth } from "@/lib/auth"
import { getTokoList } from "@/actions/toko"
import { getTitipJualList } from "@/actions/titip_jual"
import TokoPage from "@/components/pages/TokoPage"

export const revalidate = 0

export const metadata = {
  title: "Data Toko",
}

export default async function Page() {
  const [session, tokoList, titipJualList] = await Promise.all([
    auth(),
    getTokoList(),
    getTitipJualList(null),
  ])
  return <TokoPage role={session?.user?.role} tokoList={tokoList} titipJualList={titipJualList} />
}
