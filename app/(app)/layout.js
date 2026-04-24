import Sidebar from "@/components/Sidebar"

export default function AppLayout({ children }) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-neutral-50 text-neutral-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
