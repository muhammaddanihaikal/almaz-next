import { auth } from "@/lib/auth"
import { getTokoList, getUsedTokoIds } from "@/actions/toko"
import TokoPage from "@/components/pages/TokoPage"

export const revalidate = 0

export const metadata = {
  title: "Data Toko",
}

export default async function Page() {
  const [session, tokoList, usedTokoIds] = await Promise.all([
    auth(),
    getTokoList(),
    getUsedTokoIds(),
  ])
  return <TokoPage role={session?.user?.role} tokoList={tokoList} usedTokoIds={usedTokoIds} />
}
