import { getMutasiStok } from "@/actions/rokok"
import MutasiStokPage from "@/components/pages/MutasiStokPage"
import { getJakartaToday } from "@/lib/utils"

export const metadata = {
  title: "Mutasi Stok | Almaz",
}

export default async function Page({ searchParams }) {
  const params = await searchParams
  const today = getJakartaToday()
  const start = params.start || today
  const end   = params.end || today
  const preset = params.preset || "hari_ini"
  const stockType = params.stock_type || "utama"

  const data = await getMutasiStok(start, end, stockType)

  return (
    <MutasiStokPage 
      initialData={data} 
      startDate={start} 
      endDate={end} 
      initialPreset={preset} 
      initialStockType={stockType}
    />
  )
}
