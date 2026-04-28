import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import BackupPage from "@/components/pages/BackupPage"

export default async function Page() {
  const session = await auth()
  if (!session || !["superadmin", "admin"].includes(session.user.role)) redirect("/")
  return <BackupPage />
}
