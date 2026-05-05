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
      {isPending && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-1 overflow-hidden bg-neutral-200">
          <div 
            className="h-full bg-neutral-900 transition-all duration-500 ease-out"
            style={{ 
              width: "100%",
              animation: "loading-bar 2s infinite linear"
            }}
          />
          <style>{`
            @keyframes loading-bar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}
      {children}
    </LoadingContext.Provider>
  )
}

export const useLoading = () => useContext(LoadingContext)
