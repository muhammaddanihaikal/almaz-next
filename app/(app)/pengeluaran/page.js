import { getPengeluaran } from "@/actions/pengeluaran"
import PengeluaranPage from "@/components/pages/PengeluaranPage"

export const revalidate = 60

export default async function Page() {
  const pengeluaranList = await getPengeluaran()
  return <PengeluaranPage pengeluaranList={pengeluaranList} />
}
