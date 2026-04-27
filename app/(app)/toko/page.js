import { getTokoList } from "@/actions/toko"
import { getTitipJualList } from "@/actions/titip_jual"
import TokoPage from "@/components/pages/TokoPage"

export const revalidate = 0

export default async function Page() {
  const [tokoList, titipJualList] = await Promise.all([
    getTokoList(),
    getTitipJualList(),
  ])
  return <TokoPage tokoList={tokoList} titipJualList={titipJualList} />
}
