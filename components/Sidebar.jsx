"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutDashboard, ShoppingCart, Undo2, Cigarette,
  Users, CalendarCheck, Menu, X, ChevronDown, ChevronRight,
  Folder, Database, LogOut, ArrowDownCircle, PackageOpen,
} from "lucide-react"

const MENUS = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "group-operasional",
    label: "Operasional",
    icon: Folder,
    items: [
      { id: "barang-keluar", href: "/barang-keluar", label: "Barang Keluar", icon: PackageOpen     },
      { id: "penjualan",     href: "/penjualan",     label: "Penjualan",     icon: ShoppingCart    },
      { id: "retur",         href: "/retur",          label: "Retur",         icon: Undo2           },
      { id: "pengeluaran",   href: "/pengeluaran",    label: "Pengeluaran",   icon: ArrowDownCircle },
    ],
  },
  {
    id: "group-master",
    label: "Master",
    icon: Database,
    items: [
      { id: "rokok", href: "/rokok", label: "Rokok", icon: Cigarette },
      { id: "sales", href: "/sales", label: "Sales", icon: Users     },
    ],
  },
  { id: "absensi", href: "/absensi", label: "Absensi", icon: CalendarCheck },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState({ "group-operasional": true, "group-master": true })

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))

  const renderItem = (item) => {
    if (item.items) {
      const isOpen = openGroups[item.id]
      const activeChild = item.items.some((i) => isActive(i.href))
      return (
        <div key={item.id} className="mb-1 space-y-1">
          <button
            onClick={() => toggleGroup(item.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-neutral-700 hover:bg-neutral-100 ${activeChild ? "bg-neutral-50" : ""}`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={2} />
              <span>{item.label}</span>
            </div>
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
          </button>
          {isOpen && (
            <div className="space-y-0.5 lg:pl-4">
              {item.items.map((sub) => navLink(sub))}
            </div>
          )}
        </div>
      )
    }
    return navLink(item)
  }

  const navLink = (item) => {
    const active = isActive(item.href)
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={
          "flex w-full items-center gap-3 rounded-lg py-2.5 pl-9 pr-3 text-sm font-medium transition-colors lg:pl-3 " +
          (active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900")
        }
      >
        <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-neutral-400"}`} strokeWidth={2} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-xs font-bold text-white">A</div>
          <span className="text-sm font-semibold tracking-tight">ALMAZ</span>
        </div>
        <button onClick={() => setMobileOpen((o) => !o)} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={"fixed top-0 left-0 z-30 flex h-full flex-col border-r border-neutral-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-56 " + (mobileOpen ? "w-56 translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-xs font-bold tracking-tight text-white">A</div>
          <div className="hidden lg:block">
            <div className="text-sm font-semibold tracking-tight">ALMAZ</div>
            <div className="text-xs text-neutral-400">Management Penjualan</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {MENUS.map(renderItem)}
        </nav>

        <div className="border-t border-neutral-200 px-2 py-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  )
}
