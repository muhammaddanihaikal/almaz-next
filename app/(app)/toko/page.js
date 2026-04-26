import { getTokoList } from "@/actions/toko"
import { getKonsinyasiList } from "@/actions/konsinyasi"
import TokoPage from "@/components/pages/TokoPage"

export const revalidate = 0

export default async function Page() {
  const [tokoList, konsinyasiList] = await Promise.all([
    getTokoList(),
    getKonsinyasiList(),
  ])
  return <TokoPage tokoList={tokoList} konsinyasiList={konsinyasiList} />
}
