import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import BackupPage from "@/components/pages/BackupPage"

export default async function Page() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") redirect("/")
  return <BackupPage />
}
