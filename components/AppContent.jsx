"use client"

import { useLoading } from "./LoadingProvider"
import { TableSkeleton, MutasiSkeleton, FormSkeleton } from "./Skeletons"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

export default function AppContent({ children }) {
  const { isPending, loadingPath } = useLoading()
  const pathname = usePathname()
  
  // We use a state to keep the previous children until the new ones are ready,
  // OR show the skeleton immediately if navigation is active.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return children

  // If we are pending AND the path is actually changing
  if (isPending && loadingPath && loadingPath !== pathname) {
    // Specific skeletons based on path
    if (loadingPath.includes("/mutasi")) return <MutasiSkeleton />
    
    // For other paths, we can distinguish by keywords
    // Most master data pages (rokok, sales, toko) use TableSkeleton
    // Some pages might be forms
    const isForm = loadingPath.includes("/baru") || loadingPath.includes("/edit") || loadingPath.includes("/tambah")
    if (isForm) return <FormSkeleton />

    return <TableSkeleton />
  }

  return children
}
