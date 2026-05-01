import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getAuditLogs, getAuditUsers } from "@/actions/audit"
import RiwayatPage from "@/components/pages/RiwayatPage"

export const metadata = { title: "Riwayat Perubahan" }

export default async function Page() {
  const session = await auth()
  if (!session?.user?.role || session.user.role === "staff") redirect("/")

  const today = new Date().toISOString().split("T")[0]
  const [logs, users] = await Promise.all([
    getAuditLogs({ startDate: today, endDate: today }),
    getAuditUsers(),
  ])

  return <RiwayatPage initialLogs={logs} users={users} />
}
