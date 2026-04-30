"use client"

import { createContext, useContext, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

const LoadingContext = createContext({
  isPending: false,
  loadingPath: null,
  navigate: () => {},
})

export function LoadingProvider({ children }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingPath, setLoadingPath] = useState(null)

  const navigate = (href) => {
    setLoadingPath(href)
    startTransition(() => {
      router.push(href)
    })
  }

  // Reset loadingPath when transition finishes
  // Note: transition finish happens when the component that uses isPending rerenders.
  // We'll handle resetting in a way that feels smooth.

  return (
    <LoadingContext.Provider value={{ isPending, loadingPath, navigate }}>
      {children}
    </LoadingContext.Provider>
  )
}

export const useLoading = () => useContext(LoadingContext)
