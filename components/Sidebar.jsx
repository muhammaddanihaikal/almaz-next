"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutDashboard, Truck, PackageCheck, Cigarette,
  Users, CalendarCheck, Menu, X, ChevronDown, ChevronRight,
  Folder, Database, LogOut, ArrowDownCircle, Store,
  UserCog, HardDrive, ShieldCheck, Loader2,
} from "lucide-react"

import { useLoading } from "./LoadingProvider"

const ROLE_LABELS = { superadmin: "Super Admin", admin: "Admin", staff: "Staff" }

function buildMenus(role, titipJualCounts) {
  const menus = [
    { id: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
    {
      id: "group-operasional",
      label: "Operasional",
      icon: Folder,
      items: [
        { id: "distribusi",  href: "/distribusi",  label: "Distribusi",  icon: Truck           },
        { id: "titip-jual",  href: "/titip-jual",  label: "Titip Jual",  icon: PackageCheck, badges: titipJualCounts },
        { id: "pengeluaran", href: "/pengeluaran", label: "Pengeluaran", icon: ArrowDownCircle },
      ],
    },
    {
      id: "group-master",
      label: "Master",
      icon: Database,
      items: [
        { id: "rokok", href: "/rokok", label: "Rokok", icon: Cigarette },
        { id: "sales", href: "/sales", label: "Sales", icon: Users     },
        { id: "toko",  href: "/toko",  label: "Toko",  icon: Store     },
      ],
    },
    { id: "absensi", href: "/absensi", label: "Absensi", icon: CalendarCheck },
  ]

  if (role === "superadmin" || role === "admin") {
    const adminItems = []
    if (role === "superadmin") {
      adminItems.push({ id: "pengguna", href: "/pengguna", label: "Pengguna", icon: UserCog })
    }
    adminItems.push({ id: "backup", href: "/backup", label: "Backup DB", icon: HardDrive })

    menus.push({
      id: "group-admin",
      label: "Admin",
      icon: ShieldCheck,
      items: adminItems,
    })
  }

  return menus
}

export default function Sidebar({ role, userName, titipJualCounts }) {
  const pathname    = usePathname()
  const { isPending, loadingPath, navigate } = useLoading()
  const [clickedId, setClickedId]     = useState(null)
  
  const [mobileOpen, setMobileOpen]       = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut]       = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await signOut({ callbackUrl: "/login" })
  }
  const [openGroups, setOpenGroups] = useState({
    "group-operasional": true,
    "group-master":      true,
    "group-admin":       true,
  })

  const MENUS = buildMenus(role, titipJualCounts)

  const isActive    = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))

  const navLink = (item) => {
    const active = isActive(item.href)
    const loading = isPending && (clickedId === item.id || loadingPath === item.href)

    return (
      <button
        key={item.id}
        onClick={() => {
          setClickedId(item.id)
          setMobileOpen(false)
          navigate(item.href)
        }}
        className={
          "flex w-full items-center gap-3 rounded-lg py-2.5 pl-9 pr-3 text-sm font-medium transition-colors lg:pl-3 " +
          (active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900")
        }
      >
        <div className="flex flex-1 items-center gap-3">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-400" />
          ) : (
            <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-neutral-400"}`} strokeWidth={2} />
          )}
          <span>{item.label}</span>
        </div>
        {item.badges && (item.badges.red > 0 || item.badges.yellow > 0) && (
          <div className="flex gap-1">
            {item.badges.red > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-100 px-1 text-[10px] font-bold text-red-700">
                {item.badges.red}
              </span>
            )}
            {item.badges.yellow > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                {item.badges.yellow}
              </span>
            )}
          </div>
        )}
      </button>
    )
  }

  const renderItem = (item) => {
    if (item.items) {
      const isOpen      = openGroups[item.id]
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
            {isOpen
              ? <ChevronDown  className="h-4 w-4 shrink-0 text-neutral-400" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
            }
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

      {mobileOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={"fixed top-0 left-0 z-30 flex h-full flex-col border-r border-neutral-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-56 " + (mobileOpen ? "w-56 translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-xs font-bold tracking-tight text-white">A</div>
          <div className="hidden lg:block">
            <div className="text-sm font-semibold tracking-tight">ALMAZ</div>
            <div className="text-xs text-neutral-400">Management Distribusi</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {MENUS.map(renderItem)}
        </nav>

        {/* Footer: user info + logout */}
        <div className="border-t border-neutral-200 px-2 py-3 space-y-1">
          {userName && (
            <div className="px-3 py-2">
              <div className="text-xs font-medium text-neutral-900 truncate">{userName}</div>
              <div className="text-xs text-neutral-400">{ROLE_LABELS[role] || role}</div>
            </div>
          )}
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Konfirmasi logout */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!loggingOut) setConfirmLogout(false) }}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
            style={{ animation: "slideUp .22s cubic-bezier(.4,0,.2,1)" }}
          >
            <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>

            {/* Header strip */}
            <div className="bg-neutral-900 px-6 pt-6 pb-5 text-white">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <LogOut className="h-5 w-5 text-white" strokeWidth={2} />
              </div>
              <h3 className="text-center text-base font-semibold">Keluar dari ALMAZ?</h3>
              <p className="mt-1 text-center text-xs text-neutral-400">
                Sesi kamu akan diakhiri dan kamu perlu login ulang.
              </p>
            </div>

            {/* User info */}
            {userName && (
              <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">{userName}</div>
                  <div className="text-xs text-neutral-400">{ROLE_LABELS[role] || role}</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 px-6 py-4">
              <button
                onClick={() => setConfirmLogout(false)}
                disabled={loggingOut}
                className="flex-1 rounded-lg border border-neutral-200 bg-white py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:bg-neutral-600"
              >
                {loggingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    Keluar...
                  </>
                ) : (
                  <>
                    <LogOut className="h-4 w-4" strokeWidth={2} />
                    Ya, Keluar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
