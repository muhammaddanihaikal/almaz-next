"use client"

import { useState, useRef } from "react"

export default function RokokItemsTooltip({ items, fieldName = "rokok" }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef(null)

  const handleMouseEnter = () => {
    if (tooltipRef.current) {
      setShowTooltip(true)
    }
  }

  return (
    <div className="space-y-0.5">
      {items.slice(0, 3).map((it, i) => (
        <div key={i} className="text-xs text-neutral-700">
          {it[fieldName]} ×{it.qty || it.qty_keluar || 1}
        </div>
      ))}
      {items.length > 3 && (
        <div
          ref={tooltipRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setShowTooltip(false)}
          className="text-xs text-neutral-500 font-medium cursor-pointer relative"
        >
          +{items.length - 3} lebih
          {showTooltip && (
            <div className="fixed bg-neutral-900 text-white text-xs rounded px-3 py-2 z-50 shadow-lg w-72" style={{
              left: `${tooltipRef.current?.getBoundingClientRect().left}px`,
              top: `${tooltipRef.current?.getBoundingClientRect().bottom + 8}px`
            }}>
              {items.map((it, i) => (
                <div key={i} className="py-1">
                  {it[fieldName]} ×{it.qty || it.qty_keluar || 1}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
