import { getUserList } from "@/actions/user"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PenggunaPage from "@/components/pages/PenggunaPage"

export default async function Page() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "superadmin") redirect("/")

  const users = await getUserList()
  return (
    <PenggunaPage
      users={users}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
