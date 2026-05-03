import { getRetailList } from "@/actions/retail"
import { getTitipJualList } from "@/actions/titip_jual"
import RetailPage from "@/components/pages/RetailPage"

export const revalidate = 0

export default async function Page() {
  const [retailList, titipJualList] = await Promise.all([
    getRetailList(),
    getTitipJualList(),
  ])
  return <RetailPage retailList={retailList} titipJualList={titipJualList} />
}
