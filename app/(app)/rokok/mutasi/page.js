import { getMutasiStok } from "@/actions/rokok"
import MutasiStokPage from "@/components/pages/MutasiStokPage"

export const metadata = {
  title: "Mutasi Stok | Almaz",
}

export default async function Page({ searchParams }) {
  const params = await searchParams
  const today = new Date().toISOString().split("T")[0]
  const start = params.start || today
  const end   = params.end || today
  const preset = params.preset || "hari_ini"

  const data = await getMutasiStok(start, end)

  return <MutasiStokPage initialData={data} startDate={start} endDate={end} initialPreset={preset} />
}
