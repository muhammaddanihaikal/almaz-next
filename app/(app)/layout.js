export const revalidate = 0

import { auth } from "@/lib/auth"
import Sidebar from "@/components/Sidebar"
import { getTitipJualNotificationCounts } from "@/actions/titip_jual"
import { LoadingProvider } from "@/components/LoadingProvider"
import AppContent from "@/components/AppContent"
import { prisma } from "@/lib/db"

export default async function AppLayout({ children }) {
  const [session, counts, activeDistribusiCount, activeSampleHarianCount] = await Promise.all([
    auth(),
    getTitipJualNotificationCounts(),
    prisma.sesiHarian.count({ where: { status: "aktif" } }),
    prisma.sampleHarian.count({ where: { status: "buka" } }),
  ])

  return (
    <LoadingProvider>
      <div className="flex flex-col lg:flex-row min-h-screen bg-neutral-50 text-neutral-900">
        <Sidebar
          role={session?.user?.role}
          userName={session?.user?.name}
          titipJualCounts={counts}
          activeDistribusiCount={activeDistribusiCount}
          activeSampleHarianCount={activeSampleHarianCount}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
              <AppContent>
                {children}
              </AppContent>
            </div>
          </main>
        </div>
      </div>
    </LoadingProvider>
  )
}
