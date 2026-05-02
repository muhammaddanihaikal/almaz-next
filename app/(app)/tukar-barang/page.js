import { getTukarBarangList } from "@/actions/tukar-barang"
import { getSesiList } from "@/actions/distribusi"
import { getRokokList } from "@/actions/rokok"
import { getTokoList } from "@/actions/toko"
import TukarBarangPage from "@/components/pages/TukarBarangPage"

export const revalidate = 60

export default async function Page() {
  const [list, sesiList, rokokList, tokoList] = await Promise.all([
    getTukarBarangList(),
    getSesiList(),
    getRokokList(),
    getTokoList(),
  ])
  return (
    <TukarBarangPage
      list={list}
      sesiList={sesiList}
      rokokList={rokokList}
      tokoList={tokoList}
    />
  )
}
