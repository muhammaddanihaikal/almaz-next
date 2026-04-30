"use client"

import { Card } from "@/components/ui"

export function Skeleton({ className }) {
  return (
    <div className={`animate-pulse bg-neutral-200 rounded-md ${className}`} />
  )
}

export function Shimmer({ className }) {
  return (
    <div className={`relative overflow-hidden bg-neutral-100 rounded-xl ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Shimmer className="h-8 w-48" />
          <Shimmer className="h-4 w-64" />
        </div>
        <Shimmer className="h-10 w-32 rounded-lg" />
      </div>
      
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-neutral-100 p-4 flex gap-4">
          {[1,2,3,4,5].map(i => <Shimmer key={i} className="h-4 flex-1" />)}
        </div>
        <div className="divide-y divide-neutral-100">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="p-4 flex gap-4 items-center">
              <Shimmer className="h-5 w-8" />
              <Shimmer className="h-5 flex-[2]" />
              <Shimmer className="h-5 flex-1" />
              <Shimmer className="h-5 flex-1" />
              <Shimmer className="h-5 w-24" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function MutasiSkeleton() {
  return (
    <div className="space-y-6">
      <Shimmer className="h-8 w-32 rounded-full" />
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Shimmer className="h-8 w-48" />
          <Shimmer className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Shimmer className="h-10 w-24 rounded-lg" />
          <Shimmer className="h-10 w-48 rounded-lg" />
        </div>
      </div>
      
      {[1,2].map(i => (
        <div key={i} className="border border-neutral-200 rounded-xl p-5 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shimmer className="h-10 w-10 rounded-lg" />
              <div className="space-y-1">
                <Shimmer className="h-4 w-40" />
                <Shimmer className="h-3 w-24" />
              </div>
            </div>
            <div className="flex gap-6">
              <Shimmer className="h-8 w-20" />
              <Shimmer className="h-8 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-4 w-64" />
      </div>
      
      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="space-y-2">
              <Shimmer className="h-3 w-24" />
              <Shimmer className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-24 w-full" />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
          <Shimmer className="h-10 w-24" />
          <Shimmer className="h-10 w-32" />
        </div>
      </Card>
    </div>
  )
}
