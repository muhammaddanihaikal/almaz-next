import { getTokoList } from "@/actions/toko"
import TokoPage from "@/components/pages/TokoPage"

export const revalidate = 60

export default async function Page() {
  const tokoList = await getTokoList()
  return <TokoPage tokoList={tokoList} />
}
